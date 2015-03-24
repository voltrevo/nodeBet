'use strict';

var assert = require('assert');
var structs = require('./structs');

var price_update = structs.price_update;

// TODO: Pass this in?
var tolerance = 0.0000001;

exports.instrument = function(args)
{
    var self = this;
    
    this.name = args.name;
    this.min = args.tick_table.bottom_price;
    this.max = args.tick_table.top_price;
    this.tick_size = args.tick_table.tick_size;
    this.price_update_callback = args.price_update_callback;
    
    this.last_level_index = (args.max - args.min) / args.tick_size;
    
    this.levels = [];
    this.best_bid_level = null;
    this.best_offer_level = null;
    
    // TODO: Still applicable?
    // TODO: Implement close() method for settlement
    
    this.description = args.description;
    
    this.get_all_prices = function(cb)
    {
        for (var i in this.levels)
        {
            var net_volume = this.levels[i].bid_volume - this.levels[i].offer_volume;
            
            if (net_volume !== 0)
            {
                cb(new price_update(
                    this.levels[i].price,
                    net_volume)); // TODO: this is an awful pattern... this function is actually synchronous
            }
        }
    }
    
    function level(price)
    {
        this.price = price;
        this.bids = [];
        this.offers = [];
        this.bid_volume = 0;
        this.offer_volume = 0;
        
        this.trade_with_order = function(o)
        {
            assert(this.bids.length === 0 || this.offers.length === 0, 'A level should contain only bids or only offers.');
            
            switch (o.side)
            {
                case 'buy':
                    
                    if (this.offers.length !== 0)
                    {
                        var total_volume_traded = 0;
                        
                        while (o.volume_remaining !== 0 && this.offers.length !== 0)
                        {
                            var volume_traded = Math.min(o.volume_remaining, this.offers[0].volume_remaining);
                            total_volume_traded += volume_traded;
                            
                            o.trade(this.price, volume_traded);
                            this.offers[0].trade(this.price, volume_traded);
                            
                            if (this.offers[0].volume_remaining === 0)
                            {
                                this.offers.shift();
                            }
                        }
                        
                        this.offer_volume -= total_volume_traded;
                        self.price_update_callback(new price_update(this.price, -this.offer_volume));
                        
                        assert(
                            o.volume_remaining === 0 || this.offers.length === 0,
                            'The bid still has volume remaining, so there shouldn\'t be any offers left.');
                    }
                    
                    break;
                
                case 'sell':
                    
                    if (this.bids.length !== 0)
                    {
                        var total_volume_traded = 0;
                        
                        while (o.volume_remaining !== 0 && this.bids.length !== 0)
                        {
                            var volume_traded = Math.min(o.volume_remaining, this.bids[0].volume_remaining);
                            total_volume_traded += volume_traded;
                            
                            o.trade(this.price, volume_traded);
                            this.bids[0].trade(this.price, volume_traded);
                            
                            if (this.bids[0].volume_remaining === 0)
                            {
                                this.bids.shift();
                            }
                        }
                        
                        this.bid_volume -= total_volume_traded;
                        self.price_update_callback(new price_update(this.price, this.bid_volume));
                        
                        assert(
                            o.volume_remaining === 0 || this.bids.length === 0,
                            'The offer still has volume remaining, so there shouldn\'t be any bids left.');
                    }
                    
                    break;
                    
                default:
                    assert(false, 'Order has invalid side: ' + o.side);
            }
        }
        
        this.add = function(o)
        {
            switch (o.side)
            {
                case 'buy':
                    
                    this.bids.push(o);
                    this.bid_volume += o.volume_remaining;
                    self.price_update_callback(new price_update(this.price, this.bid_volume));
                    
                    break;
                
                case 'sell':
                    
                    this.offers.push(o);
                    this.offer_volume += o.volume_remaining;
                    self.price_update_callback(new price_update(this.price, -this.offer_volume));
                    
                    break;
                
                default:
                    assert(false, 'Order has invalid side: ' + o.side);
            }
        }
    }
    
    var limit = (self.max - self.min) / self.tick_size;
    for (var i = 0; i <= limit; i++)
    {
        this.levels.push(new level(self.min + i * self.tick_size));
    }

    this.check_price = function(price)
    {
        var level_index = Math.round((price - self.min) / self.tick_size);
        return Math.abs(level_index - Math.round(level_index)) < tolerance;
    }
    
    this.price_to_level_index = function(price)
    {
        var result = Math.round((price - self.min) / self.tick_size / tolerance) * tolerance;
        return result;
    }
    
    this.lookup_level = function(price)
    {
        var result = this.levels[this.price_to_level_index(price)];
        return result;
    }
    
    this.process_order = function(o)
    {
        switch (o.side)
        {
            case 'buy':
                
                while (this.best_offer_level && o.price + tolerance >= this.best_offer_level.price)
                {
                    this.best_offer_level.trade_with_order(o);
                    
                    if (this.best_offer_level.offers.length !== 0)
                    {
                        break;
                    }
                    
                    var index = this.price_to_level_index(this.best_offer_level.price) + 1;
                    this.best_offer_level = null;
                    
                    while (index <= this.last_level_index)
                    {
                        if (this.levels[index].offers.length > 0)
                        {
                            this.best_offer_level = this.levels[index];
                            break;
                        }
                        
                        index++;
                    }
                }
                
                if (o.volume_remaining > 0)
                {
                    this.lookup_level(o.price).add(o); // TODO: dbl module would be useful here?
                    
                    if (this.best_bid_level)
                    {
                        if (o.price > this.best_bid_level.price + tolerance)
                        {
                            this.best_bid_level = this.lookup_level(o.price);
                        }
                    }
                    else
                    {
                        this.best_bid_level = this.lookup_level(o.price);
                    }
                }
                
                break;
            
            case 'sell':
                
                while (this.best_bid_level && o.price - tolerance <= this.best_bid_level.price)
                {
                    this.best_bid_level.trade_with_order(o);
                    
                    if (this.best_bid_level.bids.length !== 0)
                    {
                        break;
                    }
                    
                    var index = this.price_to_level_index(this.best_bid_level.price) - 1;
                    this.best_bid_level = null;
                    
                    while (index >= 0)
                    {
                        if (this.levels[index].bids.length > 0)
                        {
                            this.best_bid_level = this.levels[index];
                            break;
                        }
                        
                        index--;
                    }
                }
                
                if (o.volume_remaining > 0)
                {
                    this.lookup_level(o.price).add(o);
                    
                    if (this.best_offer_level)
                    {
                        if (o.price < this.best_offer_level.price - tolerance)
                        {
                            this.best_offer_level = this.lookup_level(o.price);
                        }
                    }
                    else
                    {
                        this.best_offer_level = this.lookup_level(o.price);
                    }
                }
                
                break;
            
            default:
                assert(false, 'Order has invalid side: ' + o.side);
        }
    }
    
    this.pull_order = function(o)
    {
        var level = this.lookup_level(o.price);
        
        assert(o.side === 'buy' || o.side === 'sell', 'Invalid side passed to pull_order: ' + o.side);
        var queue = (o.side === 'buy' ? level.bids : level.offers);
        
        for (var i in queue)
        {
            if (o === queue[i])
            {
                queue.splice(i, 1)[0];
                
                if (o.side === 'buy')
                {
                    level.bid_volume -= o.volume_remaining;
                    self.price_update_callback(new price_update(o.price, level.bid_volume));
                }
                else
                {
                    level.offer_volume -= o.volume_remaining;
                    self.price_update_callback(new price_update(o.price, -level.offer_volume));
                }
                
                return true;
            }
        }
        
        return false;
    }
}
