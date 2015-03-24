"use strict"

// TODO: logging
// TODO: quotes not amending when theo changes

var clamp
var config
var dbl
var isMarketOpen
var ldr
var log
var lotSizes
var observable
var sendDelete
var sendOrderInsert
var theo

function quoter()
{
    var self = this
    
    this.offset = new observable(1)
    this.on = false
    this.sizeIndex = 0

    this.bidOrder = null
    this.offerOrder = null

    this.bidPrice = null
    this.offerPrice = null

    this.toggle = function() {
        if (self.on && isMarketOpen.get()) {
            return
        }
        
        self.on = !self.on && isMarketOpen.get()
        document.getElementById("quoterOnDisplay").innerHTML = self.on
        self.refresh()
    }

    this.setup = function() {
        self.offset.set(config.quoter.maxOffsetTicks * ldr.tickSize)
        
        self.bidPrice = self.calculateBidPrice()
        self.offerPrice = self.calculateOfferPrice()
        
        self.refreshBid()
        self.refreshOffer()
        
        ldr.bidCells.get(self.bidPrice).style.backgroundColor = "#ccddff"
        ldr.offerCells.get(self.offerPrice).style.backgroundColor = "#ccddff"
    }

    this.refresh = function() {
        ldr.bidCells.get(self.bidPrice).style.backgroundColor = ""
        ldr.offerCells.get(self.offerPrice).style.backgroundColor = ""
        
        self.refreshBid()
        self.refreshOffer()
        
        ldr.bidCells.get(self.bidPrice).style.backgroundColor = "#ccddff"
        ldr.offerCells.get(self.offerPrice).style.backgroundColor = "#ccddff"
    }

    theo.listen(function() {
        if (self.bidPrice === null || self.offerPrice === null) {
            return
        }

        ldr.bidCells.get(self.bidPrice).style.backgroundColor = ""
        ldr.offerCells.get(self.offerPrice).style.backgroundColor = ""
        
        if (self.bidOrder && !self.bidOrder.isFinished()) {
            self.refreshBid()
        } else {
            self.bidPrice = self.calculateBidPrice(); // TODO: this is dodgy, it"s for highlighting
        }
        
        if (self.offerOrder && !self.offerOrder.isFinished()) {
            self.refreshOffer()
        } else {
            self.offerPrice = self.calculateOfferPrice() // TODO: this is dodgy, it"s for highlighting
        }
        
        ldr.bidCells.get(self.bidPrice).style.backgroundColor = "#ccddff"
        ldr.offerCells.get(self.offerPrice).style.backgroundColor = "#ccddff"
    })
    
    isMarketOpen.listen(function(isOpen) {
        if (!isOpen && self.on) {
            self.toggle()
        }
    })

    this.changeOffset = function(offsetDiff) {
        if (!isMarketOpen.get()) {
            log.error("Can\"t change offset while market is closed")
            return
        }
        
        ldr.bidCells.get(self.bidPrice).style.backgroundColor = ""
        ldr.offerCells.get(self.offerPrice).style.backgroundColor = ""
        
        var offset = self.offset.get() + offsetDiff
        offset = clamp(ldr.tickSize, offset, config.quoter.maxOffsetTicks * ldr.tickSize)
        self.offset.set(offset)

        self.bidPrice = self.calculateBidPrice()
        self.offerPrice = self.calculateOfferPrice()
        
        ldr.bidCells.get(self.bidPrice).style.backgroundColor = "#ccddff"
        ldr.offerCells.get(self.offerPrice).style.backgroundColor = "#ccddff"
        
        document.getElementById("quoterOffsetDisplay").innerHTML = dbl.toString(self.offset.get())
        
        self.refresh()
    }

    this.calculateBidPrice = function() {
        var bidPrice = exports.clamp(ldr.bottomPrice, theo.get() - self.offset.get(), ldr.topPrice)
        var level = dbl.floor((bidPrice - ldr.bottomPrice) / ldr.tickSize)
        bidPrice = ldr.bottomPrice + level * ldr.tickSize

        if (bidPrice !== bidPrice) {
            bidPrice = null
        }
        
        return bidPrice
    }

    this.calculateOfferPrice = function() {
        var offerPrice = exports.clamp(ldr.bottomPrice, theo.get() + self.offset.get(), ldr.topPrice)
        var level = dbl.ceil((offerPrice - ldr.bottomPrice) / ldr.tickSize)
        offerPrice = ldr.bottomPrice + level * ldr.tickSize

        if (offerPrice !== offerPrice) {
            offerPrice = null
        }
        
        return offerPrice
    }

    this.refreshBid = function() {
        var order

        self.bidPrice = self.calculateBidPrice()
        
        if (self.on) {
            if (!self.bidOrder || self.bidOrder.isFinished()) {
                order = sendOrderInsert(
                    "buy",
                    self.bidPrice,
                    lotSizes[self.sizeIndex],
                    function() {
                        log.info("quoter bid trade")
                        setTimeout(self.refreshBid, config.quoter.refreshInterval)
                    },
                    function() {
                        if (order !== self.bidOrder) {
                            sendDelete(order.tag, true)
                        }
                    })
                
                self.bidOrder = order

                /* TODO
                self.bidOrder.sub.addHandler("trade", function() {
                    log.info("quoter bid trade")
                    setTimeout(self.refreshBid, config.quoter.refreshInterval)
                })
                */
            } else {
                // Need float comparison functions
                if (dbl.equal(self.bidOrder.price, self.bidPrice) || self.bidOrder.volume !== lotSizes[self.sizeIndex]) {
                    sendDelete(self.bidOrder.tag, true)
                    
                    order = sendOrderInsert(
                        "buy",
                        self.bidPrice,
                        lotSizes[self.sizeIndex],
                        function() {
                            log.info("quoter bid trade")
                            setTimeout(self.refreshBid, config.quoter.refreshInterval)
                        },
                        function() {
                            if (order !== self.bidOrder) {
                                sendDelete(order.tag, true)
                            }
                        })
                    
                    self.bidOrder = order
                }
            }
        } else {
            if (self.bidOrder && !self.bidOrder.isFinished()) {
                // TODO: Really need to keep track of the orders that are actually still in the market
                sendDelete(self.bidOrder.tag, true)
            }
        }
    }

    this.refreshOffer = function() {
        var order

        self.offerPrice = self.calculateOfferPrice()
        
        if (self.on) {
            if (!self.offerOrder || self.offerOrder.isFinished()) {
                //self.offerOrder = sendOrderInsert("sell", self.offerPrice, lotSizes[self.sizeIndex])
                order = sendOrderInsert(
                    "sell",
                    self.offerPrice,
                    lotSizes[self.sizeIndex],
                    function() {
                        console.log("quoter offer trade")
                        setTimeout(self.refreshOffer, config.quoter.refreshInterval)
                    },
                    function() {
                        if (order !== self.offerOrder)
                        {
                            sendDelete(order.tag, true)
                        }
                    })
                
                self.offerOrder = order
            } else {
                if (dbl.equal(self.offerOrder.price, self.offerPrice) || self.offerOrder.volume !== lotSizes[self.sizeIndex]) {
                    sendDelete(self.offerOrder.tag, true)
                    //self.offerOrder = sendOrderInsert("sell", self.offerPrice, lotSizes[self.sizeIndex])
                    order = sendOrderInsert(
                        "sell",
                        self.offerPrice,
                        lotSizes[self.sizeIndex],
                        function() {
                            console.log("quoter offer trade")
                            setTimeout(self.refreshOffer, config.quoter.refreshInterval)
                        },
                        function() {
                            if (order !== self.offerOrder) {
                                sendDelete(order.tag, true)
                            }
                        })
                    
                    self.offerOrder = order
                }
            }
        } else {
            if (self.offerOrder && !self.offerOrder.isFinished()) {
                // TODO: Really need to keep track of the orders that are actually still in the market
                sendDelete(self.offerOrder.tag, true)
            }
        }
    }

    this.changeSize = function(ds) {
        self.sizeIndex = exports.clamp(0, self.sizeIndex + ds, lotSizes.length - 1)
        document.getElementById("quoterSizeDisplay").innerHTML = lotSizes[self.sizeIndex]
        self.refresh()
    }

    this.updateDisplay = function() {
        document.getElementById("quoterOnDisplay").innerHTML = self.on
        document.getElementById("quoterOffsetDisplay").innerHTML = dbl.toString(self.offset.get())
        document.getElementById("quoterSizeDisplay").innerHTML = lotSizes[self.sizeIndex]
    }

    this.bidPrice = this.calculateBidPrice()
    this.offerPrice = this.calculateOfferPrice()
}
