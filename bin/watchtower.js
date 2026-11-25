#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createServer } from 'vite'

const fail = message => {
  console.error(message)
  process.exit(1)
}

let values
try {
  ;({ values } = parseArgs({ options: { port: { type: 'string', short: 'p' } } }))
} catch (e) {
  fail(`${e.message}\nUsage: watchtower [--port <number>]`)
}
const port = values.port === undefined ? undefined : Number(values.port)
if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) {
  fail(`Invalid port "${values.port}". Use a number from 1 to 65535.`)
}

const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { open: true, ...(port && { port }) },
})
await server.listen().catch(e => fail(`${e.message}. Is Watchtower already running? Use --port to choose another port.`))
server.printUrls()
