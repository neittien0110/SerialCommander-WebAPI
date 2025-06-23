const app = require("configs/app")
const database = require("configs/database")
const hashing = require("configs/hashing")
const jwt = require("configs/jwt")

const config = {
    app,
    database,
    jwt,
    hashing
}

module.exports.config = config