"use strict"

var timestamp = require("./timestamp") // TODO: just do this inline

var levels = ["spam", "debug", "info", "warn", "error", "fatal"]

var spamLevel = 0
var debugLevel = 1
var infoLevel = 2
var warnLevel = 3
var errorLevel = 4
var fatalLevel = 5

module.exports = function logger(levelStr) {
    this.level = levels.indexOf(levelStr)
    
    if (this.level === -1) {
        this.level = infoLevel
    }
    
    this.log = function(levelStr, msg) {
        console.log(timestamp() + " [" + levelStr + "] " + msg)
    }
    
    this.spam = function(msg) {
        if (spamLevel >= this.level) {
            this.log("spam", msg)
        }
    }
    
    this.debug = function(msg) {
        if (debugLevel >= this.level) {
            this.log("debug", msg)
        }
    }
    
    this.info = function(msg) {
        if (infoLevel >= this.level) {
            this.log("info", msg)
        }
    }
    
    this.warn = function(msg) {
        if (warnLevel >= this.level) {
            this.log("warn", msg)
        }
    }
    
    this.error = function(msg) {
        if (errorLevel >= this.level) {
            this.log("error", msg)
        }
    }
    
    this.fatal = function(msg) {
        if (fatalLevel >= this.level) {
            this.log("fatal", msg)
        }
    }
    
    this.info("Logging initialised")
}
