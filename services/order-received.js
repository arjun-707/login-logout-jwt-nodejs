const
    cron = require("node-cron"),
    express = require("express"),
    exporter = require("../lib/exporter.js")('delivery');

const app = express();
var __CONFIG = exporter.__CONFIG;
var WORKER_MSG = __CONFIG.design_msg.calculator;
var CALLBACK_QUEUE =  __CONFIG.rabbit_mq.queues.order;
var ORDER_QUEUE = __CONFIG.rabbit_mq.queues.order;

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
var selected = 0;
cron.schedule("* * * * * *", async () => {
    var order_id;
    if (selected > 20)
        selected = 0;
    try {
        var consumedData = await exporter.rabbitmqMessageConsume(ORDER_QUEUE); // consume data from queue
        consumedData = JSON.parse(consumedData.content.toString());
        order_id = consumedData.order_id;
    }
    catch(rbmqError) {
        console.error(`RabbitMQ Consume Error : ${rbmqError}`)
        exporter.logNow(`RabbitMQ Consume Error : ${rbmqError}`, 250);
        rbmqError = null;
    }
    if (consumedData && typeof consumedData === 'object' && consumedData.hasOwnProperty('order_id')) { 
        console.log(`${WORKER_MSG} ${consumedData.order_id}`);
        
        var inputForRedis = [];
        selected++;
        try {
            var fetchedAgent = await exporter.getKeysFromRedis('currently_free_agent');
            for (let key in fetchedAgent) {
                if (parseInt(fetchedAgent[key]) < 20 && selected == parseInt(key)) {
                    let incr = parseInt(fetchedAgent[key]) + 1;
                    inputForRedis.push(key)
                    inputForRedis.push(incr.toString())
                }
                else {
                    inputForRedis.push(key)
                    inputForRedis.push(fetchedAgent[key])
                }
            }
        }
        catch(redisError) {
            console.error(`Redis Fetch Error : ${redisError}`)
            exporter.logNow(`Redis Fetch Error : ${redisError}`, 250);
            redisError = null;
        }
        if (inputForRedis.length > 1) {
            
            try {
                // assign agent to order
                await exporter.setMultiKeyValuesIntoRedis(order_id, ['agent', selected]);
                
                // delete previous status and reorder redis key
                // await exporter.unsetMultiKeyValuesIntoRedis('currently_free_agent', redisUnset);
                
                // update agent total deliver count
                await exporter.setMultiKeyValuesIntoRedis('currently_free_agent', inputForRedis);
            }
            catch(redisError) {
                console.error(`Redis Update Error : ${redisError}`)
                exporter.logNow(`Redis Update Error : ${redisError}`, 250);
                redisError = null;
            }
        }
        else {
            console.log(`input array issue ${inputForRedis}`)
        }
    }
});

// if any error or exception occurred then write into a JS file so that app can be restarted
process.on('uncaughtException', (err) => {
    console.error(err.stack);
    console.log("Restarting app...");
    fs.writeFile('cache.js', 'restarting...', (err) => {
        if (err) {
            return console.error(err);
        }
    });
});

const cluster = require('cluster');
if (cluster.isMaster) {
    const numCPUs = require('os').cpus().length;
    // Fork workers.
    /* for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    } */
}
else {    
    if (process.argv.length == 3 && typeof parseInt(process.argv[2]) != NaN) {
        port = parseInt(process.argv[2])
        app.listen(port, console.log(`listening at port: ${port} via express\n`));
    }
    else {
        if (__CONFIG.run == 'live') {
            port = parseInt(__CONFIG.port.processor.production)
            app.listen(port, console.log(`Production listening at port: ${port} via express\n`));
        }
        else if (__CONFIG.run == 'dev') {
            port = parseInt(__CONFIG.port.processor.development)
            app.listen(port, console.log(`Development listening at port: ${port} via express\n`));
        }
        else {
            console.error(new Error('Port is missing'));
            let pid = process.pid;
            process.exit(1);
            process.kill(pid);
        }
    }
}
