// Shared API core used by both the local Express server and the Netlify function.
// storage: { load(): Promise<db>, save(db): Promise<void> }

const USERS = [
  {
    username: 'aexec',
    password: 'gw123',
    name: 'Alex Morgan',
    role: 'account_executive',
    roleLabel: 'Account Executive',
  },
  {
    username: 'uwriter',
    password: 'gw123',
    name: 'Jordan Blake',
    role: 'underwriter',
    roleLabel: 'Underwriter',
  },
]

const EMPTY_DB = { counter: 1000000, policies: [] }

// Regenerated on every server (re)start; clients compare it to their stored
// value and log out when it changes.
const BOOT_ID =
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

export async function handleApi(method, path, body, storage) {
  const parts = path.split('/').filter(Boolean) // e.g. ['policies', 'id']

  if (method === 'GET' && parts[0] === 'boot') {
    return { status: 200, body: { bootId: BOOT_ID } }
  }

  if (method === 'POST' && parts[0] === 'login') {
    const user = USERS.find(
      (u) => u.username === (body?.username || '').trim() && u.password === body?.password
    )
    if (!user) return { status: 401, body: { error: 'Invalid username or password' } }
    const { password, ...safe } = user
    return { status: 200, body: safe }
  }

  const db = (await storage.load()) || EMPTY_DB

  if (method === 'GET' && parts[0] === 'policies' && parts.length === 1) {
    return { status: 200, body: db.policies }
  }

  if (method === 'GET' && parts[0] === 'policies' && parts.length === 2) {
    const policy = db.policies.find((p) => p.id === parts[1])
    if (!policy) return { status: 404, body: { error: 'Policy not found' } }
    return { status: 200, body: policy }
  }

  if (method === 'POST' && parts[0] === 'policies' && parts.length === 1) {
    db.counter += 1
    const policy = {
      ...body,
      id: `pol-${db.counter}`,
      policyNumber: `PA-${db.counter}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    db.policies.unshift(policy)
    await storage.save(db)
    return { status: 201, body: policy }
  }

  if (method === 'PUT' && parts[0] === 'policies' && parts.length === 2) {
    const idx = db.policies.findIndex((p) => p.id === parts[1])
    if (idx === -1) return { status: 404, body: { error: 'Policy not found' } }
    db.policies[idx] = {
      ...db.policies[idx],
      ...body,
      id: db.policies[idx].id,
      policyNumber: db.policies[idx].policyNumber,
      updatedAt: new Date().toISOString(),
    }
    await storage.save(db)
    return { status: 200, body: db.policies[idx] }
  }

  if (method === 'DELETE' && parts[0] === 'policies' && parts.length === 2) {
    const idx = db.policies.findIndex((p) => p.id === parts[1])
    if (idx === -1) return { status: 404, body: { error: 'Policy not found' } }
    db.policies.splice(idx, 1)
    await storage.save(db)
    return { status: 200, body: { ok: true } }
  }

  return { status: 404, body: { error: 'Not found' } }
}
