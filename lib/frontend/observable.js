"use strict"

module.exports = function observable(value) {
    var self = this
    
    this.value = value
    this.listeners = []

    this.get = function() { return self.value }
    
    this.set = function(newValue) {
        var oldValue = self.value
        self.value = newValue

        for (var i in self.listeners) {
            self.listeners[i](self.value, oldValue)
        }
    }

    this.listen = function(listener) { self.listeners.push(listener) }
}
