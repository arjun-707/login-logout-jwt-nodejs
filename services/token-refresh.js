const cron = require("node-cron")
var jwt = require('jsonwebtoken')
require('../common/env')
let exporter = process.exporter;

(async () => {
        
    console.log(`**********************Token Refresh Service running***************************`)

    cron.schedule('* * * * *', () => {
        exporter.getHashKeysValuesFromRedis('expired_token')
        .then(async (redisTokendata) => {
            if (redisTokendata && exporter.isObjectValid(redisTokendata) && Object.keys(redisTokendata).length > 0) {
                console.log(`token found...`)
                for (let key in redisTokendata) {
                    if (redisTokendata[key]) {
                        jwt.verify(key, redisTokendata[key], (err, data) => {
                            if (err) {
                                exporter.deleteHashKeyValuesIntoRedis('expired_token', key)
                                .then(() => {
                                    exporter.logNow(`Token expired : ${key}, activated secret : ${redisTokendata[key]}`, 'token')
                                })
                                .catch((redisTokenError) => {
                                    exporter.logNow(`Token expired Error: ${redisTokenError}, Token expired : ${key}, activated secret : ${redisTokendata[key]}`)
                                })
                            }
                            else
                                console.log(data)
                        })
                    }                        
                    else
                        console.log(`${key} token found with some issue`)
                }
            }
        })
        .catch((redisTokenError) => {
            console.log(`redis token error: ${redisTokenError}`)
            exporter.logNow(`Redis token Error : ${redisTokenError}`)
            process.exit()
        })
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

})()


/* const cluster = require('cluster')

const numCPUs = require('os').cpus().length
// Fork workers.
for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
    console.log(`thead ${i} started`)
}
cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died`);
}); */