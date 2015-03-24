'use strict';

// TODO: More logging

var fs = require('fs');

var config = require("configure")
var log = require("./winstonWrapper")

var instrument_manager = require('./instrument_manager').instrument_manager;
var assert = require('assert');
var hex_sha256 = require('./sha2').hex_sha256;
var utils = require('./web/js/utils');
var sockception = require("sockception")
var util = require("util")

exports.exchange = new (function()
{
    var self = this;

    this.config = config.exchange;
    
    this.wss = sockception.listen({port: self.config.port});

    this.users_db = JSON.parse(fs.readFileSync(self.config.users_file));
    
    this.write_users_db = function()
    {
        fs.writeFileSync(self.config.users_file, JSON.stringify(self.users_db));
    }
    
    this.users = {};
    this.chat_subscriptions = {};
    
    this.create_tag = (function() {
        var count = 0
        return function() {
            return count++
        }
    })()
    
    this.instruments =
    {
        test_instrument: new instrument_manager(
            {
                instrument_params:
                {
                    name: 'test_instrument',
                },
                admin_uname: 'andrew.morris',
                create_tag: self.create_tag
            }) // TODO: trade ticks
    };
    
    this.wss.receive(function(client) {
        log.info('New client');

        // TODO: don't use impl / expose this kind of thing properly
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
        
        client.send('connected');
        
        var reg_state = {uname: null, clue: null};
        
        var clue_request_handler = function(clue_request) {
            var db_user = self.users_db[clue_request.value];
            
            if (db_user)
            {
                log.info(clue_request.value + ' is trying to log in');

                clue_request.send(db_user.clue)
            }
            else
            {
                log.info(clue_request.value + ' is trying to register');
                reg_state.uname = clue_request.value;
                reg_state.clue = utils.rand_hex();
                clue_request.send(reg_state.clue)
            }
        }

        client.route('clue_request').receive(clue_request_handler);
        
        client.route('login_request').receive(function(login_request) {
            var db_user = self.users_db[login_request.value.uname];
            
            if (!db_user)
            {
                log.debug("User " + login_request.value.uname + " not found. Available users: " + JSON.stringify(Object.keys(self.users_db)))
                login_request.route('failure').send();
                return;
            }
            
            log.debug('hash received: ' + login_request.value.hash);
            log.debug('hash(hash received): ' + hex_sha256(login_request.value.hash));
            log.debug('double_hash: ' + login_request.value.double_hash);

            if (db_user.double_hash !== hex_sha256(login_request.value.hash))
            {
                login_request.route('failure').send();
                return;
            }
            
            db_user.clue = login_request.value.next_clue;
            db_user.double_hash = login_request.value.next_double_hash;
            
            self.write_users_db();
            
            if (self.users[login_request.value.uname])
            {
                login_request.route('already_logged_in').send()
                return;
            }

            /* TODO: sockception doesn't know about closing
            client.close() // Note this only closes this socket, not the full/outer socket, so long as other subsockets are open
            */

            var loggedInSock = login_request.route('success').send()
            loggedInSock.route('clue_request').receive(clue_request_handler)
            
            self.add_user({
                uname: login_request.value.uname,
                sock: loggedInSock
            })
        })
        
        client.route('registration_request').receive(function(reg_req) {
            if (self.users_db.hasOwnProperty(reg_state.uname))
            {
                reg_req.route('failure').send()
                return;
            }
            
            if (reg_req.value.double_hash !== hex_sha256(hex_sha256(self.config.registration.secret + reg_state.uname) + reg_state.clue))
            {
                reg_req.route('failure').send()
                return;
            }
            
            var db_user =
            {
                clue: reg_req.value.next_clue,
                double_hash: reg_req.value.next_double_hash,
                cash: self.config.registration.initial_cash
            };
            
            self.users_db[reg_state.uname] = db_user;
            
            self.write_users_db();

            /* TODO: sockception doesn't know about closing
            client.close() // Note this only closes this socket, not the full/outer socket, so long as other subsockets are open
            */

            var loggedInSocket = reg_req.route('success').send()
            loggedInSocket.route('clue_request').receive(clue_request_handler)
            
            self.add_user({
                uname: reg_state.uname,
                sock: loggedInSocket
            })
        })
    });
    
    this.add_user = function(user)
    {
        assert(self.users_db[user.uname]);
        log.info(user.uname + ' logged in'); // TODO: uname -> name?
        
        user.db_record = self.users_db[user.uname]
        user.orders = {}
        
        self.users[user.uname] = user;
        
        // TODO: heartbeats
        
        /* TODO: sockception doesn't know about closing
        user.socket.onclose(function() {
            for (var tag in user.orders)
            {
                user.orders[tag].pull();
            }
            
            delete self.users[uname];
        })
        */
        
        user.sock.route('chat').receive(function(chat) {
            // TODO: Recent messages
            self.chat_subscriptions[user.uname] = chat; // TODO: chat_subscriptions -> chatSockets
            
            /* TODO: sockception doesn't know about closing
            chat.onclose(function() {
                delete self.chat_subscriptions[user.uname]
            })
            */

            chat.receive(function(msg) {
                for (var uname in self.chat_subscriptions)
                {
                    self.chat_subscriptions[uname].send({
                        uname: user.uname,
                        msg: msg.value
                    })
                }
            })
        });
        
        user.sock.route('mass_delete').receive(function(mass_delete) {
            for (var tag in user.orders) {
                user.orders[tag].pull()
            }
            
            mass_delete.send('done')
        })
        
        user.sock.route('registration_key_request').receive(function(rkr) {
            if (hex_sha256(rkr.value.hash) === user.db_record.double_hash)
            {
                user.db_record.double_hash = rkr.value.next_double_hash;
                user.db_record.clue = rkr.value.next_clue;
                
                self.write_users_db();
                
                // TODO: Not good that we're sending this in plaintext, but I think encryption is the
                // only way around it.
                rkr.route('registration_key').send(hex_sha256(self.config.registration.secret + rkr.value.new_user))
            }
            else
            {
                rkr.route('failure').send()
            }
        })
        
        user.sock.route('order_insert').receive(function(order_insert) {
            var instrument = self.instruments[order_insert.value.instrument_name]
            
            if (!instrument)
            {
                order_insert.route('error').send('Instrument ' + order_insert.value.instrument_name + ' not found')
                return
            }
            
            instrument.order_insert(user, order_insert)
        })
        
        user.sock.route('order_delete').receive(function(order_delete) {
            var order = user.orders[order_delete.value];
            
            if (order) {
                order.pull();
                order_delete.route('success').send()
            } else {
                order_delete.route('failure').send()
            }
        })
        
        user.sock.route('open_instrument').receive(function(open_instrument) {
            var instrument = self.instruments[open_instrument.value.instrument_name];
            var err = open_instrument.route('error')
            
            if (!instrument) {
                err.send('Instrument ' + open_instrument.value.instrument_name + ' not found')
                return
            }
            
            if (instrument.get_status() === 'open') {
                err.send('Instrument already open')
                return
            }
            
            if (user.uname !== instrument.admin_uname) {
                err.send('Access denied')
                return
            }
            
            open_instrument.route('success').send()

            instrument.open(
                open_instrument.value.description,
                open_instrument.value.tick_table)
        })
        
        user.sock.route('close_instrument').receive(function(close_instrument) {
            var instrument = self.instruments[close_instrument.value.instrument_name];
            var err = close_instrument.route('error')
            
            if (!instrument) {
                err.send('Instrument ' + close_instrument.value.instrument_name + ' not found')
                return
            }
            
            if (instrument.get_status() === 'closed') {
                err.send('Instrument already closed')
                return
            }
            
            if (user.uname !== instrument.admin_uname) {
                err.send('Access denied')
                return
            }
            
            close_instrument.route('success').send()
            
            for (var uname in instrument.user_positions) {
                var pos = instrument.user_positions[uname];
                self.users_db[uname].cash += pos.cash + pos.instrument * close_instrument.value.value;
            }
            
            self.write_users_db();
            instrument.close(close_instrument.value.value) // TODO: value -> price?
        })
        
        user.sock.route('instrument_subscription').receive(function(sub) {
            var instrument = self.instruments[sub.value];
            var err = sub.route('error')

            if (!instrument) {
                err.send('Instrument ' + sub.value + ' not found')
                return;
            }
            
            if (instrument.subscriptions.hasOwnProperty(user.uname)) {
                err.send('Already subscribed')
                return
            }
            
            instrument.subscribe(user, sub);
        })
        
        user.sock.route('cash').receive(function(cash) {
            cash.send(user.db_record.cash)
        })
        
        user.sock.route('force_quoters_on').receive(function(fqo) {
            var instrument = self.instruments[fqo.value];
            var err = fqo.route('error')

            if (!instrument) {
                err.send('Instrument not found')
                return
            }

            if (user.uname !== instrument.admin_uname) {
                err.send('Access denied')
                return
            }

            instrument.force_quoters_on();
        })
        
        user.sock.route('ping').receive(function(ping) {
            ping.send("pong")
        })

        /* TODO: should there still be a way to do this? (probably)
        user.router.default(function(msg) {
            log.error(
                "Received message for unknown route: " +
                user.router.impl.transform(msg.value) +
                ", available routes:" +
                JSON.stringify(Object.keys(user.router.impl.routes)))
        })
        */
    }
})()