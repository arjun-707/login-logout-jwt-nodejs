const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

process.dbInit('USER', process.CONFIG.mongo.local.url, 'user_info')

passport.use(
    new LocalStrategy({ usernameField: 'email', passwordField: 'password' }, (email, password, done) => {
        process.USER.findOne({ email: email })
        .then((userInfo) => {
            if (userInfo && process.exporter.isObjectValid(userInfo, '_id', true)) {
                if (!process.exporter.verifyPassword(password, userInfo.password)) 
                    return done(null, false, { msg : 'invalid password' })
                else
                    return done(null, userInfo)
            }
            else
                return done(null, false, { msg : 'user not found' })
        })
        .catch((mongoError) => {
            process.exporter.logNow(`Mongo Find Error: ${mongoError}`)
            return done(`Unable to find data`)
        })
    })
)