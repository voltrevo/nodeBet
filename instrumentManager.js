"use strict"

var assert = require("assert")
var instrument = require("./instrument").instrument
var log = require("./winstonWrapper")
var sockception = require("sockception")
var once = sockception.util.once

exports.instrumentManager = function(args) {
    var self = this
    
    this.handlePriceUpdate = function(pu) {
        for (var uname in self.subscriptions) {
            self.subscriptions[uname].route("priceUpdate").send(pu)
        }
    }
    
    args.instrumentParams.priceUpdateCallback = this.handlePriceUpdate
    
    this.instrumentParams = args.instrumentParams
    this.instrument = null
    this.adminUname = args.adminUname // TODO: what"s with this "uname" thing?
    this.subscriptions = {}
    this.oncancels = {} // TODO: when cleaning up, need to call all these with null
    this.orders = {}
    this.userPositions = {}
    
    this.createTag = args.createTag

    this.getStatus = function() {
        return (self.instrument ? "open" : "closed")
    }

    this.orderInsert = function(user, orderInsert) {
        var err = orderInsert.route("error")

        if (self.getStatus() !== "open") {
            err.send("Instrument not open")
            return
        }

        var oi = orderInsert.value
        
        if (!self.instrument.checkPrice(oi.price)) {
            err.send("Price invalid")
            return
        }
        
        if (oi.side !== "buy" && oi.side !== "sell") {
            err.send("Side invalid")
            return
        }

        if (oi.volume !== Math.round(oi.volume) || oi.volume < 0) {
            err.send("Volume invalid")
            return
        }

        var order = {
            tag: self.createTag(),
            user: user,
            price: oi.price,
            side: oi.side,
            volumeOriginal: oi.volume,
            volumeRemaining: oi.volume,
            trade: function(p, v) {
                orderInsert.route("trade").send({
                    price: p,
                    volume: v
                })
                
                if (!self.userPositions.hasOwnProperty(user.uname)) {
                    self.userPositions[user.uname] = {
                        cash: 0,
                        instrument: 0
                    }
                }
                
                var pos = self.userPositions[user.uname]
                pos.cash += (order.side === "buy" ? -1 : 1) * p * v
                pos.instrument += (order.side === "buy" ? 1 : -1) * v
                
                order.volumeRemaining -= v
                assert(order.volumeRemaining >= 0)
                
                if (order.volumeRemaining === 0) {
                    /* TODO: sockception doesn"t know about closing
                    orderInsert.close()
                    */
                }
            },
            pull: function() {
                var success = (self.instrument ? self.instrument.pullOrder(order) : false)
    
                if (success) {
                    orderInsert.route("deleted").send()
                    delete self.orders[order.tag]
                    delete user.orders[order.tag]
                } else {
                    log.info("Received cancel for no longer active order " + order.tag)
                }
                
                /* TODO: sockception doesn"t know about closing
                orderInsert.close()
                */
            }
        }
        
        self.orders[order.tag] = order
        user.orders[order.tag] = order

        orderInsert.route("cancel").receive(once(function() {
            order.pull()
        }))
        
        orderInsert.route("tag").send(order.tag)

        self.instrument.processOrder(order)
    }

    this.subscribe = function(user, sub) {
        self.subscriptions[user.uname] = sub
        
        self.oncancels[user.uname] = function() {
            sub.close()
        }
        
        if (self.userPositions[user.uname]) {
            sub.route("positionUpdate").send(self.userPositions[user.uname])
        } else {
            sub.route("positionUpdate").send({
                cash: 0,
                instrument: 0
            })
        }
        
        sub.route("status").send(
            self.instrument === null ? {
                instrumentStatus: self.getStatus(),
                description: "",
                tickTable: null
            } : {
                instrumentStatus: self.getStatus(),
                description: self.instrument.description,
                tickTable: self.instrumentParams.tickTable
            }
        )
        
        if (self.instrument) {
            self.instrument.getAllPrices(function(pu) {
                sub.route("priceUpdate").send(pu)
            })
        }
        
        /* TODO: sockception doesn"t know about closing
        sub.onclose(function() {
            delete self.subscriptions[user.uname]
            delete self.oncancels[user.uname]
        })
        */
    }

    this.open = function(description, tickTable) {
        assert(self.instrument === null)
        
        self.instrumentParams.description = description
        self.instrumentParams.tickTable = tickTable
        self.instrument = new instrument(self.instrumentParams)
        
        for (var uname in self.subscriptions) {
            self.subscriptions[uname].route("open").send({
                description: description,
                tickTable: tickTable
            })
        }
    }
    
    this.close = function(value) {
        assert(self.instrument.instrumentStatus !== "closed")
        self.instrument.instrumentStatus = "closed"
        
        for (var uname in self.subscriptions) {
            self.subscriptions[uname].route("close").send(value)
        }
        
        for (var tag in self.orders) {
            self.orders[tag].pull()
        }

        self.userPositions = {}

        self.instrument = null
    }

    this.forceQuotersOn = function()
    {
        for (var uname in self.subscriptions) {
            self.subscriptions[uname].route("forceQuoterOn").send()
        }
    }
}
