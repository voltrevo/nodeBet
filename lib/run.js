"use strict"

var fs = require("fs")

var config = require("configure")
var sockception = require("sockception")

var exchange = require("./exchange")
var log = require("./winstonWrapper")

new exchange(
    config.exchange,
    {
        read: function() {
            return JSON.parse(fs.readFileSync(config.exchange.usersFile))
        },
        write: function(db) {
            fs.writeFileSync(config.exchange.usersFile, JSON.stringify(db, null, 4))
        }
    },
    sockception.listen({
        port: config.exchange.port,
        log: log
    }))