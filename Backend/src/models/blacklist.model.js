const mongoose = require('mongoose');


const blackListTokenSchema = new mongoose.Schema({
    token: {
        type: String,
        required: [true, "Token is required"]
    }
}, { timestamps: true })

const tokenBlacklistModel = mongoose.model("blacklistTokens", blackListTokenSchema)
module.exports = tokenBlacklistModel
