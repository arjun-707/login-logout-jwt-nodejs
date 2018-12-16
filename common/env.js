
process.CONFIG = require('../configs/config.json')

process.exporter = require("../lib/exporter.js")

process.dbInit = (globalName, mongoUrl, collectionName) => {
    require("../models/db-init.js")(mongoUrl, collectionName)
    .then((modelObj) => {
        process[globalName] = modelObj
    })
    .catch((dbInitErr) =>  {
        console.log(`dbInit Error: ${dbInitErr}`)
        process.exit()
    });

}
