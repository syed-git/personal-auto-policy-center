import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { fmtDate, fmtMoney } from '../lib/logic.js'
import { Search, Plus, FileText, Car } from 'lucide-react'

export const STATUS_CLASS = {
  Draft: 'badge-gray',
  Quoted: 'badge-blue',
  'UW Review': 'badge-amber',
  Approved: 'badge-green',
  Rejected: 'badge-red',
  'In Force': 'badge-green',
  Canceled: 'badge-red',
  Expired: 'badge-gray',
}

export default function Dashboard({ user, onNewSubmission, onOpenPolicy }) {
  const [policies, setPolicies] = useState(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  useEffect(() => {
    api.listPolicies().then(setPolicies).catch(() => setPolicies([]))
  }, [])

  const statuses = ['All', 'Draft', 'Quoted', 'UW Review', 'Approved', 'Rejected', 'In Force', 'Canceled', 'Expired']

  const hasStatus = (p, s) => p.status === s || p.pendingChange?.status === s

  const filtered = (policies || []).filter((p) => {
    if (statusFilter !== 'All' && !hasStatus(p, statusFilter)) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    const insured = `${p.insured?.firstName || ''} ${p.insured?.lastName || ''}`.toLowerCase()
    return (
      p.policyNumber.toLowerCase().includes(q) ||
      insured.includes(q) ||
      (p.status || '').toLowerCase().includes(q) ||
      (p.pendingChange?.status || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="page animate-fade">
      <div className="page-head">
        <div>
          <h1>Policies</h1>
          <p className="muted">Welcome back, {user.name.split(' ')[0]} — manage personal auto policies</p>
        </div>
        <button className="btn btn-primary" onClick={onNewSubmission}>
          <Plus size={16} /> New Submission
        </button>
      </div>

      <div className="stats-row">
        {['In Force', 'UW Review', 'Draft', 'Canceled'].map((s) => (
          <div key={s} className="stat-card animate-rise">
            <div className="stat-value">{(policies || []).filter((p) => hasStatus(p, s)).length}</div>
            <div className="stat-label">{s}</div>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div className="input-icon search-box">
          <Search size={16} />
          <input
            placeholder="Search by policy number, insured name, or status…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filter-chips">
          {statuses.map((s) => (
            <button
              key={s}
              className={`chip ${statusFilter === s ? 'chip-active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {policies === null ? (
        <div className="empty-state">Loading policies…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state animate-fade">
          <FileText size={40} />
          <h3>No policies found</h3>
          <p>Start a new submission to create your first policy.</p>
        </div>
      ) : (
        <div className="policy-table animate-rise">
          <div className="table-head">
            <span>Policy #</span>
            <span>Primary Insured</span>
            <span>Effective</span>
            <span>Expiration</span>
            <span>Premium</span>
            <span>Status</span>
          </div>
          {filtered.map((p) => (
            <div key={p.id} className="table-row" onClick={() => onOpenPolicy(p)}>
              <span className="policy-num">
                <Car size={15} /> {p.policyNumber}
              </span>
              <span>
                {p.insured?.firstName ? `${p.insured.firstName} ${p.insured.lastName}` : '—'}
              </span>
              <span>{fmtDate(p.effectiveDate)}</span>
              <span>{fmtDate(p.expirationDate)}</span>
              <span>{p.premium?.total ? fmtMoney(p.premium.total) : '—'}</span>
              <span>
                <span className={`badge ${STATUS_CLASS[p.status] || 'badge-gray'}`}>{p.status}</span>
                {p.pendingChange && (
                  <span
                    className={`badge badge-stack ${STATUS_CLASS[p.pendingChange.status] || 'badge-gray'}`}
                  >
                    Change · {p.pendingChange.status}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
