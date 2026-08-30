import { useState, useEffect } from 'react'
import Login from './components/Login.jsx'
import Dashboard from './components/Dashboard.jsx'
import Wizard from './components/Wizard.jsx'
import PolicyDetail from './components/PolicyDetail.jsx'
import { Shield, LogOut } from 'lucide-react'

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('pc_user'))
    } catch {
      return null
    }
  })
  const [view, setView] = useState({ name: 'dashboard' })

  useEffect(() => {
    if (user) sessionStorage.setItem('pc_user', JSON.stringify(user))
    else sessionStorage.removeItem('pc_user')
  }, [user])

  if (!user) return <Login onLogin={setUser} />

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand" onClick={() => setView({ name: 'dashboard' })}>
          <div className="brand-icon">
            <Shield size={20} />
          </div>
          <div>
            <div className="brand-title">PolicyCenter</div>
            <div className="brand-sub">Personal Auto</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className="user-chip">
            <div className="user-avatar">{user.name.split(' ').map((s) => s[0]).join('')}</div>
            <div>
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.roleLabel}</div>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={() => setUser(null)} title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="main">
        {view.name === 'dashboard' && (
          <Dashboard
            user={user}
            onNewSubmission={() => setView({ name: 'wizard', mode: 'submission' })}
            onOpenPolicy={(policy) => setView({ name: 'policy', policyId: policy.id })}
          />
        )}
        {view.name === 'wizard' && (
          <Wizard
            user={user}
            mode={view.mode}
            policyId={view.policyId}
            onExit={() => setView({ name: 'dashboard' })}
            onOpenPolicy={(id) => setView({ name: 'policy', policyId: id })}
          />
        )}
        {view.name === 'policy' && (
          <PolicyDetail
            user={user}
            policyId={view.policyId}
            onBack={() => setView({ name: 'dashboard' })}
            onPolicyChange={(id) => setView({ name: 'wizard', mode: 'change', policyId: id })}
            onResume={(id) => setView({ name: 'wizard', mode: 'submission', policyId: id })}
          />
        )}
      </main>
    </div>
  )
}
