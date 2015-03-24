'use strict';

var timestamp = exports.timestamp;

var levels = ['spam', 'debug', 'info', 'warn', 'error', 'fatal'];

var spam_level = 0;
var debug_level = 1;
var info_level = 2;
var warn_level = 3;
var error_level = 4;
var fatal_level = 5;

exports.logger = function(level_str)
{
    this.level = levels.indexOf(level_str);
    
    if (this.level == -1)
    {
        this.level = info_level;
    }
    
    this.log = function(level_str, msg)
    {
        console.log(timestamp() + ' [' + level_str + '] ' + msg);
    }
    
    this.spam = function(msg)
    {
        if (spam_level >= this.level)
        {
            this.log('spam', msg);
        }
    }
    
    this.debug = function(msg)
    {
        if (debug_level >= this.level)
        {
            this.log('debug', msg);
        }
    }
    
    this.info = function(msg)
    {
        if (info_level >= this.level)
        {
            this.log('info', msg);
        }
    }
    
    this.warn = function(msg)
    {
        if (warn_level >= this.level)
        {
            this.log('warn', msg);
        }
    }
    
    this.error = function(msg)
    {
        if (error_level >= this.level)
        {
            this.log('error', msg);
        }
    }
    
    this.fatal = function(msg)
    {
        if (fatal_level >= this.level)
        {
            this.log('fatal', msg);
        }
    }
    
    this.info('Logging initialised');
}
