mongoose = require('mongoose');
module.exports = {
    order : {
        coll_name: 'order',
        schema: {
            product: { type: mongoose.Schema.Types.Mixed, required: true },
            agent_id: { type: String, default: null },
            status: { type: Number, default: 0 },
            order_time: { type: Date, default: Date.now },
            deliver_address: { type: String, default: null },
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
            order_received: { type: Number, default: 0 },
            total_order: { type: Number, default: 0}
        }
    },
    agent_work_info : {
        coll_name: 'agent_work_info',
        schema: {
            agent_id: { type: String, required: true },
            product_id: { type: String, default: true },
            order_id: { type: String, default: true },
            location: { type: String, default: null },
            status: { type: Number, default: 0 },
            source_address: { type: String, default: null },
            destination_address: { type: String, default: null },
            requested_time: { type: Date, default: Date.now },
            picked_up_at: { type: Date, default: null },
            last_updated: { type: Date, default: null }
        }
    }
}