const passport = require('passport')
const request = require('request')
const expRoute = require('express').Router();
let exporter = process.exporter;

expRoute.post('/register', (req, res) => {
    let param = req.body 
    param = JSON.stringify(param) === JSON.stringify({}) ? req.query : param
    
    if (param && !exporter.isObjectValid(param, 'email', true, true)) {
        res.status(400).json({
            msg: 'Invalid email or missing'
        }) 
        return 
    }
    if (param && !exporter.isObjectValid(param, 'name', true, true)) {
        res.status(400).json({
            msg: 'Invalid name or missing'
        }) 
        return 
    }
    if (param && !exporter.isObjectValid(param, 'password', true, true)) {
        res.status(400).json({
            msg: 'Invalid password or missing`'
        }) 
        return 
    }
    process.USER.findOne({email : param.email}) // mongo find
    .then((data) => {
        if (data && exporter.isObjectValid(data, 'email', true, true)){
            res.status(400).json({
                msg: 'user already exist'
            })
        }
        else {
            let user = new process.USER() // users schema object
            user.name = param.name
            user.email = param.email
            if (param.phone)
                user.phone = param.phone
            if (param.address)
                user.address = param.address
            exporter.createPassword(param.password) // create hashed password
            .then(async (hash) => {
                user.password = hash
                var lastDoc = await user.save()  // mongo insert
                if (lastDoc && exporter.isObjectValid(lastDoc, '_id') && exporter.isObjectValid(lastDoc._id)) {
                    res.status(200).json({
                        msg: 'registration successful'
                    })
                }
                else
                    res.status(400).json({
                        msg: 'Something went wrong. Please try after few minutes.'
                    })
            })
            .catch((bErr) => {
                exporter.logNow(`bcrypt | Mongo Error: ${bErr}`) 
                res.status(500).json({
                    msg: 'Something went wrong. Please try after few minutes.'
                })  
                return 
            })
        }
    })
    .catch((mongoErr) => {
        exporter.logNow(`USER mongo Error: ${mongoErr}`)
        return res.status(400).json({
            msg: 'Something went wrong. Please try later.'
        })
    })
})
expRoute.post('/login', (req, res, next) => {
    passport.authenticate(
        'local', 
        { 
            // successRedirect: '/',
            // failureRedirect: '/login',
            successFlash: 'Welcome!',
            failureFlash: 'Invalid username or password.' 
        },
        (err, user, info) => {
            if (err) {
                return res.status(500).json(err)
            }
            else if (user) {
                return res.status(200).json({
                    token: exporter.generateToken(user)
                })
            }
            else {
                return res.status(400).json(info)
            }
        }
    )(req, res, next);
})
expRoute.get('/logout', exporter.authenticateToken, (req, res) => {
    let token = req.jwtToken.token
    let secret = req.jwtToken.secret
    if (typeof token == 'string' && typeof secret == 'string') {
        exporter.setHashKeyValuesIntoRedis('expired_token', [token, secret])
        .then(() => {
            res.status(200).json({
                msg: 'logged out'
            })
        })
        .catch((redisErr) => {
            exporter.logNow(`Redis Set Error: ${redisErr} , Token: ${token} , Secret: ${secret}`)
            res.status(400).json({
                msg: 'unable to logout'
            })
        })
    }
    else {
        res.status(404).json({
            msg: 'invalid token'
        })
    }
})
expRoute.get('/view', exporter.authenticateToken, (req, res) => {
    let param = req.finalTokenExtractedData
    if (param && exporter.isObjectValid(param, 'tokenId', true, true)) {
        let condition = {
            _id: param.tokenId
        }
        let options = {
            _id: 0,
            password: 0,
            __v: 0
        }
        process.USER.findOne(condition, options) // mongo find
        .then((data) => {
            res.status(200).json({
                result: data,
                msg: 'success'
            })
        })
        .catch((mongoErr) => {
            exporter.logNow(`USER mongo Error: ${mongoErr}`)
            res.status(400).json({
                msg: 'user not found'
            })
        })
    }
    else {
        res.status(404).json({
            msg: 'invalid token'
        })
    }
})
expRoute.post('/set-pwd', exporter.authenticateToken, (req, res) => {
    let param = req.finalTokenExtractedData
    let token = req.jwtToken.token
    if (param && exporter.isObjectValid(param, 'tokenId', true, true) && typeof token == 'string') {
        exporter.createPassword(req.body.password) // create new hash password
        .then((hash) => {
            let options = {
                password: hash
            }
            process.USER.findByIdAndUpdate(param.tokenId, options) // mongo find and update
            .then((data) => {
                let clientServerOptions = {
                    uri: req.protocol + '://' + req.get('host') + '/' + process.logoutURL,
                    method: 'GET',
                    headers: {
                        'authorization': 'bearer '+token
                    }
                }
                request(clientServerOptions, (err, response) => {
                    if (err || response.statusCode != 200) {
                        res.status(400).json({
                            result: {
                                email: data.email
                            },
                            msg: 'password reset successfully but error occured while logout'
                        })
                    }
                    else {
                        if (response.statusCode == 200)
                            res.status(200).json({
                                result: {
                                    email: data.email
                                },
                                msg: 'password reset successfully'
                            })
                        else
                            res.status(400).json({
                                result: {
                                    email: data.email
                                },
                                msg: 'password reset successfully but logout says bad request'
                            })
                    }
                });
            })
            .catch((mongoErr) => {
                exporter.logNow(`USER Mongo Update Error: ${mongoErr}`)
                res.status(400).json({
                    msg: 'user not found'
                })
            })
        })
        .catch((crtPwdErr) => {
            exporter.logNow(`create password Error: ${crtPwdErr}`)
            res.status(500).json({
                msg: 'Something went wrong. Please try after few minutes.'
            })
        })
        
    }
    else {
        res.status(404).json({
            msg: 'invalid token'
        })
    }
})
expRoute.post('/pic-upload', exporter.authenticateToken, (req, res) => {
    let param = req.finalTokenExtractedData
    if (param && exporter.isObjectValid(param, 'tokenId', true, true)) {
        if (Object.keys(req.files).length == 0) {
            return res.status(400).json({
                msg: 'No files were uploaded.'
            });
        }
        /*
            Following validations can be applied on the image
            - image size
            - image type (jpeg, png, jpg, gif) 
            - disk space
         */

        /*
            // to check the directory status
            fs.stat(__dirname+'/../public/ProfilePhotoDir', function(err, stat){
                if(err){
                console.log(err);
                } else {
                console.log(stat);
                }
            }); 
        */
        let pic = req.files.profile_pic;
        let picName = param.tokenId + Math.floor(Date.now() / 1000) + 'profile_pic.png'
        pic.mv(__dirname+'/../public/ProfilePhotoDir/' + picName, (pErr) => {
            if (pErr)
                return res.status(500).json({
                    msg: pErr
                });
            else {
                let options = {
                    profile_pic: picName
                }
                process.USER.findByIdAndUpdate(param.tokenId, options) // mongo find and update
                .then((data) => {
                    res.status(200).json({
                        result: {
                            email: data.email
                        },
                        msg: 'file uploaded'
                    })
                })
                .catch((mongoErr) => {
                    exporter.logNow(`USER mongo update Error: ${mongoErr}`)
                    res.status(400).json({
                        msg: 'user not found'
                    })
                })
            }
        });
    }
    else {
        res.status(404).json({
            msg: 'invalid token'
        })
    }
})
module.exports = expRoute