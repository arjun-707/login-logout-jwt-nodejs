const fs = require('fs'),
    path = require("path"),
    mongoose = require('mongoose'); mongoose.set('useCreateIndex', true);
const Schema = mongoose.Schema;
var bcrypt = require('bcryptjs')
var jwt = require('jsonwebtoken')

class Exporter  {
    
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
    /* validate() {
        if (arguments.length > 0) {
            for (let arg = 0; arg < arguments.length; arg++) {
                
            }
        }
    } */
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
            jwt.verify(bearerToken, process.CONFIG.jwt.token, (err, data) => {
                if (err)
                    res.status(404)
                else {
                    req.finalTokenExtractedData = data
                    next()
                }
            })
        }
        else 
            res.status(404)
    }
    /* verifyToken(token, secret = process.CONFIG.jwt.token) {
        return new Promise((resolve, reject) => {
            jwt.verify(token, secret, (err, data) => {
                if (err)
                    reject(err)
                else
                    resolve(data)
            })
        })
    } */
    generateToken(data) {
        let expiry = new Date();
        expiry.setDate(expiry.getDate() + 7);
        return jwt.sign({
            _id: data._id,
            exp: parseInt(expiry.getTime() / 1000),
        }, process.CONFIG.jwt.token)
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
        console.log(enteredPassword, savePassword)
        return bcrypt.compareSync(enteredPassword, savePassword)
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
module.exports = (new Exporter());