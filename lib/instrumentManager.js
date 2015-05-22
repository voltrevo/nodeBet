"use strict"

var assert = require("assert")
var instrument = require("./instrument").instrument
var log = require("./winstonWrapper")
var sockception = require("sockception")

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
            },
            pull: function() {
                var success = (self.instrument ? self.instrument.pullOrder(order) : false)

                if (success) {
                    orderInsert.route("deleted").send()
                    delete self.orders[order.tag]
                    delete user.orders[order.tag]
                } else {
                    log.info("Received delete for no longer active order " + order.tag)
                }
            }
        }

        self.orders[order.tag] = order
        user.orders[order.tag] = order

        orderInsert.route("delete").receiveOne(function(del) {
            if (self.orders[order.tag]) {
                order.pull()
                del.route("success").send()
            } else {
                del.route("failure").send()
            }
        })

        orderInsert.route("tag").send(order.tag)

        self.instrument.processOrder(order)
    }

    this.subscribe = function(user, sub) {
        self.subscriptions[user.uname] = sub

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

        sub.onclose(function() {
            delete self.subscriptions[user.uname]
        })
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

    var mouseMazerSock = sockception.connect('ws://localhost:56657/')
    var counter = 0

    console.log('Connecting to mouseMazer server')
    mouseMazerSock.route('connected').receiveOne(function() {
        console.log('connected')
        mouseMazerSock.route('getStarts').send().receiveMany(function() {
            console.log('started')
            self.open(
                'Mouse Mazer #' + (++counter),
                {
                    bottomPrice: 0,
                    tickSize: 0.05,
                    topPrice: 1
                }
            )
        })

        mouseMazerSock.route('getStops').send().receiveMany(function(stopSock) {
            console.log('stopped', stopSock.value)
            self.close(stopSock.value === 'success' ? 1 : 0)
        })

        setInterval(function() {
            mouseMazerSock.route('ping').send()
        }, 20000)
    })
}
