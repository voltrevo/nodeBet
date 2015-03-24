'use strict';

var assert = require('assert')
var instrument = require('./instrument').instrument;
var log = require("./winstonWrapper")
var sockception = require("sockception")

exports.instrument_manager = function(args)
{
    var self = this;
    
    this.handle_price_update = function(pu)
    {
        for (var uname in self.subscriptions)
        {
            self.subscriptions[uname].send({
                route: 'price_update',
                content: pu
            })
        }
    }
    
    args.instrument_params.price_update_callback = this.handle_price_update;
    
    this.instrument_params = args.instrument_params;
    this.instrument = null;
    this.admin_uname = args.admin_uname;
    this.subscriptions = {};
    this.oncancels = {}; // TODO: when cleaning up, need to call all these with null
    this.orders = {};
    this.user_positions = {};
    
    this.create_tag = args.create_tag;

    this.get_status = function() { return (self.instrument ? 'open' : 'closed'); };

    this.order_insert = function(
        user,
        order_insert)
    {
        if (self.get_status() !== 'open') {
            order_insert.send({
                route: 'error',
                content: 'Instrument not open'
            })

            return
        }

        var oi = order_insert.value.content
        
        if (!self.instrument.check_price(oi.price)) {
            order_insert.send({
                route: 'error',
                content: 'Price invalid'
            })

            return
        }
        
        if (oi.side !== 'buy' && oi.side !== 'sell') {
            order_insert.send({
                route: 'error',
                content: 'Side invalid'
            })

            return
        }

        if (oi.volume !== Math.round(oi.volume) || oi.volume < 0) {
            order_insert.send({
                route: 'error',
                content: 'Volume invalid'
            })

            return
        }

        var order = {
            tag: self.create_tag(),
            user: user,
            price: oi.price,
            side: oi.side,
            volume_original: oi.volume,
            volume_remaining: oi.volume,
            trade: function(p, v)
            {
                order_insert.send({
                    route: 'trade',
                    content: {
                        price: p,
                        volume: v
                    }
                })
                
                if (!self.user_positions.hasOwnProperty(user.uname)) {
                    self.user_positions[user.uname] = {
                        cash: 0,
                        instrument: 0
                    }
                }
                
                var pos = self.user_positions[user.uname];
                pos.cash += (order.side === 'buy' ? -1 : 1) * p * v;
                pos.instrument += (order.side === 'buy' ? 1 : -1) * v;
                
                order.volume_remaining -= v;
                assert(order.volume_remaining >= 0);
                
                if (order.volume_remaining === 0)
                {
                    /* TODO: sockception doesn't know about closing
                    order_insert.close()
                    */
                }
            },
            pull: function()
            {
                var success = (self.instrument ? self.instrument.pull_order(order) : false);
    
                if (success) {
                    order_insert.send({route: 'deleted'})
                    delete self.orders[order.tag]
                    delete user.orders[order.tag]
                } else {
                    log.info('Received cancel for no longer active order ' + order.tag);
                }
                
                /* TODO: sockception doesn't know about closing
                order_insert.close()
                */
            }
        };
        
        self.orders[order.tag] = order;
        user.orders[order.tag] = order;
        
        order_insert.receive(sockception.util.router()
            .transform(function(value) {
                return value.route
            })
            .route('cancel', sockception.util.once(function() {
                order.pull()
            }))
            .default(function() {
                log.error('Received unknown ')
            }))
        
        order_insert.send({
            route: 'tag',
            content: order.tag
        })

        self.instrument.process_order(order);
    }

    this.subscribe = function(user, sub)
    {
        self.subscriptions[user.uname] = sub
        self.oncancels[user.uname] = function() { sub.close() }
        
        if (self.user_positions[user.uname]) {
            sub.send({
                route: 'position_update',
                content: self.user_positions[user.uname]
            })
        } else {
            sub.send({
                route: 'position_update',
                content: {
                    cash: 0,
                    instrument: 0
                }
            })
        }
        
        sub.send({
            route: 'status',
            content: ( // TODO: really have to figure out this route + content vs route + fields thing
                self.instrument === null ? {
                    instrument_status: self.get_status(),
                    description: '',
                    tick_table: null
                } : {
                    instrument_status: self.get_status(),
                    description: self.instrument.description,
                    tick_table: self.instrument_params.tick_table
                }
            )
        })
        
        if (self.instrument)
        {
            self.instrument.get_all_prices(function(pu) {
                sub.send({
                    route: 'price_update',
                    content: pu
                })
            });
        }
        
        /* TODO: sockception doesn't know about closing
        sub.onclose(function() {
            delete self.subscriptions[user.uname];
            delete self.oncancels[user.uname];
        });
        */
    }

    this.open = function(description, tick_table)
    {
        assert(self.instrument === null);
        
        self.instrument_params.description = description;
        self.instrument_params.tick_table = tick_table;
        self.instrument = new instrument(self.instrument_params);
        
        for (var uname in self.subscriptions)
        {
            self.subscriptions[uname].send({
                route: 'open',
                content: {
                    description: description,
                    tick_table: tick_table
                }
            });
        }
    }
    
    this.close = function(value)
    {
        assert(self.instrument.instrument_status !== 'closed');
        self.instrument.instrument_status = 'closed';
        
        for (var uname in self.subscriptions)
        {
            self.subscriptions[uname].send({
                route: 'close',
                content: value
            })
        }
        
        for (var tag in self.orders)
        {
            self.orders[tag].pull();
        }

        self.user_positions = {};

        self.instrument = null;
    }

    this.force_quoters_on = function()
    {
        for (var uname in self.subscriptions)
        {
            self.subscriptions[uname].send({route: 'force_quoter_on'})
        }
    }
}
