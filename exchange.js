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

        var clientRouter = sockception.util.router()
            .transform(function(value) { return value.route })

        client.receive(clientRouter)
        
        var reg_state = {uname: null, clue: null};
        
        var clue_request_handler = function(clue_request) {
            var db_user = self.users_db[clue_request.value.content.uname];
            
            if (db_user)
            {
                log.info(clue_request.value.content.uname + ' is trying to log in');

                clue_request.send(db_user.clue)
            }
            else
            {
                log.info(clue_request.value.content.uname + ' is trying to register');
                reg_state.uname = clue_request.value.content.uname;
                reg_state.clue = utils.rand_hex();
                clue_request.send(reg_state.clue)
            }
        }

        clientRouter.route('clue_request', clue_request_handler);
        
        clientRouter.route('login_request', function(login_request) {
            var db_user = self.users_db[login_request.value.content.uname];
            
            if (!db_user)
            {
                log.debug("User " + login_request.value.content.uname + " not found. Available users: " + JSON.stringify(Object.keys(self.users_db)))
                login_request.send('failure');
                return;
            }
            
            log.debug('hash received: ' + login_request.value.content.hash);
            log.debug('hash(hash received): ' + hex_sha256(login_request.value.content.hash));
            log.debug('double_hash: ' + login_request.value.content.double_hash);

            if (db_user.double_hash !== hex_sha256(login_request.value.content.hash))
            {
                login_request.send('failure');
                return;
            }
            
            db_user.clue = login_request.value.content.next_clue;
            db_user.double_hash = login_request.value.content.next_double_hash;
            
            self.write_users_db();
            
            if (self.users[login_request.value.content.uname])
            {
                login_request.send('already_logged_in');
                return;
            }

            // bypass clientRouter and just say already logged in
            client.receive(function(s) {
                s.send({
                    route: 'error',
                    content: 'Already logged in'
                })

                log.error("Already logged in")
            })

            var loggedInRouter = sockception.util.router()
                .transform(function(value) {
                    return value.route
                })
                .route("clue_request", clue_request_handler)

            login_request.send('success').receive(loggedInRouter)
            
            self.add_user({
                uname: login_request.value.content.uname,
                router: loggedInRouter
            })
        })
        
        clientRouter.route('registration_request', function(reg_req) {
            if (self.users_db.hasOwnProperty(reg_state.uname))
            {
                reg_req.send('failure');
                return;
            }
            
            if (reg_req.value.content.double_hash !== hex_sha256(hex_sha256(self.config.registration.secret + reg_state.uname) + reg_state.clue))
            {
                reg_req.send('failure');
                return;
            }
            
            var db_user =
            {
                clue: reg_req.value.content.next_clue,
                double_hash: reg_req.value.content.next_double_hash,
                cash: self.config.registration.initial_cash
            };
            
            self.users_db[reg_state.uname] = db_user;
            
            self.write_users_db();

            // bypass clientRouter and just say already logged in
            client.receive(function(s) {
                s.send({
                    route: 'error',
                    content: 'Already logged in'
                })

                log.error("Already logged in")
            })

            var loggedInRouter = sockception.util.router()
                .transform(function(value) {
                    return value.route
                })
                .route("clue_request", clue_request_handler)

            reg_req.send('success').receive(loggedInRouter)
            
            self.add_user({
                uname: reg_state.uname,
                router: loggedInRouter
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
        
        user.router.route('chat', function(chat) {
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
        
        user.router.route('mass_delete', function(mass_delete) {
            for (var tag in user.orders) {
                user.orders[tag].pull()
            }
            
            mass_delete.send('done')
        })
        
        user.router.route('registration_key_request', function(rkr) {
            if (hex_sha256(rkr.value.content.hash) === user.db_record.double_hash)
            {
                user.db_record.double_hash = rkr.value.content.next_double_hash;
                user.db_record.clue = rkr.value.content.next_clue;
                
                self.write_users_db();
                
                // TODO: Not good that we're sending this in plaintext, but I think encryption is the
                // only way around it.
                rkr.send({
                    route: 'registration_key',
                    content: hex_sha256(self.config.registration.secret + rkr.value.content.new_user)
                })
            }
            else
            {
                rkr.send({route: 'failure'});
            }
        })
        
        user.router.route('order_insert', function(order_insert) {
            var instrument = self.instruments[order_insert.value.content.instrument_name]
            
            if (!instrument)
            {
                order_insert.send({
                    route: 'error',
                    content: 'Instrument ' + order_insert.value.content.instrument_name + ' not found'
                })

                return
            }
            
            instrument.order_insert(user, order_insert)
        })
        
        user.router.route('order_delete', function(order_delete) {
            var order = user.orders[order_delete.value.content];
            
            if (order) {
                order.pull();
                order_delete.send('success');
            } else {
                order_delete.send('failure');
            }
        })
        
        user.router.route('open_instrument', function(open_instrument) {
            var instrument = self.instruments[open_instrument.value.content.instrument_name];
            
            if (!instrument) {
                open_instrument.send({
                    route: 'error',
                    content: 'Instrument ' + open_instrument.value.content.instrument_name + ' not found'
                })

                return
            }
            
            if (instrument.get_status() === 'open') {
                open_instrument.send({
                    route: 'error',
                    content: 'Instrument already open'
                })

                return
            }
            
            if (user.uname !== instrument.admin_uname) {
                open_instrument.send({
                    route: 'error',
                    content: 'Access denied'
                })

                return
            }
            
            open_instrument.send({route: 'success'})

            instrument.open(
                open_instrument.value.content.description,
                open_instrument.value.content.tick_table)
        })
        
        user.router.route('close_instrument', function(close_instrument) {
            var instrument = self.instruments[close_instrument.value.content.instrument_name];
            
            if (!instrument)
            {
                close_instrument.send({
                    route: 'error',
                    content: 'Instrument ' + close_instrument.value.content.instrument_name + ' not found'
                })

                return
            }
            
            if (instrument.get_status() === 'closed')
            {
                close_instrument.send({
                    route: 'error',
                    content: 'Instrument already closed'
                })

                return
            }
            
            if (user.uname !== instrument.admin_uname)
            {
                close_instrument.send({
                    route: 'error',
                    content: 'Access denied'
                })

                return
            }
            
            close_instrument.send({route: 'success'})
            
            for (var uname in instrument.user_positions)
            {
                var pos = instrument.user_positions[uname];
                self.users_db[uname].cash += pos.cash + pos.instrument * close_instrument.value.content.value;
            }
            
            self.write_users_db();
            instrument.close(close_instrument.value.content.value) // TODO: value -> price?
        })
        
        user.router.route('instrument_subscription', function(sub) {
            var instrument = self.instruments[sub.value.content.instrument_name];
            
            if (!instrument)
            {
                sub.send({
                    route: 'error',
                    content: 'Instrument ' + sub.value.content.instrument_name + ' not found'
                })

                return;
            }
            
            if (instrument.subscriptions.hasOwnProperty(user.uname))
            {
                sub.send({
                    route: 'error',
                    content: 'Already subscribed'
                })
                
                return
            }
            
            instrument.subscribe(user, sub);
        })
        
        user.router.route('cash', function(cash) {
            cash.send(user.db_record.cash)
        })
        
        user.router.route('force_quoters_on', function(fqo) {
            var instrument = self.instruments[fqo.value.content.instrument_name];

            if (!instrument) {
                fqo.send({
                    route: 'error',
                    content: 'Instrument not found'
                })

                return
            }

            if (user.uname !== instrument.admin_uname) {
                fqo.send({
                    route: 'error',
                    content: 'Access denied'
                })

                return
            }

            instrument.force_quoters_on();
        })
        
        user.router.route('ping', function(ping) {
            ping.send("pong")
        })

        user.router.default(function(msg) {
            log.error(
                "Received message for unknown route: " +
                user.router.impl.transform(msg.value) +
                ", available routes:" +
                JSON.stringify(Object.keys(user.router.impl.routes)))
        })
    }
})()