"use strict";

;(function(module) {
    var util = module.exports
    var sc = (this.sockception === undefined ? {} : this.sockception)
    sc.util = util

    util.router = function() {
        var router = function(s) {
            var route = router.impl.transform(s.value)
            var handler = router.impl.routes[route] || router.impl.default
            handler(s)
        }

        router.impl = {
            transform: function(value) { return value },
            routes: {},
            default: function() {}
        }

        router.transform = function(transform) {
            router.impl.transform = transform
            return router
        }

        router.route = function(route, handler) {
            router.impl.routes[route] = handler
            return router
        }

        router.unroute = function(route) {
            delete router.impl.routes[route]
            return router
        }

        router.unrouteAll = function() {
            router.impl.routes = {}
            return router
        }

        router.default = function(handler) {
            router.impl.default = handler
            return router
        }

        return router
    }

    util.chain = function() {
        var chain = function(s) {
            chain.impl.handlers.forEach(function(handler) {
                handler(s)
            })
        }

        chain.impl = {
            handlers: []
        }

        chain.push = function(handler) {
            chain.impl.handlers.push(handler)
            return chain
        }

        chain.pop = function() {
            chain.impl.handlers.pop()
            return chain
        }

        chain.shift = function() {
            chain.impl.handlers.shift()
            return chain
        }

        chain.unshift = function(handler) {
            chain.impl.handlers.unshift(handler)
            return chain
        }

        chain.clear = function() {
            chain.impl.handlers.length = 0
            return chain
        }

        return chain
    }

    util.acker = function(s) { s.send("ack") }
    util.echo = function(s) { s.send(s.value) }

    util.once = function(f) {
        var called = false

        return function(s) {
            if (called) {
                return
            }

            called = true
            return f(s)
        }
    }
}).call(this, typeof module === "undefined" ? {exports: {}} : module)