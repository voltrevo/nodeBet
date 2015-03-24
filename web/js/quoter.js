"use strict"

// TODO: logging

var clamp
var config
var dbl
var is_market_open
var ldr
var log
var lot_sizes
var observable
var send_delete
var send_order_insert
var theo

function quoter()
{
    var self = this;
    
    this.offset = new observable(1);
    this.on = false;
    this.size_index = 0;

    this.bid_order = null;
    this.offer_order = null;

    this.bid_price = null;
    this.offer_price = null;

    this.toggle = function()
    {
        if (self.on && is_market_open.get())
        {
            return;
        }
        
        self.on = !self.on && is_market_open.get();
        document.getElementById('quoter_on_display').innerHTML = self.on;
        self.refresh();
    }

    this.setup = function()
    {
        self.offset.set(config.quoter.max_offset_ticks * ldr.tick_size);
        
        self.bid_price = self.calculate_bid_price();
        self.offer_price = self.calculate_offer_price();
        
        self.refresh_bid();
        self.refresh_offer();
        
        ldr.bid_cells.get(self.bid_price).style.backgroundColor = '#ccddff';
        ldr.offer_cells.get(self.offer_price).style.backgroundColor = '#ccddff';
    }

    this.refresh = function()
    {
        ldr.bid_cells.get(self.bid_price).style.backgroundColor = '';
        ldr.offer_cells.get(self.offer_price).style.backgroundColor = '';
        
        self.refresh_bid();
        self.refresh_offer();
        
        ldr.bid_cells.get(self.bid_price).style.backgroundColor = '#ccddff';
        ldr.offer_cells.get(self.offer_price).style.backgroundColor = '#ccddff';
    }

    theo.listen(function()
    {
        if (self.bid_price === null || self.offer_price === null) {
            return
        }

        ldr.bid_cells.get(self.bid_price).style.backgroundColor = '';
        ldr.offer_cells.get(self.offer_price).style.backgroundColor = '';
        
        if (self.bid_order && !self.bid_order.is_finished())
        {
            self.refresh_bid();
        }
        else
        {
            self.bid_price = self.calculate_bid_price(); // TODO: this is dodgy, it's for highlighting
        }
        
        if (self.offer_order && !self.offer_order.is_finished())
        {
            self.refresh_offer();
        }
        else
        {
            self.offer_price = self.calculate_offer_price(); // TODO: this is dodgy, it's for highlighting
        }
        
        ldr.bid_cells.get(self.bid_price).style.backgroundColor = '#ccddff';
        ldr.offer_cells.get(self.offer_price).style.backgroundColor = '#ccddff';
    });
    
    is_market_open.listen(function(is_open)
    {
        if (!is_open && self.on)
        {
            self.toggle();
        }
    });

    this.change_offset = function(offset_diff)
    {
        if (!is_market_open.get())
        {
            log.error('Can\'t change offset while market is closed');
            return;
        }
        
        ldr.bid_cells.get(self.bid_price).style.backgroundColor = '';
        ldr.offer_cells.get(self.offer_price).style.backgroundColor = '';
        
        var offset = self.offset.get() + offset_diff;
        offset = clamp(ldr.tick_size, offset, config.quoter.max_offset_ticks * ldr.tick_size);
        self.offset.set(offset);

        self.bid_price = self.calculate_bid_price();
        self.offer_price = self.calculate_offer_price();
        
        ldr.bid_cells.get(self.bid_price).style.backgroundColor = '#ccddff';
        ldr.offer_cells.get(self.offer_price).style.backgroundColor = '#ccddff';
        
        document.getElementById('quoter_offset_display').innerHTML = dbl.to_string(self.offset.get());
        
        self.refresh();
    }

    this.calculate_bid_price = function()
    {
        var bid_price = exports.clamp(ldr.bottom_price, theo.get() - self.offset.get(), ldr.top_price);
        var level = dbl.floor((bid_price - ldr.bottom_price) / ldr.tick_size);
        bid_price = ldr.bottom_price + level * ldr.tick_size;

        if (bid_price !== bid_price) {
            bid_price = null
        }
        
        return bid_price;
    }

    this.calculate_offer_price = function()
    {
        var offer_price = exports.clamp(ldr.bottom_price, theo.get() + self.offset.get(), ldr.top_price);
        var level = dbl.ceil((offer_price - ldr.bottom_price) / ldr.tick_size);
        offer_price = ldr.bottom_price + level * ldr.tick_size;

        if (offer_price !== offer_price) {
            offer_price = null
        }
        
        return offer_price;
    }

    this.refresh_bid = function()
    {
        var order

        self.bid_price = self.calculate_bid_price();
        
        if (self.on)
        {
            if (!self.bid_order || self.bid_order.is_finished())
            {
                order = send_order_insert(
                    'buy',
                    self.bid_price,
                    lot_sizes[self.size_index],
                    function()
                    {
                        log.info('quoter bid trade');
                        setTimeout(self.refresh_bid, config.quoter.refresh_interval);
                    },
                    function()
                    {
                        if (order !== self.bid_order)
                        {
                            send_delete(order.tag, true);
                        }
                    });
                
                self.bid_order = order;

                /* TODO
                self.bid_order.sub.add_handler(
                    'trade',
                    function()
                    {
                        log.info('quoter bid trade');
                        setTimeout(self.refresh_bid, config.quoter.refresh_interval);
                    });
                */
            }
            else
            {
                // Need float comparison functions
                if (dbl.equal(self.bid_order.price, self.bid_price) || self.bid_order.volume !== lot_sizes[self.size_index])
                {
                    send_delete(self.bid_order.tag, true);
                    
                    order = send_order_insert(
                        'buy',
                        self.bid_price,
                        lot_sizes[self.size_index],
                        function()
                        {
                            log.info('quoter bid trade');
                            setTimeout(self.refresh_bid, config.quoter.refresh_interval);
                        },
                        function()
                        {
                            if (order !== self.bid_order)
                            {
                                send_delete(order.tag, true);
                            }
                        });
                    
                    self.bid_order = order;
                }
            }
        }
        else
        {
            if (self.bid_order && !self.bid_order.is_finished())
            {
                // TODO: Really need to keep track of the orders that are actually still in the market
                send_delete(self.bid_order.tag, true);
            }
        }
    }

    this.refresh_offer = function()
    {
        var order

        self.offer_price = self.calculate_offer_price();
        
        if (self.on)
        {
            if (!self.offer_order || self.offer_order.is_finished())
            {
                //self.offer_order = send_order_insert('sell', self.offer_price, lot_sizes[self.size_index]);
                order = send_order_insert(
                    'sell',
                    self.offer_price,
                    lot_sizes[self.size_index],
                    function()
                    {
                        console.log('quoter offer trade');
                        setTimeout(self.refresh_offer, config.quoter.refresh_interval);
                    },
                    function()
                    {
                        if (order !== self.offer_order)
                        {
                            send_delete(order.tag, true);
                        }
                    });
                
                self.offer_order = order;
            }
            else
            {
                if (dbl.equal(self.offer_order.price, self.offer_price) || self.offer_order.volume !== lot_sizes[self.size_index])
                {
                    send_delete(self.offer_order.tag, true);
                    //self.offer_order = send_order_insert('sell', self.offer_price, lot_sizes[self.size_index]);
                    order = send_order_insert(
                        'sell',
                        self.offer_price,
                        lot_sizes[self.size_index],
                        function()
                        {
                            console.log('quoter offer trade');
                            setTimeout(self.refresh_offer, config.quoter.refresh_interval);
                        },
                        function()
                        {
                            if (order !== self.offer_order)
                            {
                                send_delete(order.tag, true);
                            }
                        });
                    
                    self.offer_order = order;
                }
            }
        }
        else
        {
            if (self.offer_order && !self.offer_order.is_finished())
            {
                // TODO: Really need to keep track of the orders that are actually still in the market
                send_delete(self.offer_order.tag, true);
            }
        }
    }

    this.change_size = function(ds)
    {
        self.size_index = exports.clamp(0, self.size_index + ds, lot_sizes.length - 1);
        document.getElementById('quoter_size_display').innerHTML = lot_sizes[self.size_index];
        self.refresh();
    }

    this.update_display = function()
    {
        document.getElementById('quoter_on_display').innerHTML = self.on;
        document.getElementById('quoter_offset_display').innerHTML = dbl.to_string(self.offset.get());
        document.getElementById('quoter_size_display').innerHTML = lot_sizes[self.size_index];
    }

    this.bid_price = this.calculate_bid_price();
    this.offer_price = this.calculate_offer_price();
}
