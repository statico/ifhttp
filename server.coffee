#!/usr/bin/env coffee

require('console-stamp')(console)

commander = require 'commander'
fs = require 'fs'
humanizePlus = require 'humanize-plus'
ifvms = require 'ifvms'
restify = require 'restify'
uuid = require 'uuid'

commander
  .usage('<story.z8>')
  .option('-d, --debug', 'Always create/return the same session ID, "test"')
  .option('-t, --session-timeout <timeout>', 'Session timeout (in seconds)', 60*15)
  .option('-p, --port <port>', 'Port to bind to', 8080)
  .parse(process.argv)

commander.help() unless commander.args.length == 1

sessions = {}

setInterval(->
  t = Date.now() - commander.sessionTimeout * 1000
  for id, sess of sessions
    if sess.lastUpdate < t
      console.log "Deleted session", id
      delete sessions[id]
  mem = process.memoryUsage()
  for k, v of mem
    mem[k] = humanizePlus.fileSize(v)
  console.log "#{ Object.keys(sessions).length } sessions, memory: #{ JSON.stringify mem }"
, 60*1000)

class Session

  constructor: ->
    @id = if commander.debug then 'test' else uuid.v4()
    @vm = ifvms.bootstrap.zvm commander.args[0], []
    @lastUpdate = Date.now()
    @_buffer = ''
    @_lastOrder = null # The VM will send a "request for read" order, which we save.
    @_processAllOrders()

  getBuffer: ->
    output = @_buffer.replace(/^\s+/, '') # Trim leading space.
    @_buffer = ''
    return output

  send: (input, cb) ->
    @lastUpdate = Date.now()
    @_lastOrder.response = input
    @vm.inputEvent @_lastOrder
    @_processAllOrders()
    output = @getBuffer()
      .substr(input.length) # Trim past the input.
      .replace(/^\s+/, '') # ...and leading space past that.
    cb null, output

  _processAllOrders: ->
    for o in @vm.orders
      @_processOrder(o)
    return

  _processOrder: (order) ->
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

server.get '/', (req, res, next) ->
  res.contentType = 'text/plain'
  res.send 'ok\n'
  next()

server.get '/new', (req, res, next) ->
  sess = new Session()
  sessions[sess.id] = sess
  addr = req.headers['x-forwarded-for'] or req.connection.remoteAddress
  console.log sess.id, addr, '(new session)'
  res.send { session: sess.id, output: sess.getBuffer() }
  next()

server.post '/send', (req, res, next) ->
  {session, message} = req.body
  if not session? or not message?
    res.send 400, { error: "Missing session or message" }
    return next()

  sess = sessions[session]
  if not sess?
    res.send 400, { error: "No such session" }
    return next()

  sess.send message, (err, output) ->
    console.log sess.id, req.connection.remoteAddress, JSON.stringify(message)
    res.send { output: output }
    return next()

server.on 'uncaughtException', (req, res, route, err) ->
  console.error err.stack
  res.send 500, { error: "Internal Server Error" }

if commander.debug
  # Skip an extra request when debugging.
  sessions['test'] = new Session()

server.listen commander.port, ->
  console.log 'ifhttp listening at', server.url
