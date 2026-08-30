import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi } from './core.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dataDir = path.join(root, 'data')
const dbFile = path.join(dataDir, 'db.json')

const storage = {
  async load() {
    try {
      return JSON.parse(fs.readFileSync(dbFile, 'utf8'))
    } catch {
      return null
    }
  },
  async save(db) {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2))
  },
}

const app = express()
app.use(express.json({ limit: '2mb' }))

app.all(/^\/api\/.*/, async (req, res) => {
  const apiPath = req.path.replace(/^\/api/, '')
  const result = await handleApi(req.method, apiPath, req.body, storage)
  res.status(result.status).json(result.body)
})

const isProd = process.env.NODE_ENV === 'production'
const port = process.env.PORT || 3000

if (isProd) {
  app.use(express.static(path.join(root, 'dist')))
  app.get(/.*/, (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))
  app.listen(port, () => console.log(`PolicyCenter running at http://localhost:${port}`))
} else {
  const { createServer } = await import('vite')
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' })
  app.use(vite.middlewares)
  app.listen(port, () => console.log(`PolicyCenter (dev) running at http://localhost:${port}`))
}
