'use strict';

var assert = require('assert');

// TODO: these are silly, get rid of them

exports.order = function(username, tag, instrument_name, price, volume, side, expiry)
{
    assert(typeof price === 'number');
    assert(typeof volume === 'number');
    
    this.username = username;
    this.tag = tag;
    this.instrument_name = instrument_name;
    this.price = price;
    this.volume_remaining = volume;
    this.volume_original = volume;
    this.side = side;
    this.expiry = expiry;
}

exports.price_update = function(price, volume)
{
    this.price = price;
    this.volume = volume;
}
