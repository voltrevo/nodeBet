"use strict";

var config = require("configure")
var moment = require("moment")
var log = require("winston")

log.remove(log.transports.Console)

// configure winston
config.loggers.forEach(function(logger) {
    // Construct custom formatter from timeFormat if specified
    if (logger.options.timeFormat) {
        logger.options.formatter = function(options) {
            return (
                moment().format(logger.options.timeFormat) +
                " [" +
                options.level +
                "] " +
                options.message
            )
        }
        delete logger.options.timeFormat
    }

    log.add(log.transports[logger.transport], logger.options)
})

process.on(
    'SIGINT',                                                                                                                                      
    function()
    {
        throw new Error("Caught interrupt signal (SIGINT)")
    })

process.on(
    'SIGTERM',                                                                                                                                      
    function()
    {
        throw new Error("Caught interrupt signal (SIGTERM)")
    })

log.info("Winston logging initialized")
log.info("Application config: " + JSON.stringify(config, null, 4))

module.exports = log