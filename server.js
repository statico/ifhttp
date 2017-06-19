import commander from 'commander'
import cors from 'cors'
import humanizePlus from 'humanize-plus'
import ifvms from 'ifvms'
import restify from 'restify'
import uuid from 'uuid'
import csvStringify from 'csv-stringify'

require('console-stamp')(console)

commander
  .usage('<story.z8>')
  .option('-d, --debug', 'Always create/return the same session ID, "test"')
  .option('-t, --session-timeout <timeout>', 'Session timeout (in seconds)', 60 * 15)
  .option('-p, --port <port>', 'Port to bind to', 8080)
  .parse(process.argv)

if (commander.args.length !== 1) { commander.help() }

let sessions = {}

setInterval(function () {
  let t = Date.now() - (commander.sessionTimeout * 1000)
  for (let id in sessions) {
    let sess = sessions[id]
    if (sess.lastUpdate < t) {
      console.log('Deleted session', id)
      delete sessions[id]
    }
  }
  let mem = process.memoryUsage()
  for (let k in mem) {
    let v = mem[k]
    mem[k] = humanizePlus.fileSize(v)
  }
  return console.log(`${Object.keys(sessions).length} sessions, memory: ${JSON.stringify(mem)}`)
}
, 60 * 1000)

class Session {
  constructor () {
    this.id = commander.debug ? 'test' : uuid.v4()
    this.vm = ifvms.bootstrap.zvm(commander.args[0], [])
    this.running = true
    this.lastUpdate = Date.now()
    this._buffer = ''
    this._lastOrder = null // The VM will send a "request for read" order, which we save.
    this._processAllOrders()
  }

  getBuffer () {
    let output = this._buffer.replace(/^\s+/, '') // Trim leading space.
    this._buffer = ''
    return output
  }

  send (input, cb) {
    if (!this.running) {
      return cb(new Error('VM not running'))
    }
    this.lastUpdate = Date.now()
    this._lastOrder.response = input
    try {
      this.vm.inputEvent(this._lastOrder)
    } catch (e) {
      this.running = false
      return cb(e)
    }
    this._processAllOrders()
    let output = this.getBuffer()
      .substr(input.length) // Trim past the input.
      .replace(/^\s+/, '') // ...and leading space past that.
    return cb(null, output)
  }

  _processAllOrders () {
    for (let o of Array.from(this.vm.orders)) {
      this._processOrder(o)
    }
  }

  _processOrder (order) {
    switch (order.code) {
      case 'stream':
        if (order.text != null) {
          this._buffer += order.text
        }
        break
      case 'read':
        this._lastOrder = order
        break
      case 'quit':
        this.running = false
        break
    }
  }
}

let server = restify.createServer()
server.use(restify.bodyParser())
server.use(cors())

server.use(function (req, res, next) {
  req.remoteAddr = req.headers['x-forwarded-for'] || req.connection.remoteAddress
  return next()
})

server.get('/', function (req, res, next) {
  res.contentType = 'text/plain'
  res.send('ok\n')
  return next()
})

server.get('/new', function (req, res, next) {
  let sess = new Session()
  sessions[sess.id] = sess
  console.log(sess.id, req.remoteAddr, '(new session)')
  res.send({ session: sess.id, output: sess.getBuffer() })
  return next()
})

server.post('/send', function (req, res, next) {
  let {session, message} = req.body
  if ((session == null) || (message == null)) {
    res.send(400, { error: 'Missing session or message' })
    return next()
  }

  let sess = sessions[session]
  if ((sess == null)) {
    res.send(400, { error: 'No such session' })
    return next()
  }

  // Simple input sanitization.
  message = message.substr(0, 255).replace(/[^\w ]+/g, '')

  return sess.send(message, function (err, output) {
    if (!sess.running) {
      delete sessions[session]
    }
    if (err) {
      console.error(sess.id, req.remoteAddr, `Error: ${err}`)
      res.send(500, { error: err })
      return
    }
    console.log(sess.id, req.remoteAddr, JSON.stringify(message))
    res.send({ output })
    return next()
  })
})

server.on('uncaughtException', function (req, res, route, err) {
  console.error(err.stack)
  return res.send(500, { error: 'Internal Server Error' })
})

if (commander.debug) {
  // Skip an extra request when debugging.
  sessions['test'] = new Session()
}

server.listen(commander.port, () => console.log('ifhttp listening at', server.url))
