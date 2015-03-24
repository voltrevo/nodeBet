'use strict';

var web_socket_server = require('ws').Server
var instrument = require('./instrument').instrument
var order = require('./structs').order

var wss = new web_socket_server({port: 21354})

wss.on(
    'connection',
    function(ws)
    {
        var username = null
        
        var question_queue = []
        
        function question(msg, callback)
        {
            ws.send(msg)
            question_queue.push(callback)
        }
        
        function display(msg)
        {
            console.log(msg)
            ws.send(msg)
        }
        
        ws.on(
            'message',
            function(msg)
            {
                if (question_queue.length !== 0)
                {
                    question_queue.shift()(msg)
                }
            })

        question(
            'Username: ',
            function(answer)
            {
                username = answer
                start()
            })

        function start()
        {
            var test_instrument = new instrument(
                'test_instrument',
                0,
                100,
                5,
                function(trade_feed)
                {
                    display(JSON.stringify(trade_feed))
                },
                function(price_update)
                {
                    display(JSON.stringify(price_update))
                })
            
            function get_order()
            {
                var price
                var volume
                var tag
                var side
                
                question(
                    'Price: ',
                    function(answer)
                    {
                        price = parseFloat(answer)
                        get_volume()
                    })
                
                function get_volume()
                {
                    question(
                        'Volume: ',
                        function(answer)
                        {
                            volume = parseInt(answer)
                            get_side()
                        })
                }
                
                function get_side()
                {
                    question(
                        'Side: ',
                        function(answer)
                        {
                            side = (answer.charAt(0) === 'b' ? 'buy' : 'sell')
                            get_tag()
                        })
                }
                
                function get_tag()
                {
                    question(
                        'Tag: ',
                        function(answer)
                        {
                            tag = answer
                            send_order()
                        })
                }
                
                function send_order()
                {
                    test_instrument.process_order(new order(username, tag, 'test_instrument', price, volume, side, null))
                    setTimeout(function() { get_order(); }, 0)
                }
            }
            
            get_order()
        }
    })
