const
    cron = require("node-cron"),
    express = require("express"),
    exporter = require("../lib/exporter.js")('delivery')

const app = express()
var __CONFIG = exporter.__CONFIG
var WORKER_MSG = __CONFIG.design_msg.calculator
var CALLBACK_QUEUE =  __CONFIG.rabbit_mq.queues.order
var ORDER_QUEUE = __CONFIG.rabbit_mq.queues.order

/* 
var MONGO_CONFIG = __CONFIG.database.mongo.explorer.url
var RABBITMQ_CONFIG = __CONFIG.rabbit_mq.credential_url.explorer
 */

// pass RABBITMQ_CONFIG if rabbitmq is on different server
exporter.rbmqConnection()  // make rabbitmq connection

// pass MONGO_CONFIG if mongodb is on different server
var mongoDB = exporter.mongoConnection()  // make mongo connection

exporter.redisConnection() // make redis connection

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
var SELECTED = 0

cron.schedule("* * * * * *", async () => {
    
    if (SELECTED > 20) // 20 is default value for order count to each agent
        SELECTED = 0
    try {
        var consumedData = await exporter.rabbitmqMessageConsume(ORDER_QUEUE) // consume data from queue
    }
    catch(rbmqError) {
        console.error(`RabbitMQ Consume Error : ${rbmqError}`)
        exporter.logNow(`RabbitMQ Consume Error : ${rbmqError}`, 250)
        rbmqError = null
    }

    consumedData = JSON.parse(consumedData.content.toString())
    if (consumedData && typeof consumedData === 'object' && consumedData.hasOwnProperty('order_id')) { 
        
        console.log(`${WORKER_MSG} ${consumedData.order_id}`)
        
        var inputForRedis = []
        var chosenAgent = false
        SELECTED++

        try {
            var fetchedAgent = await exporter.getKeysFromRedis('currently_free_agent')
            for (let key in fetchedAgent) {
                if (parseInt(fetchedAgent[key]) < 20 && SELECTED == parseInt(key)) {
                    let incr = parseInt(fetchedAgent[key]) + 1
                    chosenAgent = key
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
            exporter.logNow(`Redis Fetch Error : ${redisError}`, 250)
            redisError = null
        }
        if (chosenAgent) {

            if (inputForRedis.length > 1) {
                
                // assign agent to order updated in redis
                try {                    
                    await exporter.setMultiKeyValuesIntoRedis(
                        consumedData.order_id, 
                        ['agent', SELECTED, 'status', '1'])
                }
                catch(redisError) {
                    console.error(`Redis Update Error : ${redisError}`)
                    exporter.logNow(`Redis Update Error : ${redisError}`, 250)
                    redisError = null
                }
                    
                /**** 
                    -------- CODE HERE TO SEND ALERT TO AGENT --------
                    Push data into email_agent queue of rabbit which will be picked by email sending service
                    -> agent email
                    -> agent id
                    -> product
                    -> pickup address
                    -> delivery address
                *****/
                
                // update agent total deliver count of selected agent
                try {                    
                    await exporter.setMultiKeyValuesIntoRedis('currently_free_agent', inputForRedis)
                }
                catch(redisError) {
                    console.error(`Redis Update Error : ${redisError}`)
                    exporter.logNow(`Redis Update Error : ${redisError}`, 250)
                    redisError = null
                }
                
                // update status in order collection
                try {
                    await orderSchema.findByIdAndUpdate(
                        { _id: consumedData.order_id }, 
                        { agent_id: chosenAgent, status: 1 }, 
                        { multi: false }
                    )
                }
                catch(mongoError) {
                    console.error(`Mongo Update Error : ${mongoError}`)
                    exporter.logNow(`Mongo Update Error : ${mongoError}`, 250)
                    mongoError = null
                }
                
                // insert agent detail in agent_work_info collection
                try {                    
                    let agentWorkDetailMongo = new agentWorkDetailSchema({ 
                        agent_id: chosenAgent,
                        order_id: consumedData.order_id,
                        product_id: consumedData.product_id,
                        source_address: consumedData.source,
                        destination_address: consumedData.destination
                    });
                    await agentWorkDetailMongo.save(); // saving into database
                }
                catch(mongoError) {
                    console.error(`Mongo Update Error : ${mongoError}`)
                    exporter.logNow(`Mongo Update Error : ${mongoError}`, 250)
                    mongoError = null
                }
            }
            else {
                console.log(`input array issue ${inputForRedis}`)
            }
        }
        else {
            console.log(`all agents are occupied`)
            /*
                -------  CODE HERE TO SEND ALERT TO MANAGEMENT OF THE APPLICATION --------
                Push data into error_email_agent queue of rabbit which will be picked by error_email sending service
             */
        }
    }
})

// if any error or exception occurred then write into a JS file so that app can be restarted
process.on('uncaughtException', (err) => {
    console.error(err.stack)
    console.log("Restarting app...")
    fs.writeFile('cache.js', 'restarting...', (err) => {
        if (err) {
            return console.error(err)
        }
    })
})

const cluster = require('cluster')
if (cluster.isMaster) {
    const numCPUs = require('os').cpus().length
    // Fork workers.
    for (let i = 0; i < numCPUs; i++)
        cluster.fork();
    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
    });
}
else {    
    if (process.argv.length == 3 && typeof parseInt(process.argv[2]) != NaN) {
        port = parseInt(process.argv[2])
        app.listen(port, console.log(`listening at port: ${port} via express\n`))
    }
    else {
        if (__CONFIG.run == 'live') {
            port = parseInt(__CONFIG.port.processor.production)
            app.listen(port, console.log(`Production listening at port: ${port} via express\n`))
        }
        else if (__CONFIG.run == 'dev') {
            port = parseInt(__CONFIG.port.processor.development)
            app.listen(port, console.log(`Development listening at port: ${port} via express\n`))
        }
        else {
            console.error(new Error('Port is missing'))
            let pid = process.pid
            process.exit(1)
            process.kill(pid)
        }
    }
}
