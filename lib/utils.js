"use strict"

// TODO: better browser support

exports.randHex = function() {
    var digits = "0123456789abcdef"
    var result = ""
    
    for (var i = 0; i !== 64; i++) {
        result += digits[Math.floor(Math.random() * digits.length)]
    }
    
    return result
}

exports.accumulatorMap = function() {
    var self = this

    this.values = {}

    this.add = function(key, amount) {
        if (!self.values[key]) {
            self.values[key] = amount
        } else {
            self.values[key] += amount
            
            if (self.values[key] === 0) {
                delete self.values[key]
            }
        }
    }

    this.get = function(key) {
        return self.values[key] || 0
    }

    this.pop = function(key) {
        var ret = self.get()
        delete self.values[key]
        
        return ret
    }
}

// TODO: test
exports.clone = function(obj) {
    if (typeof obj === "object") {
        if (Array.isArray(obj)) {
            var arr = []

            for (var i in obj) {
                arr.push(exports.clone(obj[i]))
            }

            return arr
        }
        
        if (obj === null) {
            return null
        }

        var result = {}

        for (var key in result) {
            result[key] = exports.clone(obj[key])
        }
    }
    
    return obj
}

exports.clamp = function(min, x, max) {
    if (x < min) {
        return min
    }
    
    if (x > max) {
        return max
    }
    
    return x
}
