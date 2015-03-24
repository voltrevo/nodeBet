'use strict';

var dbl = exports;

dbl.set_decimal_places = function(decimal_places)
{
    dbl.tolerance = 0.5 * Math.pow(0.1, decimal_places);
    dbl.decimal_places = decimal_places;
}

dbl.set_decimal_places(9);

dbl.equal = function(x, y)
{
    return (Math.abs(x - y) < dbl.tolerance);
}

dbl.not_equal = function(x, y)
{
    return (Math.abs(x - y) >= dbl.tolerance);
}

dbl.less = function(x, y)
{
    return (x - y < -dbl.tolerance);
}

dbl.greater = function(x, y)
{
    return (x - y > dbl.tolerance);
}

dbl.less_or_equal = function(x, y)
{
    return (x - y < dbl.tolerance);
}

dbl.greater_or_equal = function(x, y)
{
    return (x - y > -dbl.tolerance);
}

dbl.floor = function(x)
{
    return Math.floor(x + dbl.tolerance);
}

dbl.ceil = function(x)
{
    return Math.ceil(x - dbl.tolerance);
}

dbl.to_string = function(x)
{
    if (x !== x) {
        return "NaN"
    }
    
    var str = x.toFixed(dbl.decimal_places);
    
    var i = 0;

    for (; i < str.length; i++)
    {
        if (str[i] === '.')
        {
            break;
        }
    }

    var end = i;
    i++;

    for (; i < str.length; i++)
    {
        if (str[i] !== '0')
        {
            end = i + 1;
        }
    }

    str = str.substr(0, end);

    if (str === '-0')
    {
        str = '0';
    }

    return str;
}

dbl.map = function()
{
    var self = this;
    
    this.data = [];
    
    this.get = function(key)
    {
        return self.data[dbl.to_string(key)];
    }
    
    this.set = function(key, value)
    {
        return (self.data[dbl.to_string(key)] = value);
    }
}

dbl.decimals_used = function(x)
{
    var dp = 0;
    
    while (Math.abs(Math.round(x) - x) > dbl.tolerance)
    {
        x *= 10;
        dp++;
    }
    
    return dp;
}
