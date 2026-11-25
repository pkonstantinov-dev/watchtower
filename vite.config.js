import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i

const jiraProxy = {
  name: 'jira-proxy',
  configureServer(server) {
    server.middlewares.use('/rest', async (req, res) => {
      const site = req.headers['x-jira-site'] ?? ''
      if (req.method !== 'GET' || !HOSTNAME.test(site) || !req.headers.authorization) {
        res.statusCode = 400
        return res.end('Only GET requests with x-jira-site and Authorization headers are proxied')
      }
      try {
        const upstream = await fetch(`https://${site}${req.originalUrl}`, {
          headers: { Authorization: req.headers.authorization, Accept: 'application/json' },
        })
        res.statusCode = upstream.status
        res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'text/plain')
        res.end(Buffer.from(await upstream.arrayBuffer()))
      } catch (e) {
        res.statusCode = 502
        res.end(`Cannot reach ${site}: ${e.cause?.message ?? e.message}`)
      }
    })
  },
}

export default defineConfig({
  plugins: [react(), jiraProxy],
  server: { port: 5180, strictPort: true },
})
