"use strict"

var dbl = exports

dbl.setDecimalPlaces = function(decimalPlaces) {
    dbl.tolerance = 0.5 * Math.pow(0.1, decimalPlaces)
    dbl.decimalPlaces = decimalPlaces
}

dbl.setDecimalPlaces(9)

dbl.equal = function(x, y) {
    return (Math.abs(x - y) < dbl.tolerance)
}

dbl.notEqual = function(x, y) {
    return (Math.abs(x - y) >= dbl.tolerance)
}

dbl.less = function(x, y) {
    return (x - y < -dbl.tolerance)
}

dbl.greater = function(x, y) {
    return (x - y > dbl.tolerance)
}

dbl.lessOrEqual = function(x, y) {
    return (x - y < dbl.tolerance)
}

dbl.greaterOrEqual = function(x, y) {
    return (x - y > -dbl.tolerance)
}

dbl.floor = function(x) {
    return Math.floor(x + dbl.tolerance)
}

dbl.ceil = function(x) {
    return Math.ceil(x - dbl.tolerance)
}

dbl.toString = function(x) {
    if (x !== x) {
        return "NaN"
    }
    
    var str = x.toFixed(dbl.decimalPlaces)
    
    var i = 0

    for (; i < str.length; i++) {
        if (str[i] === ".") {
            break
        }
    }

    var end = i
    i++

    for (; i < str.length; i++) {
        if (str[i] !== "0") {
            end = i + 1
        }
    }

    str = str.substr(0, end)

    if (str === "-0") {
        str = "0"
    }

    return str
}

dbl.map = function() {
    var self = this
    
    this.data = []
    
    this.get = function(key) {
        return self.data[dbl.toString(key)]
    }
    
    this.set = function(key, value) {
        return (self.data[dbl.toString(key)] = value)
    }
}

dbl.decimalsUsed = function(x) {
    var dp = 0
    
    while (Math.abs(Math.round(x) - x) > dbl.tolerance) {
        x *= 10
        dp++
    }
    
    return dp
}
