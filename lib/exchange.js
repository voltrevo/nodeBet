"use strict"

// TODO: More logging

var log = require("./winstonWrapper")

var instrumentManager = require("./instrumentManager").instrumentManager
var assert = require("assert")
var hexSha256 = require("./sha2").hexSha256
var utils = require("./utils") // TODO: bad naming (similar to standard node module called util)

module.exports = function exchange(config, usersDbHandle, wss) {
    var self = this

    this.config = config

    this.wss = wss

    this.usersDb = usersDbHandle.read()

    this.writeUsersDb = function() {
        usersDbHandle.write(self.usersDb)
    }

    this.users = {}
    this.chatSubscriptions = {}

    this.createTag = (function() {
        var count = 0
        return function() {
            return count++
        }
    })()

    this.instruments = {
        testInstrument: new instrumentManager({
            instrumentParams: {
                name: "testInstrument",
            },
            adminUname: "andrew.morris",
            createTag: self.createTag
        }) // TODO: trade ticks
    }

    this.wss.receiveMany(function(client) {
        log.info("New client")

        client.send("connected")

        var regState = {
            uname: null,
            clue: null
        }

        var clueRequestHandler = function(clueRequest) {
            var dbUser = self.usersDb[clueRequest.value]

            if (dbUser) {
                log.info(clueRequest.value + " is trying to log in")
                clueRequest.send(dbUser.clue)
            } else {
                log.info(clueRequest.value + " is trying to register")
                regState.uname = clueRequest.value
                regState.clue = utils.randHex()
                clueRequest.send(regState.clue)
            }
        }

        client.route("clueRequest").receiveMany(clueRequestHandler)

        client.route("loginRequest").receiveMany(function(loginRequest) {
            var dbUser = self.usersDb[loginRequest.value.uname]

            if (!dbUser) {
                log.debug(
                    "User " +
                    loginRequest.value.uname +
                    " not found. Available users: " +
                    JSON.stringify(Object.keys(self.usersDb)))

                loginRequest.route("failure").send()

                return
            }

            log.debug("hash received: " + loginRequest.value.hash)
            log.debug("hash(hash received): " + hexSha256(loginRequest.value.hash))
            log.debug("doubleHash: " + dbUser.doubleHash)

            if (dbUser.doubleHash !== hexSha256(loginRequest.value.hash)) {
                loginRequest.route("failure").send()
                return
            }

            dbUser.clue = loginRequest.value.nextClue
            dbUser.doubleHash = loginRequest.value.nextDoubleHash

            self.writeUsersDb()

            if (self.users[loginRequest.value.uname])
            {
                loginRequest.route("alreadyLoggedIn").send()
                return
            }

            /* TODO: not sure what to do here instead
            client.close()
            */

            var loggedInSock = loginRequest.route("success").send()
            loggedInSock.route("clueRequest").receiveMany(clueRequestHandler)

            self.addUser({
                uname: loginRequest.value.uname,
                sock: loggedInSock
            })
        })

        client.route("registrationRequest").receiveMany(function(regReq) {
            if (self.usersDb.hasOwnProperty(regState.uname)) {
                regReq.route("failure").send()
                return
            }

            if (regReq.value.doubleHash !== hexSha256(hexSha256(self.config.registration.secret + regState.uname) + regState.clue)) {
                regReq.route("failure").send()
                return
            }

            var dbUser = {
                clue: regReq.value.nextClue,
                doubleHash: regReq.value.nextDoubleHash,
                cash: self.config.registration.initialCash
            }

            self.usersDb[regState.uname] = dbUser

            self.writeUsersDb()

            /* TODO: sockception doesn't know about closing
            client.close() // Note this only closes this socket, not the full/outer socket, so long as other subsockets are open
            */

            var loggedInSocket = regReq.route("success").send()
            loggedInSocket.route("clueRequest").receiveMany(clueRequestHandler)

            self.addUser({
                uname: regState.uname,
                sock: loggedInSocket
            })
        })
    })

    this.addUser = function(user)
    {
        assert(self.usersDb[user.uname])
        log.info(user.uname + " logged in"); // TODO: uname -> name?

        user.dbRecord = self.usersDb[user.uname]
        user.orders = {}

        self.users[user.uname] = user

        // TODO: heartbeats

        user.sock.onclose(function() {
            for (var tag in user.orders)
            {
                user.orders[tag].pull()
            }

            delete self.users[user.uname]

            log.info(user.uname + " logged out")
        })

        user.sock.route("chat").receiveMany(function(chat) {
            // TODO: Recent messages
            if (self.chatSubscriptions[user.uname]) {
                self.chatSubscriptions[user.uname].route("close").send()
            }
            self.chatSubscriptions[user.uname] = chat; // TODO: chatSubscriptions -> chatSockets

            chat.onclose(function() {
                delete self.chatSubscriptions[user.uname]
            })

            chat.receiveMany(function(msg) { // TODO: might be a good use case for branch/chop
                for (var uname in self.chatSubscriptions)
                {
                    self.chatSubscriptions[uname].send({
                        uname: user.uname,
                        msg: msg.value
                    })
                }
            })
        })

        user.sock.route("massDelete").receiveMany(function(massDelete) {
            for (var tag in user.orders) {
                user.orders[tag].pull()
            }

            massDelete.send("done")
        })

        user.sock.route("registrationKeyRequest").receiveMany(function(rkr) {
            if (hexSha256(rkr.value.hash) === user.dbRecord.doubleHash) {
                user.dbRecord.doubleHash = rkr.value.nextDoubleHash
                user.dbRecord.clue = rkr.value.nextClue

                self.writeUsersDb()

                // TODO: Not good that we"re sending this in plaintext, but I think encryption is the
                // only way around it.
                rkr.route("registrationKey").send(hexSha256(self.config.registration.secret + rkr.value.newUser))
            } else {
                rkr.route("failure").send()
            }
        })

        user.sock.route("orderInsert").receiveMany(function(orderInsert) {
            var instrument = self.instruments[orderInsert.value.instrumentName]

            if (!instrument) {
                orderInsert.route("error").send("Instrument " + orderInsert.value.instrumentName + " not found")
                return
            }

            instrument.orderInsert(user, orderInsert)
        })

        user.sock.route("openInstrument").receiveMany(function(openInstrument) {
            var instrument = self.instruments[openInstrument.value.instrumentName]
            var err = openInstrument.route("error")

            if (!instrument) {
                err.send("Instrument " + openInstrument.value.instrumentName + " not found")
                return
            }

            if (instrument.getStatus() === "open") {
                err.send("Instrument already open")
                return
            }

            if (user.uname !== instrument.adminUname) {
                err.send("Access denied")
                return
            }

            openInstrument.route("success").send()

            instrument.open(
                openInstrument.value.description,
                openInstrument.value.tickTable)
        })

        user.sock.route("closeInstrument").receiveMany(function(closeInstrument) { // TODO: use the instrument message!
            var instrument = self.instruments[closeInstrument.value.instrumentName]
            var err = closeInstrument.route("error")

            if (!instrument) {
                err.send("Instrument " + closeInstrument.value.instrumentName + " not found")
                return
            }

            if (instrument.getStatus() === "closed") {
                err.send("Instrument already closed")
                return
            }

            if (user.uname !== instrument.adminUname) {
                err.send("Access denied")
                return
            }

            closeInstrument.route("success").send()

            for (var uname in instrument.userPositions) {
                var pos = instrument.userPositions[uname]
                self.usersDb[uname].cash += pos.cash + pos.instrument * closeInstrument.value.value
            }

            self.writeUsersDb()
            instrument.close(closeInstrument.value.value) // TODO: value -> price?
        })

        user.sock.route("instrumentSubscription").receiveMany(function(sub) {
            var instrument = self.instruments[sub.value]
            var err = sub.route("error")

            if (!instrument) {
                err.send("Instrument " + sub.value + " not found")
                return
            }

            if (instrument.subscriptions[user.uname]) {
                err.send("Already subscribed")
                return
            }

            instrument.subscribe(user, sub)
        })

        user.sock.route("cash").receiveMany(function(cash) {
            cash.send(user.dbRecord.cash)
        })

        user.sock.route("forceQuotersOn").receiveMany(function(fqo) {
            var instrument = self.instruments[fqo.value]
            var err = fqo.route("error")

            if (!instrument) {
                err.send("Instrument not found")
                return
            }

            if (user.uname !== instrument.adminUname) {
                err.send("Access denied")
                return
            }

            instrument.forceQuotersOn()
        })

        user.sock.route("ping").receiveMany(function(ping) {
            ping.send("pong")
        })
    }
}
