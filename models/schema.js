var mongoose = require('mongoose');
module.exports = {
    user_info : {
        coll_name: 'user',
        schema: {
            email: { type: String, unique: true, required: true },
            password: { type: String, required: true },
            name: { type: String, required: true },
            phone: { type: Number, default: 0 },
            address: { type: String, default: '' },
            added: { type: Date, default: Date.now },
            profile_pic: { type: String, default: '' }
            // hash: String,
            // salt: String
        }
    }
}