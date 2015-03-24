'use strict';

var type_check = require('type_check').type_check;

function log_check(type_map, obj)
{
    console.log(JSON.stringify(type_check(type_map, obj)));
}

log_check('string', 'asdf');
log_check('number', 3);
log_check('undefined', undefined);
log_check('undefined');
log_check(null, null);
log_check({clue: 'string'}, {clue: '12345'});
log_check(
    {
        one: 'string',
        two: null,
        three: 'undefined',
        four: ['number', 'string', 'object'],
        five:
        {
            a: 'number',
            b: 'string'
        }
    },
    {
        one: 'adsf',
        two: null,
        three: undefined,
        four: [1, 'asdf', {}],
        five:
        {
            a: 3,
            b: 'asdf'
        }
    });
