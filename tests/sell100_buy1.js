var instrument = require('../instrument').instrument;
var order = require('../structs').order;

var test_instrument = new instrument(
    'test_instrument',
    0,
    1,
    0.05,
    function(trade_feed)
    {
        console.log(JSON.stringify(trade_feed));
    },
    function(price_update)
    {
        console.log(JSON.stringify(price_update));
    });

test_instrument.process_order(new order('James', '0', 'test_instrument', 0.7, 1, 'sell', null));
test_instrument.process_order(new order('Andrew', '1', 'test_instrument', 0.7, 1, 'buy', null));
