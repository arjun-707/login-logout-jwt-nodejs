const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
var fs = require('fs');

const __CONFIG = require(path.dirname(__filename)+"/config/app-configs/services.json");
const SERVICES = Object.keys(__CONFIG.application);

const app = express();
app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: true}));

/**
 * Delivery Service 
 */
if (SERVICES.indexOf("delivery") != -1) {
    const delivery = require('./apis/api')
    app.use("/delivery", delivery);
}

/**
 * 404 Handler
 */
app.use((req,res,next)=>{
    return res.status(404).send("Endpoint "+req.url +" not found");
})

/**
 * if any error or exception occurred then write into a JS file so that app can be restarted
 */
process.on('uncaughtException', (err) => {
    console.error(err.stack);
});


/**
 * Enable Node Cluster
 */
const cluster = require('cluster');
startServer = (listenPort, services) => {
    var server = app.listen(listenPort, function() {
        var host = server.address().address;
        var port = server.address().port;
        console.log("App listening at http://%s:%s", host, port);
        console.log("Service Running:  " + services.join(","));
    });
}
/* if (cluster.isMaster) {
    let numAlexaReqs = numAlexaStat = numAlexaGet = 0;
    // Count requests
    function messageHandler(msg) {
        if (msg.cmd) {
            switch (msg.cmd) {
                case 'notifyAlexaRequest':
                    numAlexaReqs += 1;
                    console.log(`alexa 'request' count = ${numAlexaReqs}`);
                break;
                case 'notifyAlexaStatus':
                    numAlexaStat += 1;
                    console.log(`alexa 'status' count = ${numAlexaStat}`);
                break;
                case 'notifyAlexaGet':
                    numAlexaGet += 1;
                    console.log(`alexa 'get' count = ${numAlexaGet}`);
                break;
            }
        }
    }
    const numCPUs = require('os').cpus().length;
    
    // Fork workers.
    for (let i = 0; i < numCPUs; i++)
        cluster.fork();
    for (const id in cluster.workers)
        cluster.workers[id].on('message', messageHandler);

    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
    });
} 
else { */
    if (SERVICES.length < 1) {
        console.error('Service name not defined in config');
        process.exit();
        return;
    }
    if (process.argv.length == 3 && !isNaN(process.argv[2])) {
        const port = parseInt(process.argv[2])
        startServer(port, SERVICES)
    }
    else {
        const port = __CONFIG.port.dev;
        if ('live' === __CONFIG.run)
            port = __CONFIG.port.live;
        if (isNaN(port) || typeof port == undefined) {
            console.error('Port is missing');
            process.exit();
        }
        else
            startServer(port, SERVICES);
    }
/* } */
