#!/usr/bin/env coffee

restify = require 'restify'
ifvms = require 'ifvms'
commander = require 'commander'
uuid = require 'uuid'
fs = require 'fs'

commander
  .usage('<story.z8>')
  .option('-t, --session-timeout', 'Session timeout (in seconds)', 60*5)
  .parse(process.argv)

commander.help() unless commander.args.length == 1

cache = {}

setInterval(->
  oldest = Date.now() - commander.sessionTimeout * 1000
  for id, sess of cache
    if sess.lastUpdate < oldest
      delete cache[id]
, 5000)

class Session

  constructor: ->
    @id = 'temp' #XXXX uuid.v4()
    @vm = ifvms.bootstrap.zvm commander.args[0], []
    @lastUpdate = Date.now()
    @_lastOrder = null
    @_processAllOrders()
    @_buffer = ''

  send: (input, cb) ->
    @lastUpdate = Date.now()
    @_lastOrder.response = input
    console.log '<<< INPUT <<<', @_lastOrder
    @vm.inputEvent @_lastOrder
    @_processAllOrders()
    cb null, @_buffer

  _processAllOrders: ->
    for o in @vm.orders
      @_processOrder(o)
    return

  _processOrder: (order) ->
    console.log '>>> ORDER >>>', order
    switch order.code
      when 'stream'
        if order.text?
          @_buffer += order.text
        break
      when 'read'
        @_lastOrder = order
        break

server = restify.createServer()
server.use restify.bodyParser()

server.get '/new', (req, res, next) ->
  sess = new Session()
  cache[sess.id] = sess
  res.send { session: sess.id }
  next()

server.post '/send', (req, res, next) ->
  {session, message} = req.body
  if not session? or not message?
    res.send 400, { error: "Missing session or message" }
    return next()

  sess = cache[session]
  if not sess?
    res.send 400, { error: "No such session" }
    return next()

  sess.send message, (err, output) ->
    res.send { output: output }
    return next()

server.on 'uncaughtException', (req, res, route, err) ->
  console.error err.stack
  res.send 500, { error: "Internal Server Error" }

s = new Session()
cache['temp'] = s

server.listen 8080, ->
  console.log '%s listening at %s', server.name, server.url
