mongoose = require('mongoose');
module.exports = {
    order : {
        coll_name: 'order',
        schema: {
            product: { type: mongoose.Schema.Types.Mixed, required: true },
            agent_id: { type: String, default: null },
            status: { type: Number, default: 0 },
            order_time: { type: Date, default: Date.now }
        }
    },
    agent_info : {
        coll_name: 'agent_info',
        schema: {
            name: { type: String, required: true },
            phone: { type: Number, default: true },
            email_id: { type: String, default: true },
            address: { type: String, default: true },
            email_id: { type: String, default: true },
        }
    },
    agent_work_info : {
        coll_name: 'agent_work_info',
        schema: {
            agent_id: { type: String, required: true },
            order_id: { type: String, default: true },
            requested_time: { type: Date, default: Date.now },
            current_status: { type: Date, default: Date.now },
            picked_up_at: { type: Date, default: Date.now },
            last_updated: { type: Date, default: Date.now }
        }
    }
}