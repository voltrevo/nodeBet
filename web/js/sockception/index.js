"use strict";

var sockception

;(function(module, require){
    var ws = require("ws")

    sockception = module.exports

    sockception.impl = {}
    var impl = sockception.impl

    impl.idGen = function(prefix) {
        var count = 0
        return function() {
            return prefix + count++
        }
    }

    sockception.fromPrefixAndTransport = function(prefix, transport) {
        var factory = {
            handlerMap: {},
            idGen: impl.idGen(prefix),
            transport: transport,
            log: function() {},
            create: function(id, value) {
                var socket = {
                    impl: {
                        factory: factory,
                        id: id
                    },
                    value: value,
                    send: function(value) {
                        var impl = socket.impl
                        var factory = impl.factory
                        var subsocket = factory.create(factory.idGen(), null)
                        var sendObj = [impl.id, subsocket.impl.id, value]
                        socket.impl.factory.log("Sending:", sendObj)
                        factory.transport.send(JSON.stringify(sendObj))

                        return subsocket
                    },
                    receive: function(cb) {
                        socket.impl.factory.log("Setting handler for:", socket.impl.id)
                        socket.impl.factory.handlerMap[socket.impl.id] = cb
                    }
                }

                return socket
            }
        }

        transport.receive(function(str) {
            var parsed = JSON.parse(str)
            factory.log("Received:", parsed)

            var handler = factory.handlerMap[parsed[0]]

            if (!handler) {
                factory.log("Handler not found for ", parsed[0])
                return
            }

            handler(factory.create(parsed[1], parsed[2]))
        })

        return factory.create("0", null)
    }

    impl.transportPair = function() {
        var handlers = {
            a: function() {},
            b: function() {}
        }

        var transports = {
            a: {
                send: function(msg) {
                    process.nextTick(function() {
                        handlers.b(msg)
                    })
                },
                receive: function(handler) {
                    handlers.a = handler
                }
            },
            b: {
                send: function(msg) {
                    process.nextTick(function() {
                        handlers.a(msg)
                    })
                },
                receive: function(handler) {
                    handlers.b = handler
                }
            }
        }

        return transports
    }

    sockception.pair = function() {
        var pair = impl.transportPair()

        return {
            a: sockception.fromPrefixAndTransport("a", pair.a),
            b: sockception.fromPrefixAndTransport("b", pair.b)
        }
    }

    sockception.listen = function(opt) {
        if (!ws) {
            throw new Error("Websocket server not supported in this environment")
        }

        var wss = new ws.Server({port: opt.port})

        var sockHandler = function() {}

        wss.on("connection", function(websock) {
            var handler = function() {} // TODO: timeout queues?

            websock.on("message", function(msg) {
                handler(msg.toString())
            })

            sockHandler(sockception.fromPrefixAndTransport(
                "s",
                {
                    send: function(s) { websock.send(s) },
                    receive: function(cb) { handler = cb }
                }))
        })

        return {
            receive: function(handler) {
                sockHandler = handler
            }
        }
    }

    impl.clientWebsocketTransport = (
        ws ?
        function(addr) {
            var sock = new ws(addr)
            var handler = function() {}

            sock.on("message", function(msg) {
                handler(msg.toString())
            })

            return {
                send: function(msg) { sock.send(msg) },
                receive: function(cb) { handler = cb }
            }
        } :
        function(addr) {
            var sock = new WebSocket(addr)

            return {
                send: function(msg) { sock.send(msg) },
                receive: function(cb) { sock.onmessage = function(msg) { cb(msg.data.toString()) } }
            }
        }
    )

    sockception.connect = function(address) {
        return sockception.fromPrefixAndTransport("c", impl.clientWebsocketTransport(address))
    }

    sockception.util = require("./util")
})(
    typeof module === "undefined" ? {exports: {}} : module,
    typeof require === "undefined" ? function() {} : require
)