"use strict"

var moment

// TODO: stop this substandard node mimicry
exports.timestamp = function(time) {
    return moment(time).format("YYYY-MM-DD HH:mm:ss.SSS Z")
}
