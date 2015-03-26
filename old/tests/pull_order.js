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

test_instrument.process_order(new order('Andrew', 'a', 'test_instrument', 10.0, 1, 'buy', null));
test_instrument.process_order(new order('Andrew', 'b', 'test_instrument', 5.0, 3, 'buy', null));

console.log(JSON.stringify(test_instrument.pull_order('Andrew', 'b', 'buy', 5.0)));
