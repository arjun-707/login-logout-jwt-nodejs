const
    express = require("express"),
    exporter = require("../lib/exporter.js")('delivery'); // app name must be passed
    
express_route = express.Router();

var __CONFIG = exporter.__CONFIG;
var STANDARD_RESPONSE = __CONFIG.standard_response;
var ORDER_QUEUE = __CONFIG.rabbit_mq.queues.order;
var RESPONSE_STATUS = __CONFIG.response_status;
/* 
var MONGO_CONFIG = __CONFIG.database.mongo.explorer.url;
var RABBITMQ_CONFIG = __CONFIG.rabbit_mq.credential_url.explorer;
 */

// pass RABBITMQ_CONFIG if rabbitmq is on different server
exporter.rbmqConnection();  // make rabbitmq connection

// pass MONGO_CONFIG if mongodb is on different server
var mongoDB = exporter.mongoConnection();  // make mongo connection

exporter.redisConnection(); // make redis connection

if (mongoDB) {
    // first register your schema in schema.js file
    const SCHEMAS = require('../schema/schemas');
    var orderSchema = exporter.createMongoSchema(mongoDB, SCHEMAS.order.schema, SCHEMAS.order.coll_name);
    var agentInfoSchema = exporter.createMongoSchema(mongoDB, SCHEMAS.agent_info.schema, SCHEMAS.agent_info.coll_name);
    var agentWorkDetailSchema = exporter.createMongoSchema(mongoDB, SCHEMAS.agent_work_info.schema, SCHEMAS.agent_work_info.coll_name);
    if (!orderSchema || !agentInfoSchema|| !agentWorkDetailSchema) {
        exporter.logNow(`Application stopped due to Mongo Schema Error : ${orderSchema}, ${agentInfoSchema}, ${agentWorkDetailSchema}`);
        process.exit()
    }
}
else {
    exporter.logNow(`Application stopped due to : ${mongoDB}`);
    process.exit()
}
// assume we have following products
const PRODUCTS = {
    p1: {id: 1, name:"A1", brand : "B1", type: "C1", amount: 100},
    p2: {id: 2, name:"A2", brand : "B2", type: "C2", amount: 200},
    p3: {id: 3, name:"A3", brand : "B3", type: "C3", amount: 300},
    p4: {id: 4, name:"A4", brand : "B4", type: "C4", amount: 400},
    p5: {id: 5, name:"A5", brand : "B5", type: "C5", amount: 500},
    p6: {id: 6, name:"A6", brand : "B6", type: "C6", amount: 600}
}
express_route.post('/request', async (req, res) => {
    let param = req.body;
    param = JSON.stringify(param) === JSON.stringify({}) ? req.query : param;

    // validating parameter
    if (!param.hasOwnProperty('product_id') && typeof param.product_id == 'undefined' || param.product_id.trim() == '') {
        delete STANDARD_RESPONSE.track_id;
        STANDARD_RESPONSE.error = true;
        STANDARD_RESPONSE.msg = `Invalid Product id : ${param.product_id}`;
        res.send(STANDARD_RESPONSE);
        process.send({ cmd: 'notifyOrderRequest' });
        return;
    }
    if (orderSchema) {
        let product_id = param.product_id;
        let orderSchemaMongo = new orderSchema({ product: PRODUCTS[product_id] });
        let err_msg = 'Something went wrong. Please try after sometime';
        try {
            var lastDoc = await orderSchemaMongo.save(); // saving into database
        }
        catch(mongoError) {
            delete STANDARD_RESPONSE.track_id;
            STANDARD_RESPONSE.error = true;
            STANDARD_RESPONSE.msg = err_msg;
            exporter.logNow(`Mongo Insert Error: ${mongoError}`);
            res.send(STANDARD_RESPONSE);
            process.send({ cmd: 'notifyOrderRequest' });
            return;
        }

        try {
            lastDoc = {
                order_id: lastDoc._id, 
                product_id: PRODUCTS[product_id]
            };
            await exporter.rabbitmqMessagePush(lastDoc, ORDER_QUEUE); // insert data into queue
        }
        catch(rbmqError) {
            STANDARD_RESPONSE.track_id = lastDoc.order_id;
            STANDARD_RESPONSE.error = true;
            STANDARD_RESPONSE.msg = err_msg;
            exporter.logNow(`RabbitMQ Push Error: ${rbmqError}`);
            res.send(STANDARD_RESPONSE);
            process.send({ cmd: 'notifyOrderRequest' });
            return;
        }
        try {
            await exporter.setMultiKeyValuesIntoRedis(lastDoc.order_id.toString(), { 'product_id': product_id.toString(), 'status': 0 });
            STANDARD_RESPONSE.track_id = lastDoc.order_id;
            STANDARD_RESPONSE.error = false;
            STANDARD_RESPONSE.msg = 'order successful';
            res.send(STANDARD_RESPONSE);
            process.send({ cmd: 'notifyOrderRequest' });
            return;
        }
        catch(redisError) {
            STANDARD_RESPONSE.track_id = lastDoc.order_id;
            STANDARD_RESPONSE.error = true;
            STANDARD_RESPONSE.msg = err_msg;
            exporter.logNow(`Redis Push Error: ${redisError}`);
            res.send(STANDARD_RESPONSE);
            process.send({ cmd: 'notifyOrderRequest' });
            return;
        }
    }
    else {
        delete STANDARD_RESPONSE.track_id;
        STANDARD_RESPONSE.error = true;
        STANDARD_RESPONSE.msg = err_msg;
        exporter.logNow(`Schema Error: ${orderSchema}`);
        res.send(STANDARD_RESPONSE);
        process.send({ cmd: 'notifySpeedRequest' });
        return;
    }
});
express_route.post('/status', (req, res) => {

    let param = req.body;
    param = JSON.stringify(param) === JSON.stringify({}) ? req.query : param;

    if (param.hasOwnProperty('track_id') && typeof param.track_id != 'undefined' && param.track_id.trim() != '') {
        exporter.getKeysFromRedis(param.track_id)
        .then((fetchedDoc) => {               
            STANDARD_RESPONSE.track_id = param.track_id;
            STANDARD_RESPONSE.product_id = fetchedDoc.product_id;
            STANDARD_RESPONSE.status = fetchedDoc.status;
            STANDARD_RESPONSE.msg = RESPONSE_STATUS[fetchedDoc.status.toString()];
            STANDARD_RESPONSE.error = false;
            res.send(STANDARD_RESPONSE);
            process.send({ cmd: 'notifyOrderStatus' });
            return;
        })
        .catch((fetError) => {
            STANDARD_RESPONSE.track_id = param.track_id;
            STANDARD_RESPONSE.error = true;
            STANDARD_RESPONSE.msg = 'Something went wrong. Please try after sometime.';
            res.send(STANDARD_RESPONSE);
            console.error(fetError);
            exporter.logNow(fetError.toString());
            process.send({ cmd: 'notifyOrderStatus' });
            return;
        });
    }
    else {
        STANDARD_RESPONSE.track_id = param.track_id;
        STANDARD_RESPONSE.error = true;
        STANDARD_RESPONSE.msg = 'invalid track_id';
        res.send(STANDARD_RESPONSE);
        process.send({ cmd: 'notifySpeedStatus' });
        return;
    }
});
module.exports = express_route;