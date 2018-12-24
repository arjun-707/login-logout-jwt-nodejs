const fs = require('fs'),
    redis = require("redis"),
    path = require("path"),
    mongoose = require('mongoose'); mongoose.set('useCreateIndex', true);
const Schema = mongoose.Schema;
var bcrypt = require('bcryptjs')
var jwt = require('jsonwebtoken')

class Exporter  {
    
    constructor() {
        this.redisClient;
        this.logNow('application started successfully')
    }
    mongoConnection(mongoURI, schemaObj) {
        return new Promise(async (resolve, reject) => {
            if (!mongoURI || typeof mongoURI == 'undefined' || mongoURI.length < 1)
                return reject('invalid mongo connection url');
            return resolve(mongoose.createConnection(mongoURI, { useNewUrlParser: true }))
        })
    }
    createMongoSchema(schemaObj) {
        return (new Schema(schemaObj));
    }
    createMongoModel(mongoDB, collectionName, newSchema) {
        if (newSchema)
            return mongoDB.model(collectionName, newSchema)        
        return mongoDB.model(collectionName)
    }
    isObjectValid(arg, property = false, type = false, blank = false) {
        let status = false
        if (typeof arg == 'object')
            status = true
        if (property) {
            if (!arg[property] || typeof arg[property] == 'undefined') {
                console.log(`${arg}, ${property}, invalid object property`)
                status = false
            }
        }
        if (type) {
            if (typeof property == 'undefined') {
                console.log('property undefined')
                status = false
            }
        }
        if (blank) {
            if (arg[property] == '' || arg[property].trim().length == 0) {
                console.log('property length too short')
                status = false
            }
        }
        return status
    }
    authenticateToken(req, res, next) {
        const bearerHeader = req.header('authorization')
        if (typeof bearerHeader != 'undefined') {
            const bearer = bearerHeader.split(' ')
            const bearerToken = bearer[1] 
            jwt.verify(bearerToken, process.CONFIG.jwt.token.activated, (err, data) => {
                if (err)
                    res.status(400).json({
                        msg: "Invalid token or please try to login again"
                    })
                else {
                    process.exporter.getSingleHashKeysValuesFromRedis('expired_token', bearerToken)
                    .then((redisTokendata) => {
                        if (redisTokendata)
                            res.status(400).json({
                                msg: "token expired"
                            })
                        else {
                            req.finalTokenExtractedData = data
                            // if (req.originalUrl.trim() == process.logoutURL.trim())
                                req.jwtToken = {
                                    token: bearerToken,
                                    secret: process.CONFIG.jwt.token.activated
                                }
                            next()
                        }
                    })
                    .catch((redisTokenError) => {
                        process.exporter.logNow(`redis token error: ${redisTokenError}`)
                        res.status(400).json({
                            msg: "Some went wrong while checking token. Please try later."
                        })
                    })
                }
            })
        }
        else 
            res.status(400).json({
                msg: "invalid token"
            })
    }
    generateToken(data) {
        let expiry = new Date();
        // expiry.setDate(expiry.getDate() + 7)
        expiry.setMinutes(expiry.getMinutes() + 5)
        return jwt.sign({
            tokenId: data._id,
            exp: parseInt(expiry.getTime() / 1000),
        }, process.CONFIG.jwt.token.activated)
    }    
    createPassword(password) {
        return new Promise((resolve, reject) => {
            if (typeof password == 'undefined' && password == '')
                return reject('password empty')
            bcrypt.hash(password, 10, async (bErr, hash) => {
                if (bErr)
                    reject(bErr)
                else
                    resolve(hash)
            })
        })
    }
    verifyPassword(enteredPassword, savePassword) {
        return bcrypt.compareSync(enteredPassword, savePassword)
    }
    logNow(content, appName = this.appName) {
        if (typeof appName == 'undefined')
            appName = __filename.split('.')[0].split('/')[__filename.split('.')[0].split('/').length - 1];
        if (appName && typeof content != 'undefined' && typeof content == 'string') {
            let dir = "./"+appName+"-logs";
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, '0777', (fol_err) => {
                    if (fol_err) {
                        console.error(`${dir} not found. Exception : ${fol_err}`);
                        return false;
                    }
                })
            }
            let fileName = dir+"/"+appName+".log";
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
            let line = ((new Error().stack).split("at ")[3]).trim().split(' ')[1].split('/')
            line = line[line.length-1].replace(')', ' ')
            let logOption = [
                line,
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
    /* redisConnection(crendentialURL) {
        return new Promise(async (resolve, reject) => {
            if (this.isObjectValid(crendentialURL, 'host', true, true) && this.isObjectValid(crendentialURL, 'port', true, true))
                return reject('invalid redis credential');
            else {
                 // `crendentialURL` should be passed as parameter
                let redisClient = redis.createClient(crendentialURL.port, crendentialURL.host);
                redisClient.on("error", (err) => {
                    console.error(`Redis Error: ${err}`)
                    process.exit();
                });
                return resolve(redisClient)
            }
        })
    } */
    redisConnection(crendentialURL = process.CONFIG.redis.local) {
        let ref = this;
        return new Promise(async (resolve, reject) => {
            if (!crendentialURL || typeof crendentialURL != 'object' || !crendentialURL.hasOwnProperty('host') || !crendentialURL.hasOwnProperty('port')) {
                ref.redisClient = null;
                process.exit();
            }
            // `crendentialURL` should be passed as parameter
            let redisClient = redis.createClient(crendentialURL.port, crendentialURL.host);
            await redisClient.on("error", (err) => {
                console.error(`Redis Error: ${err}`);
                ref.redisClient = null;
                process.exit();
            });
            ref.redisClient = redisClient;
            console.log('=> redis is connected');
            return resolve(redisClient)
        })
    }
    getSingleKeysValuesFromRedis(key, redisClient = this.redisClient) {
        if (!key || typeof key == 'undefined' || key == '')
            reject(`redis key issue`)
        return new Promise(async (resolve, reject) => {
            if (!redisClient || typeof redisClient == 'undefined')
                reject('redis client undefined');
                
            await redisClient.get(key, (err, res) => {
                if (err)
                    reject(err);
                else
                    resolve(res);
            });
        });   
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
    deleteSingleKeyValuesFromRedis(key, redisClient = this.redisClient) {
        return new Promise((resolve, reject) => {
            if (!redisClient || typeof redisClient == 'undefined' || !key || typeof key == 'undefined' || key == '')
                reject(false);
            redisClient.del(key, (err, res) => {
                if (err)
                    reject(err);
                else
                    resolve(true);
            });
        });
    }
    getHashKeysValuesFromRedis(hashKey, redisClient = this.redisClient) {
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
    getSingleHashKeysValuesFromRedis(hashKey, key, redisClient = this.redisClient) {
        if (!hashKey || typeof hashKey == 'undefined' || hashKey == '' || !key || typeof key == 'undefined' || key == '')
            reject(`redis hashkey or key issue`)
        return new Promise(async (resolve, reject) => {
            if (!redisClient || typeof redisClient == 'undefined')
                reject('redis client undefined');
            await redisClient.hget(hashKey, key, (err, res) => {
                if (err)
                    reject(err);
                else
                    resolve(res);
            });
        });   
    }
    setHashKeyValuesIntoRedis(hashKey, input, redisClient = this.redisClient) {
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
    deleteHashKeyValuesIntoRedis(key, value, redisClient = this.redisClient) {
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
}
module.exports = (new Exporter());