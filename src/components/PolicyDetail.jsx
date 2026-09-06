import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { fmtDate, fmtMoney, proRataRefund, addYears, calculatePremium, todayStr } from '../lib/logic.js'
import { STATUS_CLASS } from './Dashboard.jsx'
import { ReviewBlocks, Field } from './Wizard.jsx'
import {
  ChevronLeft,
  Pencil,
  Ban,
  RotateCcw,
  RefreshCw,
  History,
  PlayCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'

export default function PolicyDetail({ user, policyId, onBack, onPolicyChange, onResume }) {
  const [policy, setPolicy] = useState(null)
  const [modal, setModal] = useState(null) // 'cancel' | 'renew' | 'reinstate'
  const [cancelForm, setCancelForm] = useState({ type: 'flat', reason: '', date: todayStr() })
  const [error, setError] = useState('')

  useEffect(() => {
    api.getPolicy(policyId).then(setPolicy)
  }, [policyId])

  if (!policy) return <div className="empty-state">Loading policy…</div>

  const inForce = policy.status === 'In Force'
  const canceled = policy.status === 'Canceled'
  const pendingChange = policy.pendingChange
  const draftLike = ['Draft', 'Quoted', 'UW Review', 'Approved', 'Rejected'].includes(policy.status)
  const uwLocked =
    user.role === 'underwriter' &&
    (policy.submittedForApproval || ['UW Review', 'Approved', 'Rejected'].includes(policy.status))

  async function save(updated) {
    const saved = await api.updatePolicy(policy.id, updated)
    setPolicy(saved)
    setModal(null)
    setError('')
  }

  async function doCancel() {
    if (!cancelForm.reason.trim()) return setError('Cancellation reason is required')
    const isFlat = cancelForm.type === 'flat'
    const cancelDate = isFlat ? policy.effectiveDate : cancelForm.date
    if (!isFlat && !cancelForm.date) return setError('Cancellation effective date is required')
    const refund = isFlat ? policy.premium?.total || 0 : proRataRefund(policy, cancelDate)
    await save({
      ...policy,
      status: 'Canceled',
      cancellation: {
        type: isFlat ? 'Flat' : 'Pro-rata',
        reason: cancelForm.reason,
        effectiveDate: cancelDate,
        refund,
      },
      transactions: [
        ...(policy.transactions || []),
        {
          type: 'Cancellation',
          date: todayStr(),
          description: `${isFlat ? 'Flat' : 'Pro-rata'} cancellation effective ${fmtDate(
            cancelDate
          )} — ${cancelForm.reason}. Refund ${fmtMoney(refund)}.`,
          by: user.name,
        },
      ],
    })
  }

  async function doRenew() {
    const newEff = policy.expirationDate
    const newExp = addYears(newEff, 1)
    const renewed = {
      ...policy,
      effectiveDate: newEff,
      expirationDate: newExp,
      status: 'In Force',
      cancellation: null,
    }
    renewed.premium = calculatePremium(renewed)
    renewed.transactions = [
      ...(policy.transactions || []),
      {
        type: 'Renewal',
        date: todayStr(),
        description: `Policy renewed for a new term ${fmtDate(newEff)} — ${fmtDate(newExp)}. Premium ${fmtMoney(
          renewed.premium.total
        )}.`,
        by: user.name,
      },
    ]
    await save(renewed)
  }

  async function doReinstate() {
    await save({
      ...policy,
      status: 'In Force',
      cancellation: null,
      transactions: [
        ...(policy.transactions || []),
        {
          type: 'Reinstatement',
          date: todayStr(),
          description: 'Policy reinstated to in-force status.',
          by: user.name,
        },
      ],
    })
  }

  return (
    <div className="page animate-fade">
      <div className="wizard-head">
        <button className="btn btn-ghost" onClick={onBack}>
          <ChevronLeft size={16} /> Back
        </button>
        <div>
          <h1>
            {policy.policyNumber}{' '}
            <span className={`badge ${STATUS_CLASS[policy.status] || 'badge-gray'}`}>
              {policy.status}
            </span>
          </h1>
          <p className="muted">
            Personal Auto ·{' '}
            {policy.insured ? `${policy.insured.firstName} ${policy.insured.lastName}` : 'No insured'} ·{' '}
            {fmtDate(policy.effectiveDate)} — {fmtDate(policy.expirationDate)}
          </p>
        </div>
        <div className="spacer" />
        <div className="action-row">
          {draftLike && !uwLocked && (
            <button className="btn btn-primary" onClick={() => onResume(policy.id)}>
              <PlayCircle size={16} /> Continue Submission
            </button>
          )}
          {inForce && (
            <>
              <button className="btn btn-secondary" onClick={() => onPolicyChange(policy.id)}>
                <Pencil size={15} /> {pendingChange ? 'Open Pending Change' : 'Policy Change'}
              </button>
              <button className="btn btn-secondary" onClick={doRenew}>
                <RefreshCw size={15} /> Renew
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setCancelForm({ type: 'flat', reason: '', date: todayStr() })
                  setError('')
                  setModal('cancel')
                }}
              >
                <Ban size={15} /> Cancel Policy
              </button>
            </>
          )}
          {canceled && (
            <button className="btn btn-success" onClick={doReinstate}>
              <RotateCcw size={15} /> Reinstate
            </button>
          )}
        </div>
      </div>

      {pendingChange && (
        <div className="banner-note banner-warn animate-rise">
          <AlertTriangle size={16} /> A policy change effective {fmtDate(pendingChange.effectiveDate)} is{' '}
          <strong>{pendingChange.status}</strong>
          {pendingChange.submittedBy ? ` — submitted by ${pendingChange.submittedBy}` : ''}. The
          change is not applied to this policy until it is issued.
        </div>
      )}

      {policy.cancellation && canceled && (
        <div className="card cancel-banner animate-rise">
          <Ban size={18} />
          <div>
            <strong>{policy.cancellation.type} cancellation</strong> effective{' '}
            {fmtDate(policy.cancellation.effectiveDate)} — {policy.cancellation.reason}. Refund:{' '}
            <strong>{fmtMoney(policy.cancellation.refund)}</strong>
          </div>
        </div>
      )}

      <ReviewBlocks data={policy} premium={policy.premium} />

      <div className="card">
        <h3>
          <History size={16} /> Transaction History
        </h3>
        {(policy.transactions || []).length === 0 ? (
          <p className="muted">No transactions yet.</p>
        ) : (
          <div className="timeline">
            {[...policy.transactions].reverse().map((t, i) => (
              <div key={i} className="timeline-item animate-rise">
                <div className="timeline-dot" />
                <div>
                  <strong>{t.type}</strong> <span className="muted">· {fmtDate(t.date)} · {t.by}</span>
                  <div className="muted">{t.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal === 'cancel' && (
        <div className="modal-backdrop animate-fade">
          <div className="modal animate-rise">
            <h2>Cancel Policy {policy.policyNumber}</h2>
            <Field label="Cancellation Type" required>
              <div className="radio-row column">
                <label className="radio">
                  <input
                    type="radio"
                    name="cancel-type"
                    checked={cancelForm.type === 'flat'}
                    onChange={() => setCancelForm({ ...cancelForm, type: 'flat' })}
                  />
                  <span>
                    <strong>Flat cancellation</strong> — cancels back to the policy effective date;
                    full premium ({fmtMoney(policy.premium?.total)}) is refunded.
                  </span>
                </label>
                <label className="radio">
                  <input
                    type="radio"
                    name="cancel-type"
                    checked={cancelForm.type === 'prorata'}
                    onChange={() => setCancelForm({ ...cancelForm, type: 'prorata' })}
                  />
                  <span>
                    <strong>Pro-rata cancellation</strong> — cancels as of a chosen date; unearned
                    premium is refunded proportionally.
                  </span>
                </label>
              </div>
            </Field>
            {cancelForm.type === 'prorata' && (
              <Field label="Cancellation Effective Date" required>
                <input
                  type="date"
                  min={policy.effectiveDate}
                  max={policy.expirationDate}
                  value={cancelForm.date}
                  onChange={(e) => setCancelForm({ ...cancelForm, date: e.target.value })}
                />
                <span className="field-hint">
                  Estimated refund: {fmtMoney(proRataRefund(policy, cancelForm.date))}
                </span>
              </Field>
            )}
            <Field label="Reason" required error={error || undefined}>
              <textarea
                rows={3}
                value={cancelForm.reason}
                onChange={(e) => setCancelForm({ ...cancelForm, reason: e.target.value })}
                placeholder="e.g. Insured request — sold vehicle"
              />
            </Field>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>
                Keep Policy
              </button>
              <button className="btn btn-danger" onClick={doCancel}>
                <CheckCircle2 size={15} /> Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
