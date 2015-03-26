"use strict"

var assert = require("assert")
var structs = require("./structs")

var priceUpdate = structs.priceUpdate

// TODO: Pass this in?
var tolerance = 0.0000001

exports.instrument = function(args) {
    var self = this
    
    this.name = args.name
    this.min = args.tickTable.bottomPrice
    this.max = args.tickTable.topPrice
    this.tickSize = args.tickTable.tickSize
    this.priceUpdateCallback = args.priceUpdateCallback
    
    this.lastLevelIndex = (args.max - args.min) / args.tickSize
    
    this.levels = []
    this.bestBidLevel = null
    this.bestOfferLevel = null
    
    // TODO: Still applicable?
    // TODO: Implement close() method for settlement
    
    this.description = args.description
    
    this.getAllPrices = function(cb) {
        for (var i in this.levels) {
            var netVolume = this.levels[i].bidVolume - this.levels[i].offerVolume
            
            if (netVolume !== 0) {
                cb(new priceUpdate(
                    this.levels[i].price,
                    netVolume)) // TODO: this is an awful pattern... this function is actually synchronous
            }
        }
    }
    
    function level(price) {
        this.price = price
        this.bids = []
        this.offers = []
        this.bidVolume = 0
        this.offerVolume = 0
        
        this.tradeWithOrder = function(o) {
            assert(this.bids.length === 0 || this.offers.length === 0, "A level should contain only bids or only offers.")
            
            var totalVolumeTraded
            var volumeTraded

            switch (o.side) {
                case "buy":
                    if (this.offers.length !== 0) {
                        totalVolumeTraded = 0
                        
                        while (o.volumeRemaining !== 0 && this.offers.length !== 0) {
                            volumeTraded = Math.min(o.volumeRemaining, this.offers[0].volumeRemaining)
                            totalVolumeTraded += volumeTraded
                            
                            o.trade(this.price, volumeTraded)
                            this.offers[0].trade(this.price, volumeTraded)
                            
                            if (this.offers[0].volumeRemaining === 0) {
                                this.offers.shift()
                            }
                        }
                        
                        this.offerVolume -= totalVolumeTraded
                        self.priceUpdateCallback(new priceUpdate(this.price, -this.offerVolume))
                        
                        assert(
                            o.volumeRemaining === 0 || this.offers.length === 0,
                            "The bid still has volume remaining, so there shouldn\"t be any offers left.")
                    }
                    
                    break
                
                case "sell":
                    if (this.bids.length !== 0) {
                        totalVolumeTraded = 0
                        
                        while (o.volumeRemaining !== 0 && this.bids.length !== 0) {
                            volumeTraded = Math.min(o.volumeRemaining, this.bids[0].volumeRemaining)
                            totalVolumeTraded += volumeTraded
                            
                            o.trade(this.price, volumeTraded)
                            this.bids[0].trade(this.price, volumeTraded)
                            
                            if (this.bids[0].volumeRemaining === 0) {
                                this.bids.shift()
                            }
                        }
                        
                        this.bidVolume -= totalVolumeTraded
                        self.priceUpdateCallback(new priceUpdate(this.price, this.bidVolume))
                        
                        assert(
                            o.volumeRemaining === 0 || this.bids.length === 0,
                            "The offer still has volume remaining, so there shouldn\"t be any bids left.")
                    }
                    
                    break
                    
                default:
                    assert(false, "Order has invalid side: " + o.side)
            }
        }
        
        this.add = function(o) {
            switch (o.side) {
                case "buy": 
                    this.bids.push(o)
                    this.bidVolume += o.volumeRemaining
                    self.priceUpdateCallback(new priceUpdate(this.price, this.bidVolume))
                    
                    break
                
                case "sell":
                    
                    this.offers.push(o)
                    this.offerVolume += o.volumeRemaining
                    self.priceUpdateCallback(new priceUpdate(this.price, -this.offerVolume))
                    
                    break
                
                default:
                    assert(false, "Order has invalid side: " + o.side)
            }
        }
    }
    
    var limit = (self.max - self.min) / self.tickSize
    for (var i = 0; i <= limit; i++) {
        this.levels.push(new level(self.min + i * self.tickSize))
    }

    this.checkPrice = function(price) {
        var levelIndex = Math.round((price - self.min) / self.tickSize)
        return Math.abs(levelIndex - Math.round(levelIndex)) < tolerance
    }
    
    this.priceToLevelIndex = function(price) {
        var result = Math.round((price - self.min) / self.tickSize / tolerance) * tolerance
        return result
    }
    
    this.lookupLevel = function(price) {
        var result = this.levels[this.priceToLevelIndex(price)]
        return result
    }
    
    this.processOrder = function(o) {
        var index

        switch (o.side)
        {
            case "buy":
                while (this.bestOfferLevel && o.price + tolerance >= this.bestOfferLevel.price)
                {
                    this.bestOfferLevel.tradeWithOrder(o)
                    
                    if (this.bestOfferLevel.offers.length !== 0) {
                        break
                    }
                    
                    index = this.priceToLevelIndex(this.bestOfferLevel.price) + 1
                    this.bestOfferLevel = null
                    
                    while (index <= this.lastLevelIndex) {
                        if (this.levels[index].offers.length > 0) {
                            this.bestOfferLevel = this.levels[index]
                            break
                        }
                        
                        index++
                    }
                }
                
                if (o.volumeRemaining > 0) {
                    this.lookupLevel(o.price).add(o); // TODO: dbl module would be useful here?
                    
                    if (this.bestBidLevel) {
                        if (o.price > this.bestBidLevel.price + tolerance) {
                            this.bestBidLevel = this.lookupLevel(o.price)
                        }
                    } else {
                        this.bestBidLevel = this.lookupLevel(o.price)
                    }
                }
                
                break
            
            case "sell":
                while (this.bestBidLevel && o.price - tolerance <= this.bestBidLevel.price)
                {
                    this.bestBidLevel.tradeWithOrder(o)
                    
                    if (this.bestBidLevel.bids.length !== 0) {
                        break
                    }
                    
                    index = this.priceToLevelIndex(this.bestBidLevel.price) - 1
                    this.bestBidLevel = null
                    
                    while (index >= 0) {
                        if (this.levels[index].bids.length > 0) {
                            this.bestBidLevel = this.levels[index]
                            break
                        }
                        
                        index--
                    }
                }
                
                if (o.volumeRemaining > 0) {
                    this.lookupLevel(o.price).add(o)
                    
                    if (this.bestOfferLevel) {
                        if (o.price < this.bestOfferLevel.price - tolerance) {
                            this.bestOfferLevel = this.lookupLevel(o.price)
                        }
                    } else {
                        this.bestOfferLevel = this.lookupLevel(o.price)
                    }
                }
                
                break
            
            default:
                assert(false, "Order has invalid side: " + o.side)
        }
    }
    
    this.pullOrder = function(o) {
        var level = this.lookupLevel(o.price)
        
        assert(o.side === "buy" || o.side === "sell", "Invalid side passed to pullOrder: " + o.side)
        var queue = (o.side === "buy" ? level.bids : level.offers)
        
        for (var i in queue) {
            if (o === queue[i]) {
                queue.splice(i, 1)[0]
                
                if (o.side === "buy") {
                    level.bidVolume -= o.volumeRemaining
                    self.priceUpdateCallback(new priceUpdate(o.price, level.bidVolume))
                } else {
                    level.offerVolume -= o.volumeRemaining
                    self.priceUpdateCallback(new priceUpdate(o.price, -level.offerVolume))
                }
                
                return true
            }
        }
        
        return false
    }
}
