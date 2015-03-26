"use strict"

// TODO: Non-chrome testing

var alertify
var config
var dbl
var hexSha256
var insertAfter
var observable
var quoter
var sockception
var utils // TODO: misnaming: this comes from util.js

// TODO: fix global pollution :-(
var theo
var isMarketOpen
var ldr
var log
var lotSizes
var sendOrderInsert
var sendDelete

;(function() {

    // TODO: fix global area pollution
    var app = {}
    app.log = new exports.logger("debug")
    log = app.log

    var randHex = exports.randHex
    var clamp = exports.clamp

    var username
    var chat = null

    var tradeElements = []

    // TODO: fix magic numbers
    theo = new (function() {
        var self = this

        this.observableValue = new observable(0)

        this.set = this.observableValue.set
        this.get = this.observableValue.get
        this.listen = this.observableValue.listen

        this.change = function(dt) {
            if (ldr.bottomPrice !== null && ldr.topPrice !== null) {
                var newValue = clamp(ldr.bottomPrice, self.get() + dt, ldr.topPrice)
                self.set(newValue)
            }
        }
    })

    var keyHandlers = []

    isMarketOpen = new observable(false)

    var sock = null

    var position = 0
    var cash = 0
    var instrumentCash = 0

    var orders = {}

    lotSizes = [1, 2, 5, 10, 20, 50, 100, 200]
    var lotIndex = 0

    function bindHotkeys() { // TODO: use jwerty or similar
        // d
        keyHandlers[68] = function() { massDelete() }
        
        // Left
        keyHandlers[37] = function() { if (isMarketOpen.get()) qr.changeOffset(-ldr.tickSize) }

        // Up
        keyHandlers[38] = function() { if (isMarketOpen.get()) theo.change(ldr.tickSize) }

        // Right
        keyHandlers[39] = function() { if (isMarketOpen.get()) qr.changeOffset(ldr.tickSize) }

        // Down
        keyHandlers[40] = function() { if (isMarketOpen.get()) theo.change(-ldr.tickSize) }

        // q
        keyHandlers[81] = function() { if (isMarketOpen.get()) qr.toggle() }
        
        // r
        keyHandlers[82] = function() { if (isMarketOpen.get()) qr.refresh() }
        
        // a
        keyHandlers[65] = function() { qr.changeSize(1) }
        
        // z
        keyHandlers[90] = function() { qr.changeSize(-1) }
        
        // s
        keyHandlers[83] = function() { increaseLotSize() }
        
        // x
        keyHandlers[88] = function() { decreaseLotSize() }
        
        // h
        keyHandlers[72] = function() { showHotkeys() }
    }

    function unbindHotkeys() {
        keyHandlers = []
    }

    function formatCash(x) {
        if (dbl.equal(x, 0)) {
            x = 0 // Avoids -0.00
        }
        
        return "$" + x.toFixed(2)
    }

    function getSelectorValue(id) {
        var selector = document.getElementById(id)
        return selector.options[selector.selectedIndex].value
    }

    function removeElement(node) {
        node.parentNode.removeChild(node)
    }

    function removeChildren(node) {
        while (node.firstChild) {
            node.removeChild(node.firstChild)
        }
    }

    function addMessage(msg) {
        var msgDiv = document.createElement("div")
        msgDiv.appendChild(document.createTextNode(msg))
        msgDiv.style.margin = "10px"
        msgDiv.style.wordWrap = "break-word"
        
        var cc = document.getElementById("chatDisplay")
        cc.appendChild(msgDiv)
        cc.scrollTop = cc.scrollHeight
    }

    function addErrorMessage(msg) {
        var msgDiv = document.createElement("div")
        msgDiv.appendChild(document.createTextNode(msg))
        msgDiv.style.margin = "10px"
        msgDiv.style.wordWrap = "break-word"
        msgDiv.style.color = "red"
        
        var cc = document.getElementById("chatDisplay")
        cc.appendChild(msgDiv)
        cc.scrollTop = cc.scrollHeight
    }

    // TODO: this is horrible
    function showHotkeys() {
        alertify.alert(
            "d: delete all orders<br>" +
            "s: increment click lot size<br>" +
            "x: decrement lot size<br>" +
            "up arrow: increment theo<br>" +
            "down arrow: decrement theo<br>" +
            "q: toggle quoter<br>" +
            "left arrow: tighten quoter<br>" +
            "right arrow: widen quoter<br>" +
            "a: increment quoter size<br>" +
            "z: decrement quoter size<br>" +
            "r: refill quotes<br>" +
            "h: show hotkeys")
    }

    document.onkeydown = function(e) {
        if (keyHandlers[e.keyCode]) {
            e.preventDefault()
            keyHandlers[e.keyCode]()
        }
    }

    sendOrderInsert = function(side, price, volume, tradeCb) {
        price = ldr.normalizePrice(price)
        
        var order = {
            instrumentName: "testInstrument",
            price: price,
            volume: volume,
            side: side,
            expiry: null
        }
        
        order.sock = sock.route("orderInsert").send(order)

        order.sock.route("tag").receiveOne(function(tag) { // TODO: still interested in removing the tag concept... but not sure anymore
            order.tag = tag.value
            orders[tag.value] = order
            
            order.orderStatus = "active"
            order.webElements.statusCell.innerHTML = "active"
        })

        order.sock.route("trade").receiveMany(function(tradeSock, stop) {
            var trade = tradeSock.value

            position += (order.side === "buy" ? 1 : -1) * trade.volume
            cash += (order.side === "buy" ? -1 : 1) * trade.price * trade.volume
            
            document.getElementById("posDisplay").innerHTML = position
            document.getElementById("posDisplay").style.backgroundColor = (order.side === "buy" ? "#88FF88" : "FF8888")
            
            // TODO: Need to clear timeout if a new pos change comes in
            setTimeout(
                function()
                {
                    document.getElementById("posDisplay").style.backgroundColor = ""
                },
                500)
            
            document.getElementById("cashDisplay").innerHTML = formatCash(cash + instrumentCash)
            updateValuation() // Takes care of valuation change. TODO: Do this better.
            
            createTrade(
                order.side,
                trade.price,
                trade.volume)
            
            order.volume -= trade.volume
            order.webElements.volumeCell.innerHTML = order.volume
            
            if (order.volume === 0) {
                order.orderStatus = "fully traded"
                order.webElements.statusCell.innerHTML = order.orderStatus
                
                stop()

                setTimeout(
                    function()
                    {
                        removeElement(order.webElements.row)
                        delete orders[order.tag]
                    },
                    500)
            }
            
            // TODO: do this better
            if (tradeCb) {
                tradeCb()
            }
        })

        order.sock.route("deleted").receiveOne(function() {
            handleOrderDeleted(order)
        })

        order.sock.route("error").receiveMany(function(error) {
            order.orderStatus = "rejected"
            order.webElements.statusCell.innerHTML = "rejected"

            alertify.error(error.value)
            
            setTimeout(
                function()
                {
                    removeElement(order.webElements.row) // TODO: is this ok to call multiple times?
                    delete orders[order.tag]
                },
                500)
        })

        order.tag = null
        
        createOrder(order)
        
        return order
    }

    function createOrder(order) {
        order.orderStatus = "pending"
        order.isFinished = function() {
            return (order.orderStatus !== "active" && order.orderStatus !== "pending")
        }
        
        order.webElements = {}
        order.webElements.row = document.createElement("tr")
        order.webElements.sideCell = document.createElement("td")
        order.webElements.priceCell = document.createElement("td")
        order.webElements.volumeCell = document.createElement("td")
        order.webElements.statusCell = document.createElement("td")
        order.webElements.removeCell = document.createElement("td")
        
        order.webElements.row.appendChild(order.webElements.sideCell)
        order.webElements.row.appendChild(order.webElements.priceCell)
        order.webElements.row.appendChild(order.webElements.volumeCell)
        order.webElements.row.appendChild(order.webElements.statusCell)
        order.webElements.row.appendChild(order.webElements.removeCell)
        
        order.webElements.sideCell.innerHTML = order.side
        order.webElements.priceCell.innerHTML = dbl.toString(order.price)
        order.webElements.volumeCell.innerHTML = order.volume
        order.webElements.statusCell.innerHTML = order.orderStatus
        order.webElements.removeCell.innerHTML = "x"
        
        order.webElements.removeCell.onclick = function() {
            sendDelete(order, false)
        }
        
        for (var key in order.webElements) {
            if (key !== "row") {
                order.webElements[key].align = "center"
                order.webElements[key].style.padding = 2
            }
        }
        
        insertAfter(document.getElementById("orderHeadings"), order.webElements.row)
    }

    function createTrade(side, price, volume) {
        price = Math.round(100 * price) / 100
        
        var elements = {}
        elements.row = document.createElement("tr")
        elements.sideCell = document.createElement("td")
        elements.priceCell = document.createElement("td")
        elements.volumeCell = document.createElement("td")
        
        elements.row.appendChild(elements.sideCell)
        elements.row.appendChild(elements.priceCell)
        elements.row.appendChild(elements.volumeCell)
        
        elements.sideCell.innerHTML = side
        elements.priceCell.innerHTML = dbl.toString(price)
        elements.volumeCell.innerHTML = volume
        
        for (var key in elements) {
            if (key !== "row") {
                elements[key].align = "center"
                elements[key].style.padding = 2
            }
        }
        
        insertAfter(document.getElementById("tradeHeadings"), elements.row)

        tradeElements.push(elements)
    }

    function clearTrades() {
        for (var i in tradeElements) {
            removeElement(tradeElements[i].row)
        }

        tradeElements = []
    }

    sendDelete = function(order, fromQuoter) {
        // TODO: make better
        if (!fromQuoter) {
            if (order === qr.bidOrder || order === qr.offerOrder) {
                return
            }
        }
        
        if (order && order.orderStatus !== "deleting" && order.orderStatus !== "deleted") {
            //console.log("actually sendDelete(\"" + tag + "\"), status: " + orders[tag].orderStatus)
            
            order.orderStatus = "deleting"
            order.webElements.statusCell.innerHTML = "deleting"
            
            // TODO: argh why sock and not order.sock?
            var del = order.sock.route("delete").send()

            del.route("success").receiveOne(function() {
                handleOrderDeleted(order)
            })

            del.route("failure").receiveOne(function() {
                log.info("Tried to delete order not found at exchange (maybe traded)")
            })
        }
    }

    function handleOrderDeleted(order) {
        if (order.orderStatus === "deleted") {
            return
        }
        
        order.orderStatus = "deleted"
        order.webElements.statusCell.innerHTML = "deleted"
        
        setTimeout(
            function()
            {
                removeElement(order.webElements.row)
                delete orders[order.tag]
            },
            500)
    }

    function ladder(tableNode) {
        var self = this

        this.tableNode = tableNode

        this.decimalPlaces = null

        this.bottomPrice = null
        this.tickSize = null
        this.topPrice = null
        
        this.bidCells = null
        this.priceCells = null
        this.offerCells = null

        this.description = "<font color=\"grey\">[Closed]</font>"
        this.descriptionCell = null

        this.setDescription = function(description) {
            self.description = description
            self.descriptionCell.innerHTML = description
        }

        this.build = function(bottomPrice, tickSize, topPrice) {
            log.debug("Building ladder")

            self.cleanup()
            self.buildHeader()

            self.decimalPlaces = dbl.decimalsUsed(tickSize)

            self.bottomPrice = bottomPrice
            self.tickSize = tickSize
            self.topPrice = topPrice

            self.bidCells = new dbl.map()
            self.priceCells = new dbl.map()
            self.offerCells = new dbl.map()
            
            for (var price = self.topPrice; price >= self.bottomPrice - 0.5 * tickSize; price -= tickSize) {
                self.buildLevel(price, tickSize)
            }

            self.priceCells.get(theo.get()).style.backgroundColor = "#88bbff"

            theo.listen(function(theo, oldTheo) {
                // TODO: assumes theo is on a tick (need nearest tick)
                self.priceCells.get(oldTheo).style.backgroundColor = "#ffffff"
                self.priceCells.get(theo).style.backgroundColor = "#88bbff"
            })
        }

        this.buildHeader = function() {
            self.tableNode.innerHTML = [
                "<tr>",
                "    <th width=210 colspan=3 align=\"center\" id=\"descriptionDisplay\"></th>",
                "</tr>",
                "<tr>",
                "    <td width=70 align=\"center\">Bid</td>",
                "    <td width=70 align=\"center\">Price</td>",
                "    <td width=70 align=\"center\">Offer</td>",
                "</tr>"
            ].join("\n")

            self.descriptionCell = document.getElementById("descriptionDisplay")
            self.descriptionCell.innerHTML = self.description
        }

        this.buildLevel = function(price, tickSize) {
            if (dbl.equal(price, 0)) {
                price = 0 // Avoids printing prices like "-0.00"
            }
            
            var row = document.createElement("tr")
            var bidCell = document.createElement("td")
            var priceCell = document.createElement("td")
            var offerCell = document.createElement("td")
            
            bidCell.align = "center"
            priceCell.align = "center"
            offerCell.align = "center"
            
            priceCell.innerHTML = price.toFixed(self.decimalPlaces)
            
            row.appendChild(bidCell)
            row.appendChild(priceCell)
            row.appendChild(offerCell)
            
            self.tableNode.appendChild(row)
            
            self.bidCells.set(price, bidCell)
            self.priceCells.set(price, priceCell)
            self.offerCells.set(price, offerCell)
            
            bidCell.onclick = function() {
                sendOrderInsert("buy", price, lotSizes[lotIndex])
            }
            
            offerCell.onclick = function() {
                sendOrderInsert("sell", price, lotSizes[lotIndex])
            }
        }

        this.normalizePrice = function(price) {
            var priceStr = price.toFixed(self.decimalPlaces)
            return parseFloat(priceStr)
        }

        this.cleanup = function() {
            self.bidCells = null
            self.priceCells = null
            self.offerCells = null
            removeChildren(self.tableNode)
            self.buildHeader()
        }

        this.buildHeader()
    }

    ldr = null
    var qr = null

    window.onload = function() {
        ldr = new ladder(document.getElementById("ladderTable"))
        
        qr = new quoter()
        
        document.getElementById("startupTable").onkeydown = function(e) {
            if (e.keyCode === 13) {
                switch (getSelectorValue("startupSelector")) {
                    case "login":
                        login()
                        break
                    
                    case "register":
                        register()
                        break
                    
                    case "changePassword":
                        changePassword()
                        break
                }
            }
        }
        
        document.getElementById("usernameInput").focus()
        
        qr.updateDisplay()
        
        var chatInput = document.getElementById("chatInput")
        chatInput.onkeydown = function(e) {
            if (e.keyCode === 13) {
                if (chat === null) {
                    addErrorMessage("Chat not connected")
                } else {
                    chat.send(chatInput.value)
                }
                
                chatInput.value = ""
                
                return false
            }
            
            return true
        }
    }

    function increaseLotSize() {
        lotIndex++
        if (lotIndex >= lotSizes.length) {
            lotIndex = lotSizes.length - 1
        }
        
        document.getElementById("lotSizeDisplay").innerHTML = lotSizes[lotIndex]
    }

    function decreaseLotSize() {
        lotIndex--
        if (lotIndex < 0) {
            lotIndex = 0
        }
        
        document.getElementById("lotSizeDisplay").innerHTML = lotSizes[lotIndex]
    }

    function updateValuation() {
        document.getElementById("valuationDisplay").innerHTML = formatCash(cash + instrumentCash + theo.get() * position)
    }

    theo.listen(updateValuation)

    function massDelete() {
        //peer.get("massDelete", null, {}) // Currently ignoring ack
        for (var tag in orders) {
            sendDelete(orders[tag], false)
        }
    }

    function login() {
        username = document.getElementById("usernameInput").value
        
        var sockConnectedAtStart = !!sock

        if (!sock) {
            sock = sockception.connect("ws://" + config.host + ":" + config.port + "/", log)
        }
        
        var run = function() {
            sock.route("clueRequest").send(username).receiveOne(function(clue) {
                var startupType = getSelectorValue("startupSelector")
                
                var passwd = document.getElementById(
                    startupType === "login" ?
                    "loginPasswordInput" :
                    "changePasswordOldPasswordInput").value
                
                var newPasswd = document.getElementById(
                    startupType === "login" ?
                    "loginPasswordInput" :
                    "changePasswordNewPasswordInput").value
                
                var hash = hexSha256(clue.value + passwd)
                var nextClue = randHex()
                
                var loginRequest = sock.route("loginRequest").send({
                    uname: username,
                    hash: hash,
                    nextClue: nextClue,
                    nextDoubleHash: hexSha256(hexSha256(nextClue + newPasswd))
                })
                
                loginRequest.route("success").receiveOne(handleLogin)

                loginRequest.route("failure").receiveOne(function() {
                    var failureElement = (
                        getSelectorValue("startupSelector") === "login" ?
                        document.getElementById("loginPasswordInput") :
                        document.getElementById("changePasswordOldPasswordInput"))
                    
                    failureElement.value = "login failure"
                    failureElement.type = "text"
                    
                    setTimeout(
                        function()
                        {
                            failureElement.value = ""
                            failureElement.type = "password"
                        },
                        500)
                })

                loginRequest.route("alreadyLoggedIn").receiveOne(function() {
                    var failureElement = document.getElementById("usernameInput")
                    failureElement.value = "already logged in"
                    
                    setTimeout(
                        function()
                        {
                            failureElement.value = ""
                        },
                        500)
                })
            })
        }

        if (sockConnectedAtStart) {
            run()
        } else {
            sock.receiveOne(run)
        }
    }

    function handleLogin(newSocket) {
        sock = newSocket // TODO: oh dear, this needs to be done in a better way

        switch(getSelectorValue("startupSelector")) {
            case "login":
                document.getElementById("loginPasswordInput").value = "login success!"
                document.getElementById("loginPasswordInput").type = "text"
                break
            
            case "register":
                document.getElementById("registerRegistrationKeyInput").value = "login success!"
                break
            
            case "changePassword":
                document.getElementById("changePasswordOldPasswordInput").value = "login success!"
                document.getElementById("changePasswordOldPasswordInput").type = "text"
                
                document.getElementById("changePasswordNewPasswordInput").value = "login success!"
                document.getElementById("changePasswordNewPasswordInput").type = "text"
                
                document.getElementById("changePasswordConfirmNewPasswordInput").value = "login success!"
                document.getElementById("changePasswordConfirmNewPasswordInput").type = "text"
                break
        }
        
        if (username === "andrew.morris") { // TODO: configure this lol
            var openInstrumentButton = document.createElement("input")
            openInstrumentButton.value = "Open"
            openInstrumentButton.type = "button"
            
            openInstrumentButton.onclick = function() {
                unbindHotkeys()
                
                // TODO: I need to outlaw this technique
                alertify.prompt("Enter description", function(e, desc) {
                alertify.prompt("Enter bottom price", function(e, bottomPrice) {
                alertify.prompt("Enter tick size", function(e, tickSize) {
                alertify.prompt("Enter top price", function(e, topPrice) {
                    
                    bindHotkeys()

                    bottomPrice = parseFloat(bottomPrice)
                    tickSize = parseFloat(tickSize)
                    topPrice = parseFloat(topPrice)
                    
                    var openInstrument = sock.route("openInstrument").send({
                        instrumentName: "testInstrument",
                        description: desc,
                        tickTable: {
                            bottomPrice: bottomPrice,
                            tickSize: tickSize,
                            topPrice: topPrice
                        }
                    })

                    openInstrument.route("error").receiveMany(function(s) {
                        alertify.error(s.value)
                    })

                    openInstrument.route("success").receiveOne(function() {
                        // TODO: should something go here?
                    })
                    
                })})})})
            }
            
            document.getElementById("adminDisplay").appendChild(openInstrumentButton)
            
            var closeInstrumentButton = document.createElement("input")
            closeInstrumentButton.value = "Close"
            closeInstrumentButton.type = "button"
            
            closeInstrumentButton.onclick = function() {
                unbindHotkeys()
                
                alertify.prompt("Enter settlement price", function(e, price) {
                    bindHotkeys()
                    
                    var closeInstrument = sock.route("closeInstrument").send({
                        instrumentName: "testInstrument",
                        value: parseFloat(price)
                    })

                    closeInstrument.route("error").receiveMany(function(err) {
                        alertify.error(err.value)
                    })

                    closeInstrument.route("success").receiveOne(function() {
                        // TODO: do something here?
                    })
                })
            }
            
            document.getElementById("adminDisplay").appendChild(closeInstrumentButton)
            
            var regoKeyButton = document.createElement("input")
            regoKeyButton.value = "Request Registration Key"
            regoKeyButton.type = "button"
            
            regoKeyButton.onclick = function() {
                sock.route("clueRequest").send(username).receiveOne(function(clue) {
                    unbindHotkeys()

                    alertify.prompt("Password", function(e, passwd) {
                    alertify.prompt("New username", function(e, newUser) {
                        bindHotkeys()

                        var nextClue = utils.randHex()
                        
                        var rkr = sock.route("registrationKeyRequest").send({
                            hash: hexSha256(clue + passwd),
                            nextClue: nextClue,
                            nextDoubleHash: hexSha256(hexSha256(nextClue + passwd)),
                            newUser: newUser
                        })

                        rkr.route("registrationKey").receiveOne(function(key) {
                            alertify.alert(key.value)
                        })

                        rkr.route("failure").receiveOne(function() {
                            alertify.error("Wrong password")
                        })
                    })})
                })
            }
            
            document.getElementById("adminDisplay").appendChild(regoKeyButton)

            var forceQuotersButton = document.createElement("input")
            forceQuotersButton.value = "Turn Quoters On"
            forceQuotersButton.type = "button"

            forceQuotersButton.onclick = function() {
                sock.route("forceQuotersOn").send("testInstrument")
            }
            
            document.getElementById("adminDisplay").appendChild(forceQuotersButton)
            document.getElementById("adminDisplay").appendChild(document.createElement("br"))
        }
        
        setTimeout(
            function() {
                bindHotkeys()
                
                // TODO: (Random thought) What does the server do if you insert a 0.5 lot?
                
                removeElement(document.getElementById("startupTable"))
                document.getElementById("innerLayoutTable").style.visibility = "visible"

                createLoginRequests()
            },
            500)
        
        var pingInterval = setInterval(
            function() {
                var sendTime = new Date()

                sock.route("ping").send().receiveOne(function() {
                    log.info("Ping time: " + (new Date() - sendTime) + "ms")
                })
            },
            10000)

        sock.onclose(function() {
            clearInterval(pingInterval)
        })
    }

    function createLoginRequests()
    {
        sock.route("cash").send().receiveOne(function(cashUpdate) {
            cash = cashUpdate.value
            document.getElementById("cashDisplay").innerHTML = formatCash(cash + instrumentCash)
            updateValuation()
        })

        chat = sock.route("chat").send()

        chat.receiveMany(function(msgInfo) {
            addMessage(msgInfo.value.uname + ": " + msgInfo.value.msg)
        })

        var instrumentSubscription = sock.route("instrumentSubscription").send("testInstrument")
        
        instrumentSubscription.route("positionUpdate").receiveMany(function(positionUpdate) {
            instrumentCash = positionUpdate.value.cash
            document.getElementById("cashDisplay").innerHTML = formatCash(cash + instrumentCash)
            
            position = positionUpdate.value.instrument
            document.getElementById("posDisplay").innerHTML = position
            
            updateValuation()
        })

        instrumentSubscription.route("priceUpdate").receiveMany(function(priceUpdate) {
            var pu = priceUpdate.value

            if (pu.volume > 0) {
                ldr.bidCells.get(pu.price).innerHTML = pu.volume
            } else if (pu.volume < 0) {
                ldr.offerCells.get(pu.price).innerHTML = -pu.volume
            } else {
                ldr.bidCells.get(pu.price).innerHTML = ""
                ldr.offerCells.get(pu.price).innerHTML = ""
            }
        })

        instrumentSubscription.route("status").receiveMany(function(status) {
            var is = status.value
            
            var isMarketOpenBefore = isMarketOpen.get()
            isMarketOpen.set(is.instrumentStatus === "open")

            if (!isMarketOpenBefore && isMarketOpen.get()) {
                ldr.build(
                    is.tickTable.bottomPrice,
                    is.tickTable.tickSize,
                    is.tickTable.topPrice)
                
                qr.setup()
                
                document.getElementById("descriptionDisplay").innerHTML = is.description
            }
        })

        instrumentSubscription.route("open").receiveOne(function(open) {
            var op = open.value

            clearTrades()

            ldr.build(
                op.tickTable.bottomPrice,
                op.tickTable.tickSize,
                op.tickTable.topPrice)
            
            theo.set(0.5 * (op.tickTable.bottomPrice + op.tickTable.topPrice))
            isMarketOpen.set(true)

            qr.setup()
            
            document.getElementById("descriptionDisplay").innerHTML = op.description
        })

        instrumentSubscription.route("close").receiveOne(function(close) {
            isMarketOpen.set(false)
            theo.set(0)
            document.getElementById("descriptionDisplay").innerHTML = "<font color=\"grey\">[Closed]</font>"

            cash += instrumentCash
            instrumentCash = 0

            cash += position * close.value // TODO: cash is an observable
            position = 0
            updateValuation()
            document.getElementById("posDisplay").innerHTML = position
            document.getElementById("cashDisplay").innerHTML = formatCash(cash + instrumentCash)

            ldr.cleanup()
        })

        instrumentSubscription.route("error").receiveMany(function(error) {
            alertify.alert(error.value)
        })

        instrumentSubscription.route("forceQuoterOn").receiveMany(function() {
            qr.toggle()
        })
    }

    function register() {
        var confirmField = document.getElementById("registerConfirmPasswordInput")
        
        if (
            document.getElementById("registerPasswordInput").value !==
            confirmField.value
        ) {
            confirmField.value = "doesn\"t match"
            confirmField.type = "text"
            
            setTimeout(
                function() {
                    confirmField.value = ""
                    confirmField.type = "password"
                },
                500)
            
            return
        }
        
        var uname = document.getElementById("usernameInput").value

        sock.route("clueRequest").send(uname).receiveOne(function(clue) {
            var regoKeyField = document.getElementById("registerRegistrationKeyInput")
            var nextClue = randHex()
            
            var registrationRequest = sock.route("registrationRequest").send({
                doubleHash: hexSha256(regoKeyField.value + clue.value),
                nextClue: nextClue,
                nextDoubleHash: hexSha256(hexSha256(nextClue + document.getElementById("registerPasswordInput").value))
            })

            registrationRequest.route("success").receiveOne(handleLogin)

            registrationRequest.route("failure").receiveOne(function() {
                regoKeyField.value = "failure"

                setTimeout(
                    function() {
                        regoKeyField.value = ""
                    },
                    500) // TODO: config
            })
        })
    }

    function changePassword() {
        var newPasswordInput = document.getElementById("changePasswordNewPasswordInput")
        var confirmNewPasswordInput = document.getElementById("changePasswordConfirmNewPasswordInput")
        
        if (newPasswordInput.value !== confirmNewPasswordInput.value) {
            confirmNewPasswordInput.value = "doesn\"t match"
            confirmNewPasswordInput.type = "text"
            
            setTimeout(
                function() {
                    confirmNewPasswordInput.value = ""
                    confirmNewPasswordInput.type = "password"
                },
                500)
            
            return
        }
        
        login()
    }

    function updateStartupTable() {
        alertify.alert("updateStartupTable is actually used")
        var rowIds = {
            login: ["loginRow1"],
            register: ["registerRow1", "registerRow2", "registerRow3"],
            changePassword: ["changePasswordRow1", "changePasswordRow2", "changePasswordRow3"]
        }
        
        for (var displayType in rowIds) {
            var displayValue = (displayType === getSelectorValue("startupSelector") ? "" : "none")
            
            for (var i in rowIds[displayType]) {
                document.getElementById(rowIds[displayType][i]).style.display = displayValue
            }
        }
    }
})()