# ifhttp

ifhttp provides an HTTP REST interface for interacting with Z-Machine interactive fiction (IF) stories. Clients can connect to the service to start a game and then POST commands to it. Sessions are deleted after a while in a feeble attempt to save memory. This service is definitely DoS-able.

## API

All request and response bodies should be JSON. In addition to a status code, requests may return a JSON object with an `error` property which describes the error.

### GET /new

Returns a session ID for a new game.

Response:

```json
{
  "session": "<id>",
  "output": "<text>"
}
```

### POST /send

Sends a command to the game.

Request:

```json
{
  "session": "<id>",
  "message": "<user input>"
}
```

Response:

```json
{
  "output": "<text>"
}
```

## Reference

- [Inform](http://inform7.com/) - IF creation toolsuite
- [ifvms](https://github.com/curiousdannii/ifvms.js) - JavaScript Z-Machine VM used by this script
- [ifplayer](https://github.com/jedi4ever/ifplayer.js) - Command-line client which uses ifvms
