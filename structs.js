'use strict';

var assert = require('assert');

// TODO: these are silly, get rid of them

exports.order = function(username, tag, instrumentName, price, volume, side, expiry) {
    assert(typeof price === 'number');
    assert(typeof volume === 'number');
    
    this.username = username;
    this.tag = tag;
    this.instrumentName = instrumentName;
    this.price = price;
    this.volumeRemaining = volume;
    this.volumeOriginal = volume;
    this.side = side;
    this.expiry = expiry;
}

exports.priceUpdate = function(price, volume) {
    this.price = price;
    this.volume = volume;
}
