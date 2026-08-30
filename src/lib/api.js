async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

export const api = {
  login: (username, password) => request('POST', '/login', { username, password }),
  listPolicies: () => request('GET', '/policies'),
  getPolicy: (id) => request('GET', `/policies/${id}`),
  createPolicy: (data) => request('POST', '/policies', data),
  updatePolicy: (id, data) => request('PUT', `/policies/${id}`, data),
}
