const 
{ promisify } = require("util"),
redis = require("redis"),
amqp = require('amqplib/callback_api'),
fs = require('fs'),
path = require("path");
mongoose = require('mongoose');

class commonModule  {
    
    constructor(APP_NAME = '') {
        if (typeof APP_NAME == 'string' && APP_NAME.trim() != '') {
            this.appName = APP_NAME;
            this.logNow(`**** ${APP_NAME} has started ****`);
            console.log(`=> Logging is enabled with by default Application name : ${APP_NAME}`);
        }
        else {
            console.error(`Application Name is Missing while requiring exporter.js`);
            process.exit();
        }
        this.__CONFIG = this.readConfig();
        // let instance;
        this.GOOGLE_API_KEYS = {};
        // this.redisConfig = this.__CONFIG.google.google_api_key;
        this.redisClient;
        this.rbmqClient;
    }
    readConfig() {
        let configLocation = path.dirname(__filename) + "/../config";
        if (!fs.existsSync(configLocation)) {
            console.error(`Location : ${configLocation} not found.`);
            process.exit();
        }
        let CONFIG_FILE = configLocation+"/api-configs/"+this.appName+".json";
        return require(CONFIG_FILE);
    }
    mongoConnection(mongoURI = this.__CONFIG.database.mongo.local.url) {
        if (!mongoURI || typeof mongoURI == 'undefined' || mongoURI.length < 1)
            return false;
        return mongoose.createConnection(mongoURI, { useNewUrlParser: true }, (mongoErr) => {
            if (mongoErr) {
                console.error(mongoErr);
                process.exit();
            }
            else
                console.log('=> mongo is connected');
        });
    }
    async rbmqConnection(crendentialURL = this.__CONFIG.rabbit_mq.credential_url.local) {
        if (!crendentialURL || typeof crendentialURL == 'undefined' || crendentialURL.length < 1) {
            this.rbmqClient = null;
            process.exit();
        }
        // promise not supported
        await amqp.connect(crendentialURL, (amqpErr, amqpConn) => {
            if (amqpErr) {
                this.rbmqClient = null;
                console.error(`RabbitMQ Error: ${amqpConn}`);
                process.exit();
            }
            else {
                this.rbmqClient = amqpConn;
                console.log('=> rabbitmq is connected');
            }
        });
    }
    async redisConnection(crendentialURL = this.__CONFIG.redis.local) {
        if (!crendentialURL || typeof crendentialURL != 'object' || !crendentialURL.hasOwnProperty('host') || !crendentialURL.hasOwnProperty('port')) {
            this.redisClient = null;
            process.exit();
        }
        // `crendentialURL` should be passed as parameter
        let redisClient = redis.createClient(crendentialURL.port, crendentialURL.host);
        await redisClient.on("error", (err) => {
            console.error(`Redis Error: ${err}`);
            process.exit();
        });
        this.redisClient = redisClient;
        console.log('=> redis is connected');
    }
    createMongoSchema(mongoDBObj, schemaObj, collectionName) {
        let schema = new mongoose.Schema(schemaObj);
        return mongoDBObj.model(collectionName, schema);
    }
    rabbitmqMessagePush(message, queueName, rmqConnection = this.rbmqClient) {
        return new Promise((resolve, reject) => {
            if (!message || typeof message == 'undefined' || message.length < 1 || !rmqConnection || typeof rmqConnection == 'undefined' || !queueName || typeof queueName == 'undefined' || queueName.length < 1)
                reject('undefined rabbitmq message');
            try {
                rmqConnection.createConfirmChannel(async (channelErr, channel) => {
                    if (channelErr)
                        reject(channelErr);
                    else {
                        var priority = 0;
                        try {
                            await channel.assertQueue(queueName, { durable: true, maxPriority: priority });
                        }
                        catch (ex) {
                            console.error(ex);
                        }
                        try {
                            channel.sendToQueue(queueName, new Buffer(JSON.stringify(message)), { persistent: true }, (publErr, ok) => {
                                channel.close();
                                // rmqConnection.close();
                                
                                if (publErr)
                                    reject(publErr);
                                else
                                    resolve(false);
                            });
                        }
                        catch (ex) {
                            reject(ex);
                        }
                    }
                });
            }
            catch (ex) {
                reject(ex);
            }
        });
    }
    rabbitmqMessageConsume(queueName, rmqConnection = this.rbmqClient) {
        return new Promise((resolve, reject) => {
            if (!rmqConnection || typeof rmqConnection == 'undefined' || !queueName || typeof queueName == 'undefined' || queueName.length < 1)
                reject('rabbitmq connection undefined');
            try {
                rmqConnection.createConfirmChannel(async (channelErr, channel) => {
                    if (channelErr)
                        reject(channelErr);
                    else {
                        var priority = 0;
                        try {
                            await channel.assertQueue(queueName, { durable: true, maxPriority: priority});
                        }
                        catch (ex) {
                            console.error(ex);
                        }
                        try {
                            channel.consume(queueName, (msg) => {
                                channel.close();
                                // rmqConnection.close();
                                
                                if (!msg)
                                    reject(msg);
                                else
                                    resolve(msg);
                            }, {noAck: true});
                        }
                        catch (ex) {
                            reject(ex);
                        }
                    }
                });
            }
            catch (ex) {
                reject(ex);
            }
        });
    }
    unsetMultiKeyValuesIntoRedis(key, value, redisClient = this.redisClient) {
        return new Promise((resolve, reject) => {
            if (!redisClient || typeof redisClient == 'undefined' || !key || typeof key == 'undefined' || !value || typeof value == 'undefined' || key == '' || value == '')
                reject(false);
            redisClient.hdel(key, value, (err, res) => {
                if (err)
                    reject(err);
                else
                    resolve(true);
            });
        });
        
    }
    setMultiKeyValuesIntoRedis(hashKey, input, redisClient = this.redisClient) {
        return new Promise((resolve, reject) => {
            if (!redisClient || typeof redisClient == 'undefined')
                reject(`redis connect issue`)
            if (!hashKey || typeof hashKey == 'undefined' || !input || typeof input == 'undefined' || hashKey == '')
                reject(`redis parameter issue`)
            redisClient.hmset(hashKey, input, (err, res) => {
                if (err)
                    reject(err)
                else
                    resolve(`redis key status ${hashKey}`)
            })
        })
        
    }
    setSingleKeyValuesIntoRedis(key, value, redisClient = this.redisClient) {
        return new Promise((resolve, reject) => {
            if (!redisClient || typeof redisClient == 'undefined' || !key || typeof key == 'undefined' || !value || typeof value == 'undefined' || key == '' || value == '')
                reject(false);
            redisClient.set(key, value, (err, res) => {
                if (err)
                    reject(err);
                else
                    resolve(true);
            });
        });
        
    }
    getKeysFromRedis(hashKey, redisClient = this.redisClient) {
        if (!hashKey || typeof hashKey == 'undefined' || hashKey == '')
            reject(`redis hashkey issue`)
        return new Promise(async (resolve, reject) => {
            if (!redisClient || typeof redisClient == 'undefined')
                reject('redis client undefined');
                
            await redisClient.hgetall(hashKey, (err, res) => {
                if (err)
                    reject(err);
                else
                    resolve(res);
            });
        });   
    }
    logNow(content, appName = this.appName) {
        if (appName && typeof content != 'undefined' && typeof content == 'string') {
            let dir = "./"+this.appName+"-logs";
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, '0777', (fol_err) => {
                    if (fol_err) {
                        console.error(`${dir} not found. Exception : ${fol_err}`);
                        return false;
                    }
                })
            }
            let fileName = dir+"/"+this.appName+".log";
            let currentDate = new Date();
            let year = currentDate.getFullYear();
            let month = currentDate.getMonth();
            let day = currentDate.getDate();
            let hour = currentDate.getHours();
            let min = currentDate.getMinutes();
            let sec = currentDate.getSeconds();
            month = (month < 10) ? "0"+month : month;
            day = (day < 10) ? "0"+day : day;
            hour = (hour < 10) ? "0"+hour : hour;
            min = (min < 10) ? "0"+min : min;
            sec = (sec < 10) ? "0"+sec : sec;
            let logOption = [
                "Line : "+20+" ",
                year+"-"+month+"-"+day+" "+hour+":"+min+":"+sec,
                " => ",
                content                
            ];
            logOption = logOption.join(" ")+"\n";
            fs.appendFileSync(fileName, logOption, (ferr) => {
                if (ferr) 
                    console.error(`Log file not created: ${ferr}`);
            });
        }
        else {
            console.error(`unable to create log file : ${content}`);
            return false;
        }
    }
}
module.exports = (app) => (new commonModule(app));