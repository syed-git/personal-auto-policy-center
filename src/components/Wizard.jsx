import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import {
  validateInsured,
  validateDriver,
  validateVehicle,
  evaluateUWIssues,
  calculatePremium,
  defaultCoverages,
  COVERAGE_DEFS,
  fmtMoney,
  fmtDate,
  todayStr,
  addYears,
} from '../lib/logic.js'
import {
  FileText,
  Users,
  Car,
  ShieldCheck,
  Calculator,
  AlertTriangle,
  ClipboardCheck,
  Award,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

const STEPS = [
  { key: 'policyInfo', label: 'Policy Info', icon: FileText },
  { key: 'drivers', label: 'Drivers', icon: Users },
  { key: 'vehicles', label: 'Vehicles', icon: Car },
  { key: 'coverages', label: 'Coverages', icon: ShieldCheck },
  { key: 'quote', label: 'Quote', icon: Calculator },
  { key: 'risk', label: 'Risk Analysis', icon: AlertTriangle },
  { key: 'review', label: 'Review', icon: ClipboardCheck },
  { key: 'summary', label: 'Policy Summary', icon: Award },
]

function emptyData(user) {
  return {
    type: 'submission',
    status: 'Draft',
    effectiveDate: '',
    expirationDate: '',
    insured: null,
    drivers: [],
    vehicles: [],
    coverages: defaultCoverages(),
    premium: null,
    uwIssues: [],
    transactions: [],
    createdByRole: user.role,
    createdBy: user.name,
    cancellation: null,
  }
}

export default function Wizard({ user, mode, policyId, onExit, onOpenPolicy }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState(() => emptyData(user))
  const [savedId, setSavedId] = useState(null)
  const [loading, setLoading] = useState(!!policyId)
  const [changeDateModal, setChangeDateModal] = useState(mode === 'change')
  const [changeDate, setChangeDate] = useState(todayStr())
  const [stepError, setStepError] = useState('')

  useEffect(() => {
    if (!policyId) return
    api.getPolicy(policyId).then((p) => {
      setSavedId(p.id)
      setData({ ...p })
      setLoading(false)
    })
  }, [policyId])

  const isChange = mode === 'change'
  const evalRole = isChange ? user.role : data.createdByRole || user.role

  function update(patch) {
    setData((d) => ({ ...d, ...patch }))
    setStepError('')
  }

  function reevaluateIssues(d) {
    const fresh = evaluateUWIssues(d, evalRole)
    return fresh.map((iss) => {
      const prev = (d.uwIssues || []).find((p) => p.code === iss.code && p.title === iss.title)
      return prev?.approved ? { ...iss, approved: true, approvedBy: prev.approvedBy } : iss
    })
  }

  async function persist(d) {
    if (isChange) return d // policy changes are only saved when issued
    if (savedId) {
      return await api.updatePolicy(savedId, d)
    }
    const created = await api.createPolicy(d)
    setSavedId(created.id)
    return created
  }

  const blockingUnapproved = (data.uwIssues || []).filter((i) => i.blocking && !i.approved)

  async function next() {
    const key = STEPS[step].key
    if (key === 'policyInfo') {
      if (!data.effectiveDate) return setStepError('Effective date is required')
      if (!data.insured) return setStepError('Please add the primary insured before continuing')
    }
    if (key === 'drivers' && data.drivers.length === 0)
      return setStepError('Please add at least one driver')
    if (key === 'vehicles' && data.vehicles.length === 0)
      return setStepError('Please add at least one vehicle')

    let d = { ...data }
    if (key === 'coverages') {
      d.premium = calculatePremium(d)
      d.uwIssues = reevaluateIssues(d)
      if (d.status === 'Draft') d.status = 'Quoted'
    }
    if (key === 'quote') {
      d.uwIssues = reevaluateIssues(d)
      const blocked = d.uwIssues.some((i) => i.blocking && !i.approved)
      if (!isChange) d.status = blocked ? 'UW Review' : 'Quoted'
    }
    if (key === 'risk') {
      const blocked = d.uwIssues.some((i) => i.blocking && !i.approved)
      if (blocked)
        return setStepError(
          'This submission has blocking underwriting issues. An underwriter must approve them before you can proceed.'
        )
    }
    setData(d)
    if (!isChange) {
      const saved = await persist(d)
      setData((cur) => ({ ...cur, ...saved }))
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  async function issuePolicy() {
    const blocked = (data.uwIssues || []).some((i) => i.blocking && !i.approved)
    if (blocked) {
      setStepError('Cannot issue: blocking underwriting issues are pending approval.')
      return
    }
    let d = { ...data }
    d.premium = calculatePremium(d)
    if (isChange) {
      d.transactions = [
        ...(d.transactions || []),
        {
          type: 'Policy Change',
          date: todayStr(),
          description: `Policy change effective ${fmtDate(d.effectiveDate)}`,
          by: user.name,
        },
      ]
      d.status = 'In Force'
      const saved = await api.updatePolicy(savedId, d)
      setData(saved)
    } else {
      d.expirationDate = d.expirationDate || addYears(d.effectiveDate, 1)
      d.status = 'In Force'
      d.boundAt = new Date().toISOString()
      d.transactions = [
        ...(d.transactions || []),
        {
          type: 'Submission',
          date: todayStr(),
          description: `Policy issued, effective ${fmtDate(d.effectiveDate)}`,
          by: user.name,
        },
      ]
      const saved = await persist(d)
      setData((cur) => ({ ...cur, ...d, ...saved }))
    }
    setStep(STEPS.length - 1)
  }

  async function approveIssue(code) {
    const d = {
      ...data,
      uwIssues: data.uwIssues.map((i) =>
        i.code === code ? { ...i, approved: true, approvedBy: user.name, approvedAt: todayStr() } : i
      ),
    }
    const stillBlocked = d.uwIssues.some((i) => i.blocking && !i.approved)
    if (!stillBlocked && d.status === 'UW Review') d.status = 'Quoted'
    setData(d)
    if (!isChange && savedId) await api.updatePolicy(savedId, d)
  }

  if (loading) return <div className="empty-state">Loading…</div>

  if (changeDateModal) {
    return (
      <div className="modal-backdrop animate-fade">
        <div className="modal animate-rise">
          <h2>Start Policy Change</h2>
          <p className="muted">
            Select the effective date for this policy change on {data.policyNumber}.
          </p>
          <div className="field">
            <label>
              Change Effective Date <span className="req">*</span>
            </label>
            <input type="date" value={changeDate} onChange={(e) => setChangeDate(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onExit}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                update({ effectiveDate: changeDate })
                setChangeDateModal(false)
              }}
            >
              Continue <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const StepComp = {
    policyInfo: StepPolicyInfo,
    drivers: StepDrivers,
    vehicles: StepVehicles,
    coverages: StepCoverages,
    quote: StepQuote,
    risk: StepRisk,
    review: StepReview,
    summary: StepSummary,
  }[STEPS[step].key]

  const issued = data.status === 'In Force' || data.status === 'Canceled'

  return (
    <div className="page wizard-page animate-fade">
      <div className="wizard-head">
        <button className="btn btn-ghost" onClick={onExit}>
          <ChevronLeft size={16} /> Exit
        </button>
        <div>
          <h1>{isChange ? `Policy Change — ${data.policyNumber}` : 'New Submission'}</h1>
          <p className="muted">
            Personal Auto {data.policyNumber ? `· ${data.policyNumber}` : ''} · Status:{' '}
            <strong>{data.status}</strong>
          </p>
        </div>
      </div>

      <div className="wizard-body">
        <aside className="stepper">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const state = i === step ? 'active' : i < step ? 'done' : 'todo'
            return (
              <button
                key={s.key}
                className={`step ${state}`}
                onClick={() => i < step && !issued && setStep(i)}
                disabled={i > step}
              >
                <span className="step-icon">
                  <Icon size={16} />
                </span>
                <span>{s.label}</span>
              </button>
            )
          })}
        </aside>

        <section className="wizard-content" key={step}>
          <StepComp
            data={data}
            update={update}
            user={user}
            isChange={isChange}
            approveIssue={approveIssue}
            blockingUnapproved={blockingUnapproved}
            onOpenPolicy={() => onOpenPolicy(savedId || data.id)}
            onExit={onExit}
          />
          {stepError && (
            <div className="form-error banner animate-rise">
              <AlertTriangle size={16} /> {stepError}
            </div>
          )}
          <div className="wizard-nav">
            {step > 0 && step < STEPS.length - 1 && (
              <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
                <ChevronLeft size={16} /> Back
              </button>
            )}
            <div className="spacer" />
            {step < STEPS.length - 2 && (
              <button className="btn btn-primary" onClick={next}>
                Next <ChevronRight size={16} />
              </button>
            )}
            {STEPS[step].key === 'review' && (
              <button className="btn btn-success" onClick={issuePolicy}>
                <CheckCircle2 size={16} /> {isChange ? 'Issue Policy Change' : 'Issue Policy'}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

/* ---------------- Step 1: Policy Info ---------------- */

function StepPolicyInfo({ data, update }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(data.insured || {})
  const [errors, setErrors] = useState({})

  function saveInsured() {
    const errs = validateInsured(form)
    setErrors(errs)
    if (Object.keys(errs).length) return
    update({ insured: { ...form } })
    setShowForm(false)
  }

  return (
    <div className="animate-rise">
      <h2>Policy Information</h2>
      <p className="muted">Set the policy effective date and add the primary insured.</p>

      <div className="card">
        <div className="field" style={{ maxWidth: 280 }}>
          <label>
            Effective Date <span className="req">*</span>
          </label>
          <input
            type="date"
            value={data.effectiveDate}
            onChange={(e) => update({ effectiveDate: e.target.value })}
          />
          <span className="field-hint">
            Backdating more than 90 days creates an underwriting issue requiring approval.
          </span>
        </div>
      </div>

      <div className="section-head">
        <h3>Primary Insured</h3>
        {!data.insured && !showForm && (
          <button
            className="btn btn-secondary"
            onClick={() => {
              setForm({})
              setErrors({})
              setShowForm(true)
            }}
          >
            <Plus size={16} /> Add Insured
          </button>
        )}
      </div>

      {data.insured && !showForm && (
        <div className="card person-card animate-rise">
          <div className="person-avatar">
            {data.insured.firstName?.[0]}
            {data.insured.lastName?.[0]}
          </div>
          <div className="person-info">
            <strong>
              {data.insured.firstName} {data.insured.lastName}
            </strong>
            <span className="muted">
              DOB {fmtDate(data.insured.dateOfBirth)} · {data.insured.gender}
              {data.insured.email ? ` · ${data.insured.email}` : ''}
            </span>
            <span className="muted">
              {[data.insured.address, data.insured.city, data.insured.state, data.insured.zip]
                .filter(Boolean)
                .join(', ') || 'No address on file'}
            </span>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setForm(data.insured)
              setErrors({})
              setShowForm(true)
            }}
          >
            <Pencil size={15} /> Edit
          </button>
        </div>
      )}

      {showForm && (
        <div className="card form-card animate-rise">
          <div className="form-grid">
            <Field label="First Name" required error={errors.firstName}>
              <input
                value={form.firstName || ''}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="e.g. John"
              />
            </Field>
            <Field label="Last Name" required error={errors.lastName}>
              <input
                value={form.lastName || ''}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder="e.g. Smith"
              />
            </Field>
            <Field label="Date of Birth" required error={errors.dateOfBirth}>
              <input
                type="date"
                value={form.dateOfBirth || ''}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              />
            </Field>
            <Field label="Gender" required error={errors.gender}>
              <div className="radio-row">
                {['Male', 'Female', 'Other'].map((g) => (
                  <label key={g} className="radio">
                    <input
                      type="radio"
                      name="insured-gender"
                      checked={form.gender === g}
                      onChange={() => setForm({ ...form, gender: g })}
                    />
                    {g}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Email">
              <input
                value={form.email || ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@example.com"
              />
            </Field>
            <Field label="Phone">
              <input
                value={form.phone || ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(555) 555-5555"
              />
            </Field>
            <Field label="Address">
              <input
                value={form.address || ''}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Street address"
              />
            </Field>
            <Field label="City">
              <input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="State">
              <input value={form.state || ''} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </Field>
            <Field label="ZIP">
              <input value={form.zip || ''} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
            </Field>
            <Field label="Primary Insured">
              <label className="radio">
                <input
                  type="checkbox"
                  checked={form.isPrimary ?? true}
                  onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })}
                />
                This person is the primary insured
              </label>
            </Field>
          </div>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveInsured}>
              Save Insured Details
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Step 2: Drivers ---------------- */

function StepDrivers({ data, update }) {
  const [editing, setEditing] = useState(null) // index or 'new'
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})

  function saveDriver() {
    const errs = validateDriver(form)
    setErrors(errs)
    if (Object.keys(errs).length) return
    const drivers = [...data.drivers]
    if (editing === 'new') drivers.push({ ...form })
    else drivers[editing] = { ...form }
    update({ drivers })
    setEditing(null)
  }

  return (
    <div className="animate-rise">
      <div className="section-head">
        <div>
          <h2>Drivers</h2>
          <p className="muted">Add all drivers to be covered under this policy.</p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setForm({})
            setErrors({})
            setEditing('new')
          }}
        >
          <Plus size={16} /> Add Driver
        </button>
      </div>

      {data.drivers.map((d, i) => (
        <div key={i} className="card person-card animate-rise">
          <div className="person-avatar">
            {d.firstName?.[0]}
            {d.lastName?.[0]}
          </div>
          <div className="person-info">
            <strong>
              {d.firstName} {d.lastName}{' '}
              {d.relationship ? <span className="tag">{d.relationship}</span> : null}
            </strong>
            <span className="muted">
              DOB {fmtDate(d.dateOfBirth)} · {d.gender} · License {d.licenseNumber}
              {d.licenseState ? ` (${d.licenseState})` : ''}
            </span>
            <span className="muted">
              {d.yearsLicensed || 0} yrs licensed · {d.accidents || 0} accidents ·{' '}
              {d.violations || 0} violations
            </span>
          </div>
          <div className="row-actions">
            <button
              className="btn btn-ghost"
              onClick={() => {
                setForm(d)
                setErrors({})
                setEditing(i)
              }}
            >
              <Pencil size={15} />
            </button>
            <button
              className="btn btn-ghost danger"
              onClick={() => update({ drivers: data.drivers.filter((_, j) => j !== i) })}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}

      {data.drivers.length === 0 && editing === null && (
        <div className="empty-state small">
          <Users size={28} />
          <p>No drivers added yet.</p>
        </div>
      )}

      {editing !== null && (
        <div className="card form-card animate-rise">
          <h3>{editing === 'new' ? 'New Driver' : 'Edit Driver'}</h3>
          <div className="form-grid">
            <Field label="First Name" required error={errors.firstName}>
              <input
                value={form.firstName || ''}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </Field>
            <Field label="Last Name" required error={errors.lastName}>
              <input
                value={form.lastName || ''}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </Field>
            <Field label="Date of Birth" required error={errors.dateOfBirth}>
              <input
                type="date"
                value={form.dateOfBirth || ''}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              />
            </Field>
            <Field label="Gender" required error={errors.gender}>
              <div className="radio-row">
                {['Male', 'Female', 'Other'].map((g) => (
                  <label key={g} className="radio">
                    <input
                      type="radio"
                      name="driver-gender"
                      checked={form.gender === g}
                      onChange={() => setForm({ ...form, gender: g })}
                    />
                    {g}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="License Number" required error={errors.licenseNumber}>
              <input
                value={form.licenseNumber || ''}
                onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                placeholder="10 digits"
                maxLength={10}
              />
            </Field>
            <Field label="License State">
              <input
                value={form.licenseState || ''}
                onChange={(e) => setForm({ ...form, licenseState: e.target.value })}
                placeholder="e.g. CA"
              />
            </Field>
            <Field label="Years Licensed">
              <input
                type="number"
                min="0"
                value={form.yearsLicensed || ''}
                onChange={(e) => setForm({ ...form, yearsLicensed: e.target.value })}
              />
            </Field>
            <Field label="Accidents (past 5 yrs)">
              <input
                type="number"
                min="0"
                value={form.accidents || ''}
                onChange={(e) => setForm({ ...form, accidents: e.target.value })}
              />
            </Field>
            <Field label="Violations (past 5 yrs)">
              <input
                type="number"
                min="0"
                value={form.violations || ''}
                onChange={(e) => setForm({ ...form, violations: e.target.value })}
              />
            </Field>
            <Field label="Relationship to Insured">
              <select
                value={form.relationship || ''}
                onChange={(e) => setForm({ ...form, relationship: e.target.value })}
              >
                <option value="">Select…</option>
                {['Insured', 'Spouse', 'Child', 'Parent', 'Other'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveDriver}>
              Save Driver Details
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Step 3: Vehicles ---------------- */

function StepVehicles({ data, update }) {
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})

  function saveVehicle() {
    const errs = validateVehicle(form)
    setErrors(errs)
    if (Object.keys(errs).length) return
    const vehicles = [...data.vehicles]
    if (editing === 'new') vehicles.push({ ...form })
    else vehicles[editing] = { ...form }
    update({ vehicles })
    setEditing(null)
  }

  const driverNames = data.drivers.map((d) => `${d.firstName} ${d.lastName}`)

  return (
    <div className="animate-rise">
      <div className="section-head">
        <div>
          <h2>Vehicles</h2>
          <p className="muted">Add all vehicles to be covered under this policy.</p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setForm({})
            setErrors({})
            setEditing('new')
          }}
        >
          <Plus size={16} /> Add Vehicle
        </button>
      </div>

      {data.vehicles.map((v, i) => (
        <div key={i} className="card person-card animate-rise">
          <div className="person-avatar vehicle">
            <Car size={18} />
          </div>
          <div className="person-info">
            <strong>
              {v.year} {v.make} {v.model} <span className="tag">{v.ownership}</span>
            </strong>
            <span className="muted">VIN {v.vin}</span>
            <span className="muted">
              {v.usage ? `${v.usage} use · ` : ''}
              {v.annualMileage ? `${Number(v.annualMileage).toLocaleString()} mi/yr · ` : ''}
              {v.primaryDriver ? `Primary driver: ${v.primaryDriver}` : ''}
            </span>
          </div>
          <div className="row-actions">
            <button
              className="btn btn-ghost"
              onClick={() => {
                setForm(v)
                setErrors({})
                setEditing(i)
              }}
            >
              <Pencil size={15} />
            </button>
            <button
              className="btn btn-ghost danger"
              onClick={() => update({ vehicles: data.vehicles.filter((_, j) => j !== i) })}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}

      {data.vehicles.length === 0 && editing === null && (
        <div className="empty-state small">
          <Car size={28} />
          <p>No vehicles added yet.</p>
        </div>
      )}

      {editing !== null && (
        <div className="card form-card animate-rise">
          <h3>{editing === 'new' ? 'New Vehicle' : 'Edit Vehicle'}</h3>
          <div className="form-grid">
            <Field label="VIN" required error={errors.vin}>
              <input
                value={form.vin || ''}
                onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })}
                placeholder="VIN + 12 characters (15 total)"
                maxLength={15}
              />
            </Field>
            <Field label="Year" required error={errors.year}>
              <input
                type="number"
                min="1950"
                max="2030"
                value={form.year || ''}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                placeholder="e.g. 2022"
              />
            </Field>
            <Field label="Make" required error={errors.make}>
              <input
                value={form.make || ''}
                onChange={(e) => setForm({ ...form, make: e.target.value })}
                placeholder="e.g. Toyota"
              />
            </Field>
            <Field label="Model" required error={errors.model}>
              <input
                value={form.model || ''}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="e.g. Camry"
              />
            </Field>
            <Field label="Ownership" required error={errors.ownership}>
              <select
                value={form.ownership || ''}
                onChange={(e) => setForm({ ...form, ownership: e.target.value })}
              >
                <option value="">Select…</option>
                {['Owned', 'Leased', 'Rented'].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
            <Field label="Usage">
              <select
                value={form.usage || ''}
                onChange={(e) => setForm({ ...form, usage: e.target.value })}
              >
                <option value="">Select…</option>
                {['Pleasure', 'Commute', 'Business', 'Farm'].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
            <Field label="Cost New ($)">
              <input
                type="number"
                min="0"
                value={form.costNew || ''}
                onChange={(e) => setForm({ ...form, costNew: e.target.value })}
              />
            </Field>
            <Field label="Annual Mileage">
              <input
                type="number"
                min="0"
                value={form.annualMileage || ''}
                onChange={(e) => setForm({ ...form, annualMileage: e.target.value })}
              />
            </Field>
            <Field label="Primary Driver">
              <select
                value={form.primaryDriver || ''}
                onChange={(e) => setForm({ ...form, primaryDriver: e.target.value })}
              >
                <option value="">Select…</option>
                {driverNames.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveVehicle}>
              Save Vehicle Details
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Step 4: Coverages ---------------- */

function StepCoverages({ data, update }) {
  const categories = [...new Set(COVERAGE_DEFS.map((c) => c.category))]

  function toggle(key) {
    const def = COVERAGE_DEFS.find((c) => c.key === key)
    if (def.required) return
    const cur = data.coverages[key]
    update({ coverages: { ...data.coverages, [key]: { ...cur, selected: !cur.selected } } })
  }

  function setLimit(key, limit) {
    const cur = data.coverages[key]
    update({ coverages: { ...data.coverages, [key]: { ...cur, limit } } })
  }

  return (
    <div className="animate-rise">
      <h2>Coverages</h2>
      <p className="muted">Select coverages and limits for this policy.</p>
      {categories.map((cat) => (
        <div key={cat} className="coverage-group">
          <h3>{cat}</h3>
          {COVERAGE_DEFS.filter((c) => c.category === cat).map((def) => {
            const sel = data.coverages[def.key]
            return (
              <div key={def.key} className={`coverage-row ${sel.selected ? 'selected' : ''}`}>
                <label className="radio coverage-toggle">
                  <input
                    type="checkbox"
                    checked={sel.selected}
                    disabled={def.required}
                    onChange={() => toggle(def.key)}
                  />
                  <span className="coverage-name">
                    {def.name} {def.required && <span className="tag">Required</span>}
                  </span>
                </label>
                <select
                  value={sel.limit}
                  disabled={!sel.selected}
                  onChange={(e) => setLimit(def.key, e.target.value)}
                >
                  {def.limits.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                <span className="coverage-premium">
                  {sel.selected ? fmtMoney(def.premiums[sel.limit]) : '—'}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/* ---------------- Step 5: Quote ---------------- */

function StepQuote({ data }) {
  const premium = useMemo(() => calculatePremium(data), [data])
  return (
    <div className="animate-rise">
      <h2>Quote</h2>
      <p className="muted">Premium calculation for the 12-month policy term.</p>
      <div className="quote-hero animate-rise">
        <div className="quote-total">{fmtMoney(premium.total)}</div>
        <div className="quote-term">Total premium · 12-month term</div>
      </div>
      <div className="card">
        {premium.lines.map((l, i) => (
          <div key={i} className="quote-line">
            <span>{l.label}</span>
            <span>{fmtMoney(l.amount)}</span>
          </div>
        ))}
        <div className="quote-line subtotal">
          <span>Subtotal</span>
          <span>{fmtMoney(premium.subtotal)}</span>
        </div>
        <div className="quote-line">
          <span>Taxes & fees (6%)</span>
          <span>{fmtMoney(premium.taxes)}</span>
        </div>
        <div className="quote-line total">
          <span>Total Premium</span>
          <span>{fmtMoney(premium.total)}</span>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Step 6: Risk Analysis ---------------- */

function StepRisk({ data, user, approveIssue }) {
  const issues = data.uwIssues || []
  return (
    <div className="animate-rise">
      <h2>Risk Analysis</h2>
      <p className="muted">Underwriting issues detected for this submission.</p>
      {issues.length === 0 ? (
        <div className="empty-state small success">
          <CheckCircle2 size={32} />
          <h3>No underwriting issues</h3>
          <p>This submission is clear to proceed.</p>
        </div>
      ) : (
        issues.map((iss, i) => (
          <div key={i} className={`card issue-card ${iss.approved ? 'approved' : 'blocking'} animate-rise`}>
            <div className="issue-icon">
              {iss.approved ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
            </div>
            <div className="person-info">
              <strong>{iss.title}</strong>
              <span className="muted">{iss.description}</span>
              {iss.approved ? (
                <span className="tag approved-tag">
                  Approved by {iss.approvedBy} on {fmtDate(iss.approvedAt)}
                </span>
              ) : (
                <span className="tag blocking-tag">Blocking — underwriter approval required</span>
              )}
            </div>
            {!iss.approved && user.role === 'underwriter' && (
              <button className="btn btn-success" onClick={() => approveIssue(iss.code)}>
                <CheckCircle2 size={15} /> Approve
              </button>
            )}
          </div>
        ))
      )}
    </div>
  )
}

/* ---------------- Step 7: Review ---------------- */

function StepReview({ data }) {
  const premium = data.premium || calculatePremium(data)
  return (
    <div className="animate-rise">
      <h2>Review</h2>
      <p className="muted">Review the policy details before issuing.</p>
      <ReviewBlocks data={data} premium={premium} />
    </div>
  )
}

export function ReviewBlocks({ data, premium }) {
  return (
    <>
      <div className="review-grid">
        <div className="card">
          <h3>Policy</h3>
          <KV k="Effective Date" v={fmtDate(data.effectiveDate)} />
          <KV k="Expiration Date" v={fmtDate(data.expirationDate || (data.effectiveDate ? addYears(data.effectiveDate, 1) : ''))} />
          <KV k="Term" v="12 months" />
          <KV k="Total Premium" v={fmtMoney(premium?.total)} />
        </div>
        <div className="card">
          <h3>Primary Insured</h3>
          {data.insured && (
            <>
              <KV k="Name" v={`${data.insured.firstName} ${data.insured.lastName}`} />
              <KV k="DOB" v={fmtDate(data.insured.dateOfBirth)} />
              <KV k="Gender" v={data.insured.gender} />
              <KV
                k="Address"
                v={
                  [data.insured.address, data.insured.city, data.insured.state, data.insured.zip]
                    .filter(Boolean)
                    .join(', ') || '—'
                }
              />
            </>
          )}
        </div>
      </div>
      <div className="card">
        <h3>Drivers ({data.drivers?.length || 0})</h3>
        {(data.drivers || []).map((d, i) => (
          <KV
            key={i}
            k={`${d.firstName} ${d.lastName}`}
            v={`DOB ${fmtDate(d.dateOfBirth)} · License ${d.licenseNumber}`}
          />
        ))}
      </div>
      <div className="card">
        <h3>Vehicles ({data.vehicles?.length || 0})</h3>
        {(data.vehicles || []).map((v, i) => (
          <KV key={i} k={`${v.year} ${v.make} ${v.model}`} v={`VIN ${v.vin} · ${v.ownership}`} />
        ))}
      </div>
      <div className="card">
        <h3>Coverages</h3>
        {COVERAGE_DEFS.filter((c) => data.coverages?.[c.key]?.selected).map((c) => (
          <KV key={c.key} k={c.name} v={data.coverages[c.key].limit} />
        ))}
      </div>
    </>
  )
}

/* ---------------- Step 8: Policy Summary ---------------- */

function StepSummary({ data, onOpenPolicy }) {
  return (
    <div className="animate-rise summary-step">
      <div className="summary-hero animate-pop">
        <Award size={40} />
        <h2>Policy {data.status === 'In Force' ? 'In Force' : data.status}</h2>
        <div className="summary-policy-num">{data.policyNumber}</div>
        <p>
          {fmtDate(data.effectiveDate)} — {fmtDate(data.expirationDate)} ·{' '}
          {fmtMoney(data.premium?.total)}
        </p>
      </div>
      <ReviewBlocks data={data} premium={data.premium} />
      <div className="form-actions center">
        <button className="btn btn-primary" onClick={onOpenPolicy}>
          View Policy <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

/* ---------------- Shared bits ---------------- */

export function Field({ label, required, error, children }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label>
        {label} {required && <span className="req">*</span>}
      </label>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}

export function KV({ k, v }) {
  return (
    <div className="kv">
      <span className="kv-key">{k}</span>
      <span className="kv-val">{v || '—'}</span>
    </div>
  )
}
