"use strict"

// TODO: More logging

var fs = require("fs")

var config = require("configure")
var log = require("./winstonWrapper")

var instrumentManager = require("./instrumentManager").instrumentManager
var assert = require("assert")
var hexSha256 = require("./sha2").hexSha256
var utils = require("./web/js/utils")
var sockception = require("sockception")
var util = require("util")

exports.exchange = new (function() {
    var self = this

    this.config = config.exchange
    
    this.wss = sockception.listen({
        port: self.config.port,
        log: log
    })

    this.usersDb = JSON.parse(fs.readFileSync(self.config.usersFile))
    
    this.writeUsersDb = function() {
        fs.writeFileSync(self.config.usersFile, JSON.stringify(self.usersDb))
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
    
    this.wss.receive(function(client) {
        log.info("New client")

        // TODO: don"t use impl / expose this kind of thing properly
        client.impl.factory.log = function() {
            var str = ""
            for (var i = 0; i !== arguments.length; i++) {
                if (i !== 0) {
                    str += " "
                }
                str += util.inspect(arguments[i], false, null)
            }
            log.debug("sockception: " + str)
        }
        
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

        client.route("clueRequest").receive(clueRequestHandler)
        
        client.route("loginRequest").receive(function(loginRequest) {
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

            /* TODO: sockception doesn't know about closing
            client.close() // Note this only closes this socket, not the full/outer socket, so long as other subsockets are open
            */

            var loggedInSock = loginRequest.route("success").send()
            loggedInSock.route("clueRequest").receive(clueRequestHandler)
            
            self.addUser({
                uname: loginRequest.value.uname,
                sock: loggedInSock
            })
        })
        
        client.route("registrationRequest").receive(function(regReq) {
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
            loggedInSocket.route("clueRequest").receive(clueRequestHandler)
            
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
        
        user.sock.route("chat").receive(function(chat) {
            // TODO: Recent messages
            self.chatSubscriptions[user.uname] = chat; // TODO: chatSubscriptions -> chatSockets
            
            /* TODO: sockception doesn"t know about closing
            chat.onclose(function() {
                delete self.chatSubscriptions[user.uname]
            })
            */

            chat.receive(function(msg) {
                for (var uname in self.chatSubscriptions)
                {
                    self.chatSubscriptions[uname].send({
                        uname: user.uname,
                        msg: msg.value
                    })
                }
            })
        })
        
        user.sock.route("massDelete").receive(function(massDelete) {
            for (var tag in user.orders) {
                user.orders[tag].pull()
            }
            
            massDelete.send("done")
        })
        
        user.sock.route("registrationKeyRequest").receive(function(rkr) {
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
        
        user.sock.route("orderInsert").receive(function(orderInsert) {
            var instrument = self.instruments[orderInsert.value.instrumentName]
            
            if (!instrument) {
                orderInsert.route("error").send("Instrument " + orderInsert.value.instrumentName + " not found")
                return
            }
            
            instrument.orderInsert(user, orderInsert)
        })
        
        user.sock.route("orderDelete").receive(function(orderDelete) {
            var order = user.orders[orderDelete.value]
            
            if (order) {
                order.pull()
                orderDelete.route("success").send()
            } else {
                orderDelete.route("failure").send()
            }
        })
        
        user.sock.route("openInstrument").receive(function(openInstrument) {
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
        
        user.sock.route("closeInstrument").receive(function(closeInstrument) {
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
        
        user.sock.route("instrumentSubscription").receive(function(sub) {
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
        
        user.sock.route("cash").receive(function(cash) {
            cash.send(user.dbRecord.cash)
        })
        
        user.sock.route("forceQuotersOn").receive(function(fqo) {
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
        
        user.sock.route("ping").receive(function(ping) {
            ping.send("pong")
        })
    }
})()