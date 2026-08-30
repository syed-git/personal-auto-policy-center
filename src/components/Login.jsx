import { useState } from 'react'
import { api } from '../lib/api.js'
import { Shield, User, Lock, ArrowRight } from 'lucide-react'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await api.login(username, password)
      onLogin(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card animate-rise">
        <div className="login-brand">
          <div className="brand-icon large">
            <Shield size={28} />
          </div>
          <h1>PolicyCenter</h1>
          <p>Personal Auto Insurance Platform</p>
        </div>
        <form onSubmit={submit}>
          <div className="field">
            <label>Username</label>
            <div className="input-icon">
              <User size={16} />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoFocus
              />
            </div>
          </div>
          <div className="field">
            <label>Password</label>
            <div className="input-icon">
              <Lock size={16} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'} <ArrowRight size={16} />
          </button>
        </form>
        <div className="login-hint">
          <div className="hint-row">
            <span className="hint-role">Account Executive</span>
            <code>aexec / gw123</code>
          </div>
          <div className="hint-row">
            <span className="hint-role">Underwriter</span>
            <code>uwriter / gw123</code>
          </div>
        </div>
      </div>
    </div>
  )
}
