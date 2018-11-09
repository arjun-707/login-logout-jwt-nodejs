const
    cron = require("node-cron"),
    express = require("express"),
    request = require('promise-request-retry'),
    fs = require('fs'),
    exporter = require("./exporter.js")('google_explorer');

const app = express();
var __CONFIG = exporter.__CONFIG;
var GOOGLE_API_URL = __CONFIG.google.google_speed_url;
var CALLBACK_QUEUE =  __CONFIG.rabbit_mq.queues.explorer_speed.callback;
var EXPLORER_QUEUE = __CONFIG.rabbit_mq.queues.explorer_speed.start;
var CALCULATOR_MSG = __CONFIG.design_msg.calculator;
var CALLBACK_MSG = __CONFIG.design_msg.callback;
var MONGO_CONFIG = (__CONFIG.run == "live") ? __CONFIG.database.mongo.explorer.url : __CONFIG.database.mongo.local.url;
var RABBITMQ_CONFIG = __CONFIG.rabbit_mq.credential_url.explorer;

exporter.rbmqConnection(RABBITMQ_CONFIG);  // make rabbitmq connection
var mongoDB = exporter.mongoConnection(MONGO_CONFIG);  // make mongo connection

if (mongoDB) {
    var googleExplorerSchema = exporter.createMongoSchema("google_explorer", mongoDB);
    if (!googleExplorerSchema) {
        exporter.logNow(`Application stopped due to Mongo Schema Error : ${googleExplorerSchema}`, 23);
        process.exit()
    }
}
else {
    exporter.logNow(`Application stopped due to Mongo Connection Error : ${mongoDB}`);
    process.exit()
}

/** 
 * `Google Speed Callback` Scheduler
 * Steps:
    1. Consume data from queue
    2. Parse data
    3. Make post request in callback URL
    5. If request successfull then update status else update error
 */
cron.schedule("* * * * * *", () => {
    exporter.rabbitmqMessageConsume(CALLBACK_QUEUE)
    .then(async (msg) => {
        var consumedData = JSON.parse(msg.content.toString());
        console.log(`${CALLBACK_MSG} ${consumedData.jobid}`)
        if (consumedData.hasOwnProperty('callback_url')) {
            let options = {
                uri: consumedData.callback_url,
                method: 'POST',
                body: {
                    jobid: consumedData.jobid,
                    data: consumedData.data.speedData,
                    error: consumedData.error
                },
                json: true,
                retry : 3,
                verbose_logging : false
            };
            try {
                request(options)
                .then((speedData) => {
                    if (googleExplorerSchema) {
                        googleExplorerSchema.findOneAndUpdate(
                            { _id: consumedData.jobid },
                            { status: 4, callback_sent: true }, 
                            { multi: false, upsert: false }, 
                            (mongoErr, mongoRes) => {
                                if (mongoErr)
                                    exporter.logNow(`RabbitMQ Callback Mongo Error : ${mongoErr}`, 65);
                                else
                                    console.log(`Callback sent for Job ID : ${consumedData.jobid}`)
                                mongoRes = null, consumedData = null;
                            }
                        );
                    }
                    else
                        exporter.logNow(`Calculator Mongo Schema Error : ${googleExplorerSchema}`, 74);
                    speedData = null, options = null;
                })
                .catch((gError) => {
                    if (googleExplorerSchema) {
                        googleExplorerSchema.findOneAndUpdate(
                            { _id: consumedData.jobid },
                            { status: 105 }, 
                            { multi: false, upsert: false }, 
                            (mongoErr, mongoRes) => {
                                if (mongoErr)
                                    exporter.logNow(`Request Mongo Update Error (callback not sent for Job ID : ${consumedData.jobid}) : ${mongoErr}`, 85);
                            }
                        );
                    }
                    else
                        exporter.logNow(`Calculator Mongo Schema Error : ${googleExplorerSchema}`, 90);
                    gError = null, consumedData = null;
                });
            }
            catch(e) {
                console.error(new Error(e));
                exporter.logNow(`Calculator Mongo Schema Error : ${e}`, 96);
            }
        }
    })
    .catch((rbmqError) => {
        exporter.logNow(`Callback RabbitMQ Consume Error : ${rbmqError}`, 101);
        rbmqError = null;
    });
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
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
}
else {    
    if (process.argv.length == 3 && typeof parseInt(process.argv[2]) != NaN) {
        port = parseInt(process.argv[2])
        app.listen(port, console.log(`listening at port: ${port} via express\n`));
    }
    else {
        if (__CONFIG.run == 'live') {
            port = parseInt(__CONFIG.port.callback.production)
            app.listen(port, console.log(`Production listening at port: ${port} via express\n`));
        }
        else if (__CONFIG.run == 'dev') {
            port = parseInt(__CONFIG.port.callback.development)
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