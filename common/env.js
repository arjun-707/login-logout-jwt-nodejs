
process.CONFIG = require('../configs/config.json')

process.exporter = require("../lib/exporter.js")

process.dbInit = (globalName, mongoUrl, collectionName) => {
    require("../models/db-init.js")(mongoUrl, collectionName)
    .then((modelObj) => {
        process[globalName] = modelObj // will be used as global
    })
    .catch((dbInitErr) => {
        process.exporter.logNow(`dbInit Error: ${dbInitErr}`)
        process.exit()
    });
}
process.redisTokenInit = ()  => {
    process.exporter.redisConnection()
    .then((client) => {
        if (process.exporter.redisClient) {
            /* await process.exporter.getHashKeysValuesFromRedis('token', client)
            .then(async (redisTokendata) => {
                let inputForRedis = []
                if (!redisTokendata || !process.exporter.isObjectValid(redisTokendata) || Object.keys(redisTokendata).length < 1)
                    for (let i = 0; i < process.CONFIG.jwt.token.length; i++) {
                        inputForRedis.push(process.CONFIG.jwt.token[i])
                        inputForRedis.push(0)
                    }
                if (inputForRedis.length > 1) {
                    await process.exporter.deleteSingleKeyValuesFromRedis('token', client)
                    await process.exporter.setHashKeyValuesIntoRedis('token', inputForRedis, client)
                }
            })
            .catch((redisTokenError) => {
                console.log(`redis token error: ${redisTokenError}`)
                process.exit()
            }) */
        }
        else {
            process.exporter.logNow(`Redis initialize error`)
            process.exit()
        }
    })
    .catch((redisErr) => {
        process.exporter.logNow(`Redis connection error: ${redisErr}`)
        process.exit()
    })

}
(async () => {
    await process.redisTokenInit()
})()

// route urls
process.logoutURL = 'user/logout' 
