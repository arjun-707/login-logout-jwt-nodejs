const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const bodyParser = require('body-parser');
const passport = require('passport');

require('./common/env')
require('./configs/passport')

const app = express()

const cors = require('cors')
app.use(cors());
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true}))
app.use(fileUpload());
app.use(passport.initialize())

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

let apis = require('./apis/api')
app.use('/user', apis)

/**
 * 404 Handler
 */
app.use((req, res, next)=>{
    return res.status(404).send("Endpoint "+req.url +" not found");
})

/**
 * if any error or exception occurred then write into a JS file so that app can be restarted
 */
process.on('uncaughtException', (err) => {
    console.error(err.stack);
});


app.listen(3000, function(server) {
    console.log("App listening at 3000");
});
