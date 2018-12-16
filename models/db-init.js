var exporter = process.exporter;
var SCHEMAS = require('./schema.js')

dbInit = (mongoUrl, schemaName) => {
    return new Promise((resolve, reject) => {
        exporter.mongoConnection(mongoUrl)
        .then((mongoDB) => {
            if (mongoDB) {
                console.log('=> mongo connected');
                if (schemaName && schemaName != '') {
                    let SchemaObj = exporter.createMongoSchema(SCHEMAS[schemaName].schema)                    
                    return resolve(exporter.createMongoModel(mongoDB, SCHEMAS[schemaName].coll_name, SchemaObj))
                }
                else
                    return resolve(exporter.createMongoModel(mongoDB, SCHEMAS[schemaName].coll_name))
            }
            else {
                exporter.logNow(`MongoDB err due to : ${mongoDB}`) 
                process.exit()
            }
        })
        .catch((mongoDBErr) => {
            exporter.logNow(`Application stopped due to : ${mongoDBErr}`) 
            process.exit()
        })
    })
}
module.exports =  (mongoUrl, schemaName = false) => dbInit(mongoUrl, schemaName);