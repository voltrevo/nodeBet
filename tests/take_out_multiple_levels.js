var instrument = require('../instrument').instrument;
var order = require('../structs').order;

var test_instrument = new instrument(
    'test_instrument',
    0,
    100,
    5,
    function(trade_feed)
    {
        console.log(JSON.stringify(trade_feed));
    },
    function(price_update)
    {
        console.log(JSON.stringify(price_update));
    });

// Smack bids
test_instrument.process_order(new order('Andrew', 'a', 'test_instrument', 20.0, 1, 'buy', null));
test_instrument.process_order(new order('Andrew', 'b', 'test_instrument', 20.0, 1, 'buy', null));
test_instrument.process_order(new order('Andrew', 'c', 'test_instrument', 15.0, 3, 'buy', null));
test_instrument.process_order(new order('Andrew', 'd', 'test_instrument', 15.0, 7, 'buy', null));
test_instrument.process_order(new order('Andrew', 'e', 'test_instrument', 10.0, 10, 'buy', null));
test_instrument.process_order(new order('Andrew', 'f', 'test_instrument', 15.0, 30, 'sell', null));

// trade away leftover orders
test_instrument.process_order(new order('Andrew', 'g', 'test_instrument', 10.0, 10, 'sell', null));
test_instrument.process_order(new order('Andrew', 'h', 'test_instrument', 15.0, 18, 'buy', null));

// Lift offers
test_instrument.process_order(new order('Andrew', 'i', 'test_instrument', 5.0, 1, 'sell', null));
test_instrument.process_order(new order('Andrew', 'j', 'test_instrument', 5.0, 1, 'sell', null));
test_instrument.process_order(new order('Andrew', 'k', 'test_instrument', 10.0, 3, 'sell', null));
test_instrument.process_order(new order('Andrew', 'l', 'test_instrument', 10.0, 7, 'sell', null));
test_instrument.process_order(new order('Andrew', 'm', 'test_instrument', 15.0, 10, 'sell', null));
test_instrument.process_order(new order('Andrew', 'n', 'test_instrument', 10.0, 30, 'buy', null));

// trade away leftover orders
test_instrument.process_order(new order('Andrew', 'o', 'test_instrument', 10.0, 18, 'sell', null));
test_instrument.process_order(new order('Andrew', 'p', 'test_instrument', 15.0, 10, 'buy', null));
