import { getStore } from '@netlify/blobs'
import { handleApi } from '../../server/core.js'

export default async (req) => {
  const store = getStore('policycenter')
  const storage = {
    async load() {
      return await store.get('db', { type: 'json' })
    },
    async save(db) {
      await store.setJSON('db', db)
    },
  }

  const url = new URL(req.url)
  const apiPath = url.pathname.replace(/^\/api/, '')
  let body = null
  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      body = await req.json()
    } catch {
      body = null
    }
  }

  const result = await handleApi(req.method, apiPath, body, storage)
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const config = { path: '/api/*' }
