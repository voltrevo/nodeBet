"use strict"

var moment = require("moment")

// TODO: stop this substandard node mimicry
module.exports = function(time) {
    return moment(time).format("YYYY-MM-DD HH:mm:ss.SSS Z")
}
