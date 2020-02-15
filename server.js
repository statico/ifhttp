const commander = require('commander')
const bodyParser = require('body-parser')
const cors = require('cors')
const csvStringify = require('csv-stringify')
const fs = require('fs')
const humanizePlus = require('humanize-plus')
const ifvms = require('ifvms')
const express = require('express')
const touch = require('touch')
const uuid = require('uuid')

require('console-stamp')(console)

commander
  .usage('<story.z8>')
  .option('-d, --debug', 'Always create/return the same session ID, "test"')
  .option(
    '-t, --session-timeout <timeout>',
    'Session timeout (in seconds)',
    60 * 15
  )
  .option('-c, --csv <path>', 'Log game sessions to a CSV file')
  .option('-p, --port <port>', 'Port to bind to', 8080)
  .parse(process.argv)

if (commander.args.length !== 1) {
  commander.help()
}

// Use zero-width characters to signal bold/normal.
const INVERSE_ON = '\u200f'
const INVERSE_OFF = '\u200e'

const sessions = {}

setInterval(function() {
  const t = Date.now() - commander.sessionTimeout * 1000
  for (const id in sessions) {
    const sess = sessions[id]
    if (sess.lastUpdate < t) {
      console.log('Deleted session', id)
      delete sessions[id]
    }
  }
  const mem = process.memoryUsage()
  for (const k in mem) {
    const v = mem[k]
    mem[k] = humanizePlus.fileSize(v)
  }
  return console.log(
    `${Object.keys(sessions).length} sessions, memory: ${JSON.stringify(mem)}`
  )
}, 60 * 1000)

class Session {
  constructor() {
    this.id = commander.debug ? 'test' : uuid.v4()
    this.vm = ifvms.bootstrap.zvm(commander.args[0], [])
    this.running = true
    this.lastUpdate = Date.now()
    this._buffer = ''
    this._lastOrder = null // The VM will send a "request for read" order, which we save.
    this._processAllOrders()
  }

  getBuffer() {
    const output = this._buffer.replace(/^\s+/, '') // Trim leading space.
    this._buffer = ''
    return output
  }

  send(input) {
    if (!this.running) {
      throw new Error('VM not running')
    }
    this.lastUpdate = Date.now()
    this._lastOrder.response = input
    try {
      this.vm.inputEvent(this._lastOrder)
    } catch (e) {
      this.running = false
      throw e
    }
    this._processAllOrders()
    const output = this.getBuffer()
      .substr(input.length + 1) // Trim past the input + bold marker.
      .replace(/^\s+/, '') // ...and leading space past that.
    return output
  }

  _processAllOrders() {
    for (const o of Array.from(this.vm.orders)) {
      this._processOrder(o)
    }
  }

  _processOrder(order) {
    switch (order.code) {
      case 'stream':
        if (order.text != null && /\S/.test(order.text)) {
          this._buffer +=
            order.css['font-weight'] === 'bold' ? INVERSE_ON : INVERSE_OFF
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

function logToCSV(addr, sessionId, message, reply) {
  if (!commander.csv) return
  const datetime = new Date()
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ')
  csvStringify([[datetime, sessionId, addr, message, reply]], (err, line) => {
    if (err) {
      console.error(err)
      return
    }
    try {
      fs.appendFileSync(commander.csv, line, 'utf8')
    } catch (err) {
      console.error(`Could not write to ${commander.csv}:`, err)
    }
  })
}

if (commander.csv) {
  touch.sync(commander.csv)
  console.log(`Logging sessions as CSV to ${commander.csv}`)
}

const app = express()
app.use(bodyParser.json())
app.use(cors())

app.use(function(req, res, next) {
  req.remoteAddr =
    req.headers['x-forwarded-for'] || req.connection.remoteAddress
  return next()
})

app.get('/', function(req, res) {
  res.contentType = 'text/plain'
  res.send('ok\n')
})

app.get('/new', function(req, res) {
  const sess = new Session()
  sessions[sess.id] = sess
  console.log(sess.id, req.remoteAddr, '(new session)')
  res.json({ session: sess.id, output: sess.getBuffer() })
})

app.post('/send', function(req, res) {
  const { session, message } = req.body
  if (session == null || message == null) {
    res.status(400).json({ error: 'Missing session or message' })
    return
  }

  const sess = sessions[session]
  if (sess == null) {
    res.status(400).json({ error: 'No such session' })
    return
  }

  // Simple input sanitization.
  const sanitized = message.substr(0, 255).replace(/[^\w ]+/g, '')

  try {
    const output = sess.send(sanitized)
    console.log(sess.id, req.remoteAddr, JSON.stringify(sanitized))
    logToCSV(req.remoteAddr, sess.id, sanitized, output)
    res.json({ output })
    if (!sess.running) {
      delete sessions[session]
    }
  } catch (err) {
    console.error(sess.id, req.remoteAddr, `Error: ${err}`)
    res.status(500).json({ error: err })
    return
  }
})

if (commander.debug) {
  // Skip an extra request when debugging.
  sessions['test'] = new Session()
}

const listener = app.listen(commander.port, () =>
  console.log(`ifhttp listening at http://localhost:${listener.address().port}`)
)
