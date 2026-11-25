#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { open: true },
})
await server.listen()
server.printUrls()
