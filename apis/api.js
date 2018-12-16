const passport = require('passport')
const fs = require('fs')
const expRoute = require('express').Router();
let exporter = process.exporter;

expRoute.post('/register', async (req, res) => {
    let param = req.body 
    param = JSON.stringify(param) === JSON.stringify({}) ? req.query : param
    
    if (!exporter.isObjectValid(param, 'email', true, true)) {
        res.status(400).json({
            msg: 'Invalid email or missing'
        }) 
        return 
    }
    if (!exporter.isObjectValid(param, 'name', true, true)) {
        res.status(400).json({
            msg: 'Invalid name or missing'
        }) 
        return 
    }
    if (!exporter.isObjectValid(param, 'password', true, true)) {
        res.status(400).json({
            msg: 'Invalid password or missing`'
        }) 
        return 
    }
    try {
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
            if (exporter.isObjectValid(lastDoc, '_id') && exporter.isObjectValid(lastDoc._id)) {
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
            console.log(`bcrypt Error: ${bErr}`)
            exporter.logNow(`bcrypt Error: ${bErr}`) 
            res.status(500).json({
                msg: 'Something went wrong. Please try after few minutes.'
            })  
            return 
        })
    }
    catch(mongoError) {
        console.log(`Mongo Insert Error: ${mongoError}`)
        exporter.logNow(`Mongo Insert Error: ${mongoError}`) 
        res.status(500).json({
            msg: 'Something went wrong. Please try after few minutes.'
        }) 
        return 
    }

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
            else if (user)
                return res.status(200).json({
                    token: exporter.generateToken(user)
                })
            else {
                console.log(info)
                return res.status(400).json(info)
            }
        }
    )(req, res, next);
})
expRoute.get('/view', exporter.authenticateToken, (req, res) => {
    let param = req.finalTokenExtractedData
    if (exporter.isObjectValid(param, '_id', true, true)) {
        let condition = {
            _id: param._id
        }
        let options = {
            _id: 0,
            name: 1, 
            email: 1,
            address: 1,
            phone: 1
        }
        process.USER.findOne(condition, options) // mongo find
        .then((data) => {
            res.status(200).json({
                result: data,
                msg: 'success'
            })
        })
        .catch((err) => {
            console.log(err)
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
    if (exporter.isObjectValid(param, '_id', true, true)) {
        exporter.createPassword(req.body.password) // create new hash password
        .then((hash) => {
            let options = {
                password: hash
            }
            process.USER.findByIdAndUpdate(param._id, options) // mongo find and update
            .then((data) => {
                res.status(200).json({
                    result: {
                        email: data.email
                    },
                    msg: 'password reset successfully'
                })
            })
            .catch((err) => {
                console.log(err)
                res.status(400).json({
                    msg: 'user not found'
                })
            })
        })
        .catch((err) => {
            console.log(err)
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
    if (exporter.isObjectValid(param, '_id', true, true)) {
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
        let picName = param._id + Math.floor(Date.now() / 1000) + 'profile_pic.png'
        pic.mv(__dirname+'/../public/ProfilePhotoDir/' + picName, (pErr) => {
            if (pErr)
                return res.status(500).json({
                    msg: pErr
                });
            else {
                let options = {
                    profile_pic: picName
                }
                process.USER.findByIdAndUpdate(param._id, options) // mongo find and update
                .then((data) => {
                    res.status(200).json({
                        result: {
                            email: data.email
                        },
                        msg: 'file uploaded'
                    })
                })
                .catch((mongoErr) => {
                    console.log(mongoErr)
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