const
    express = require("express"),
    exporter = require("../lib/exporter.js")('delivery')  // app name must be passed
    
express_route = express.Router() 

var __CONFIG = exporter.__CONFIG 
var ORDER_QUEUE = __CONFIG.rabbit_mq.queues.order 
var RESPONSE_STATUS = __CONFIG.response_status 
var ERROR_MSG = 'Something went wrong. Please try after sometime' 
/* 
var MONGO_CONFIG = __CONFIG.database.mongo.explorer.url 
var RABBITMQ_CONFIG = __CONFIG.rabbit_mq.credential_url.explorer 
 */

// pass RABBITMQ_CONFIG if rabbitmq is on different server
exporter.rbmqConnection()   // make rabbitmq connection

// pass MONGO_CONFIG if mongodb is on different server
var mongoDB = exporter.mongoConnection()   // make mongo connection

exporter.redisConnection()  // make redis connection

if (mongoDB) {
    // first register your schema in schema.js file
    const SCHEMAS = require('../schema/schemas') 
    var orderSchema = exporter.createMongoSchema(mongoDB, SCHEMAS.order.schema, SCHEMAS.order.coll_name) 
    var agentInfoSchema = exporter.createMongoSchema(mongoDB, SCHEMAS.agent_info.schema, SCHEMAS.agent_info.coll_name) 
    var agentWorkDetailSchema = exporter.createMongoSchema(mongoDB, SCHEMAS.agent_work_info.schema, SCHEMAS.agent_work_info.coll_name) 
    if (!orderSchema || !agentInfoSchema|| !agentWorkDetailSchema) {
        exporter.logNow(`Application stopped due to Mongo Schema Error : ${orderSchema}, ${agentInfoSchema}, ${agentWorkDetailSchema}`) 
        process.exit()
    }
}
else {
    exporter.logNow(`Application stopped due to : ${mongoDB}`) 
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
express_route.post('/order/request', async (req, res) => {
    let param = req.body 
    param = JSON.stringify(param) === JSON.stringify({}) ? req.query : param 
    let STANDARD_RESPONSE = {
        "order_id": "",
        "error": false,
        "msg": "unknown"
    }

    // validating parameter
    if (!param.hasOwnProperty('product_id') && typeof param.product_id == 'undefined' || param.product_id.trim() == '') {
        delete STANDARD_RESPONSE.order_id 
        STANDARD_RESPONSE.error = true 
        STANDARD_RESPONSE.msg = `Invalid product_id or missing` 
        res.send(STANDARD_RESPONSE) 
        process.send({ cmd: 'notifyOrderRequest' }) 
        return 
    }
    if (!param.hasOwnProperty('source') && typeof param.source == 'undefined' || param.source.trim() == '') {
        delete STANDARD_RESPONSE.order_id 
        STANDARD_RESPONSE.error = true 
        STANDARD_RESPONSE.msg = `Invalid source or missing` 
        res.send(STANDARD_RESPONSE) 
        process.send({ cmd: 'notifyOrderRequest' }) 
        return 
    }
    if (!param.hasOwnProperty('destination') && typeof param.destination == 'undefined' || param.destination.trim() == '') {
        delete STANDARD_RESPONSE.order_id 
        STANDARD_RESPONSE.error = true 
        STANDARD_RESPONSE.msg = `Invalid destination or missing` 
        res.send(STANDARD_RESPONSE) 
        process.send({ cmd: 'notifyOrderRequest' }) 
        return 
    }
    if (orderSchema) {

        let product_id = param.product_id 

        try {
            let orderData = PRODUCTS[product_id]
            orderData['product_id'] = product_id
            let orderSchemaMongo = new orderSchema({ product: orderData }) 
            var lastDoc = await orderSchemaMongo.save()  // saving into database
        }
        catch(mongoError) {
            console.log(`1.Mongo Insert Error: ${mongoError}`)
            delete STANDARD_RESPONSE.order_id 
            STANDARD_RESPONSE.error = true 
            STANDARD_RESPONSE.msg = ERROR_MSG 
            exporter.logNow(`1.Mongo Insert Error: ${mongoError}`) 
            res.send(STANDARD_RESPONSE) 
            process.send({ cmd: 'notifyOrderRequest' }) 
            return 
        }

        // insert into rabbitmq queue
        try {
            lastDoc = {
                order_id: lastDoc._id, 
                product_id: product_id,
                source: param.source,
                destination: param.destination
            } 
            await exporter.rabbitmqMessagePush(lastDoc, ORDER_QUEUE)  // insert data into queue
        }
        catch(rbmqError) {
            console.log(`1.RabbitMQ Push Error: ${rbmqError}`)
            STANDARD_RESPONSE.order_id = lastDoc.order_id 
            STANDARD_RESPONSE.error = true 
            STANDARD_RESPONSE.msg = ERROR_MSG 
            exporter.logNow(`RabbitMQ Push Error: ${rbmqError}`) 
            res.send(STANDARD_RESPONSE) 
            process.send({ cmd: 'notifyOrderRequestErr' }) 
            return 
        }

        // insert into redis
        try {
            await exporter.setMultiKeyValuesIntoRedis(lastDoc.order_id.toString(), { 'product_id': product_id.toString(), 'status': 0 }) 
            STANDARD_RESPONSE.order_id = lastDoc.order_id 
            STANDARD_RESPONSE.error = false 
            STANDARD_RESPONSE.msg = 'order successful' 
            res.send(STANDARD_RESPONSE) 
            process.send({ cmd: 'notifyOrderRequest' }) 
            return 
        }
        catch(redisError) {
            console.log(`1.Redis Push Error: ${redisError}`)
            STANDARD_RESPONSE.order_id = lastDoc.order_id 
            STANDARD_RESPONSE.error = true 
            STANDARD_RESPONSE.msg = ERROR_MSG 
            exporter.logNow(`1.Redis Push Error: ${redisError}`) 
            res.send(STANDARD_RESPONSE) 
            process.send({ cmd: 'notifyOrderRequestErr' }) 
            return 
        }
    }
    else {
        console.log(`1.Schema Error: ${orderSchema}`)
        delete STANDARD_RESPONSE.order_id 
        STANDARD_RESPONSE.error = true 
        STANDARD_RESPONSE.msg = ERROR_MSG 
        exporter.logNow(`1.Schema Error: ${orderSchema}`) 
        res.send(STANDARD_RESPONSE) 
        process.send({ cmd: 'notifyOrderRequestErr' }) 
        return 
    }
}) 
express_route.post('/order/status', async (req, res) => {

    let param = req.body 
    param = JSON.stringify(param) === JSON.stringify({}) ? req.query : param 
    let STANDARD_RESPONSE = {
        "order_id": "",
        "error": false,
        "msg": "unknown"
    }

    if (param.hasOwnProperty('order_id') && typeof param.order_id != 'undefined' && param.order_id.trim() != '') {
        
        try {
            var fetchedDoc = await exporter.getKeysFromRedis(param.order_id);
        }
        catch(fetError) {
            console.log(`2.Redis Read Error: ${fetError}`)
            STANDARD_RESPONSE.order_id = param.order_id 
            STANDARD_RESPONSE.error = true 
            STANDARD_RESPONSE.msg = ERROR_MSG
            exporter.logNow(`2.Redis Read Error ${fetError}`) 
            res.send(STANDARD_RESPONSE)
            process.send({ cmd: 'notifyOrderStatusErr' }) 
            return 
        }
        
        if (fetchedDoc) {
            STANDARD_RESPONSE.order_id = param.order_id 
            STANDARD_RESPONSE.product_id = fetchedDoc.product_id 
            if (fetchedDoc.hasOwnProperty('location'))
                STANDARD_RESPONSE.location = fetchedDoc.location 
            STANDARD_RESPONSE.status = fetchedDoc.status 
            STANDARD_RESPONSE.msg = RESPONSE_STATUS[fetchedDoc.status.toString()] 
            STANDARD_RESPONSE.error = false 
            res.send(STANDARD_RESPONSE) 
            process.send({ cmd: 'notifyOrderStatus' }) 
            return 
        }
        else {
            try {
                fetchedDoc = await agentWorkDetailSchema.find({ order_id: param.order_id })
            }
            catch(mongoError) {
                console.log(`2.Mongo Find Error: ${mongoError}`)
                STANDARD_RESPONSE.order_id = param.order_id 
                STANDARD_RESPONSE.error = true 
                STANDARD_RESPONSE.msg = ERROR_MSG 
                exporter.logNow(`2.Mongo Find Error: ${mongoError}`) 
                res.send(STANDARD_RESPONSE) 
                process.send({ cmd: 'notifyOrderStatusErr' }) 
                return
            }
            if (Array.isArray(fetchedDoc) && fetchedDoc.length > 0) {
                STANDARD_RESPONSE.order_id = param.order_id 
                STANDARD_RESPONSE.product_id = fetchedDoc[0].product.product_id
                if (fetchedDoc[0].hasOwnProperty('location'))
                    STANDARD_RESPONSE.location = fetchedDoc[0].location 
                STANDARD_RESPONSE.status = fetchedDoc[0].status 
                STANDARD_RESPONSE.msg = RESPONSE_STATUS[fetchedDoc[0].status.toString()] 
                STANDARD_RESPONSE.error = false 
                res.send(STANDARD_RESPONSE) 
                process.send({ cmd: 'notifyOrderStatus' }) 
                return 
            }
            else {
                STANDARD_RESPONSE.order_id = param.order_id 
                STANDARD_RESPONSE.error = false 
                STANDARD_RESPONSE.msg = 'no data found' 
                res.send(STANDARD_RESPONSE) 
                process.send({ cmd: 'notifyOrderStatus' }) 
                return
            }
        }
    }
    else {
        STANDARD_RESPONSE.order_id = param.order_id 
        STANDARD_RESPONSE.error = true 
        STANDARD_RESPONSE.msg = 'invalid order_id or missing' 
        res.send(STANDARD_RESPONSE) 
        process.send({ cmd: 'notifyOrderStatusErr' }) 
        return 
    }
}) 
express_route.post('/update/status', async (req, res) => {
    let param = req.body 
    param = JSON.stringify(param) === JSON.stringify({}) ? req.query : param 
    let STANDARD_RESPONSE = {
        "order_id": "",
        "error": false,
        "msg": "unknown"
    }

    // validating parameter
    if (!param.hasOwnProperty('status') && typeof param.status == 'undefined' || param.status.trim() == '') {
        delete STANDARD_RESPONSE.order_id 
        STANDARD_RESPONSE.error = true 
        STANDARD_RESPONSE.msg = `Invalid status or missing` 
        res.send(STANDARD_RESPONSE) 
        process.send({ cmd: 'notifyOrderUpdateStatus' }) 
        return 
    }
    if (!param.hasOwnProperty('location') && typeof param.location == 'undefined' || param.location.trim() == '') {
        delete STANDARD_RESPONSE.order_id 
        STANDARD_RESPONSE.error = true 
        STANDARD_RESPONSE.msg = `Invalid location or missing` 
        res.send(STANDARD_RESPONSE) 
        process.send({ cmd: 'notifyOrderUpdateStatus' }) 
        return 
    }
    if (!param.hasOwnProperty('order_id') && typeof param.order_id == 'undefined' || param.order_id.trim() == '') {
        delete STANDARD_RESPONSE.order_id 
        STANDARD_RESPONSE.error = true 
        STANDARD_RESPONSE.msg = `Invalid order id : ${param.order_id}` 
        res.send(STANDARD_RESPONSE) 
        process.send({ cmd: 'notifyOrderUpdateStatus' }) 
        return 
    }
    if (orderSchema && agentWorkDetailSchema) {

        // update status in order collection
        try {
            await orderSchema.findOneAndUpdate(
                { _id: param.order_id }, 
                { status: param.status }, 
                { multi: false }
            )
        }
        catch(mongoError) {
            console.log(`3.Mongo update Error: ${mongoError}`)
            STANDARD_RESPONSE.order_id = param.order_id 
            STANDARD_RESPONSE.error = true 
            STANDARD_RESPONSE.msg = ERROR_MSG 
            exporter.logNow(`3.Mongo update Error: ${mongoError}`) 
            res.send(STANDARD_RESPONSE) 
            process.send({ cmd: 'notifyOrderUpdateStatusErr' }) 
            return
        }

        try {
            var fetchedOrderRedis = await exporter.getKeysFromRedis(param.order_id)
        }
        catch(redisError) {
            console.error(`Redis Fetch Error : ${redisError}`)
            exporter.logNow(`Redis Fetch Error : ${redisError}`, 250)
            redisError = null
        }
        let location = param.location;
        if (fetchedOrderRedis) 
            location = fetchedOrderRedis.location+ ' | ' + location
        
        if (6 == parseInt(param.status)) {
            // remove order status from redis
            await exporter.deleteKeyFromRedis(param.order_id);
        }
        else {
            // update order status in redis
            try {
                await exporter.setMultiKeyValuesIntoRedis(param.order_id, ['status', param.status.toString(),'location', location]) 
            }
            catch(redisError) {
                console.log(`3.Redis update Error: ${redisError}`)
                STANDARD_RESPONSE.order_id = lastDoc.order_id 
                STANDARD_RESPONSE.error = true 
                STANDARD_RESPONSE.msg = ERROR_MSG 
                exporter.logNow(`3.Redis update Error: ${redisError}`) 
                res.send(STANDARD_RESPONSE) 
                process.send({ cmd: 'notifyOrderUpdateStatusErr' }) 
                return 
            }
        }
        
        /* 
            when product arrived some placed between source and destination then update agent_work_info collection 
        */
        try {
            await agentWorkDetailSchema.findOneAndUpdate(
                { order_id: param.order_id }, 
                { last_updated: Date.now(), location: location, status: param.status }, 
                { multi: false }
            )
            STANDARD_RESPONSE.order_id = param.order_id
            STANDARD_RESPONSE.msg = 'status updated to : '+RESPONSE_STATUS[param.status.toString()] 
            STANDARD_RESPONSE.error = false 
            res.send(STANDARD_RESPONSE) 
            process.send({ cmd: 'notifyOrderUpdateStatus' }) 
            return 
        }
        catch(mongoError) {
            console.log(`3.1.Mongo update Error: ${mongoError}`)
            STANDARD_RESPONSE.order_id = param.order_id 
            STANDARD_RESPONSE.error = true 
            STANDARD_RESPONSE.msg = ERROR_MSG 
            exporter.logNow(`3.1.Mongo update Error: ${mongoError}`) 
            res.send(STANDARD_RESPONSE) 
            process.send({ cmd: 'notifyOrderUpdateStatusErr' }) 
            return
        }
    }
    else {
        console.log(`3.Schema Error: ${orderSchema},  ${agentWorkDetailSchema}`)
        delete STANDARD_RESPONSE.order_id 
        STANDARD_RESPONSE.error = true 
        STANDARD_RESPONSE.msg = ERROR_MSG 
        exporter.logNow(`3.Schema Error: ${orderSchema},  ${agentWorkDetailSchema}`) 
        res.send(STANDARD_RESPONSE) 
        process.send({ cmd: 'notifyOrderUpdateStatusErr' }) 
        return 
    }
}) 
express_route.post('/update/location', async (req, res) => {
    let param = req.body 
    param = JSON.stringify(param) === JSON.stringify({}) ? req.query : param 
    let STANDARD_RESPONSE = {
        "order_id": "",
        "error": false,
        "msg": "unknown"
    }

    // validating parameter
    if (!param.hasOwnProperty('location') && typeof param.location == 'undefined' || param.location.trim() == '') {
        delete STANDARD_RESPONSE.order_id 
        STANDARD_RESPONSE.error = true 
        STANDARD_RESPONSE.msg = `Invalid location or missing` 
        res.send(STANDARD_RESPONSE) 
        process.send({ cmd: 'notifyOrderUpdateLocation' }) 
        return 
    }
    if (!param.hasOwnProperty('order_id') && typeof param.order_id == 'undefined' || param.order_id.trim() == '') {
        delete STANDARD_RESPONSE.order_id 
        STANDARD_RESPONSE.error = true 
        STANDARD_RESPONSE.msg = `Invalid order id or missing` 
        res.send(STANDARD_RESPONSE) 
        process.send({ cmd: 'notifyOrderUpdateLocation' }) 
        return 
    }
    
    try {
        var fetchedOrderRedis = await exporter.getKeysFromRedis(param.order_id)
    }
    catch(redisError) {
        console.error(`Redis Fetch Error : ${redisError}`)
        exporter.logNow(`Redis Fetch Error : ${redisError}`, 250)
        redisError = null
    }
    let location = param.location;
    if (fetchedOrderRedis) 
        location = fetchedOrderRedis.location+ ' | ' + location

    try {
        // assign agent to order
        await exporter.setMultiKeyValuesIntoRedis(param.order_id, ['location', location]) 
        
        /**** 
            -------- SEND ALERT TO Client --------
            Push data into email_agent queue of rabbit which will be picked by email sending service
         *****/

        STANDARD_RESPONSE.order_id = param.order_id 
        STANDARD_RESPONSE.error = false 
        STANDARD_RESPONSE.msg = 'location updated successful' 
        res.send(STANDARD_RESPONSE) 
        process.send({ cmd: 'notifyOrderUpdateLocation' }) 
    }
    catch(redisError) {
        console.log(`4.Redis Update Error: ${redisError}`)
        delete STANDARD_RESPONSE.order_id 
        STANDARD_RESPONSE.error = true 
        STANDARD_RESPONSE.msg = ERROR_MSG 
        exporter.logNow(`4.Redis Update Error: ${redisError}`) 
        res.send(STANDARD_RESPONSE) 
        process.send({ cmd: 'notifyOrderUpdateLocationErr' }) 
        return
    }
}) 
module.exports = express_route 