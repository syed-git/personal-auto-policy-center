// Business logic: validation, rating, underwriting issues, cancellation math.

export const NAME_RE = /^[A-Za-z ]+$/
export const LICENSE_RE = /^\d{10}$/
export const VIN_RE = /^VIN[A-Z0-9]{12}$/ // 15 chars, alphanumeric, starts with VIN

export const COVERAGE_DEFS = [
  {
    key: 'bodilyInjury',
    name: 'Bodily Injury Liability',
    category: 'Liability',
    limits: ['25k/50k', '50k/100k', '100k/300k', '250k/500k', '500k/1M'],
    premiums: { '25k/50k': 180, '50k/100k': 240, '100k/300k': 320, '250k/500k': 420, '500k/1M': 560 },
    required: true,
    default: '100k/300k',
  },
  {
    key: 'propertyDamage',
    name: 'Property Damage Liability',
    category: 'Liability',
    limits: ['25k', '50k', '100k', '250k'],
    premiums: { '25k': 90, '50k': 120, '100k': 160, '250k': 220 },
    required: true,
    default: '100k',
  },
  {
    key: 'uninsuredMotorist',
    name: 'Uninsured/Underinsured Motorist',
    category: 'Liability',
    limits: ['25k/50k', '50k/100k', '100k/300k', '250k/500k'],
    premiums: { '25k/50k': 60, '50k/100k': 85, '100k/300k': 110, '250k/500k': 150 },
    required: false,
    default: '100k/300k',
  },
  {
    key: 'medicalPayments',
    name: 'Medical Payments',
    category: 'Liability',
    limits: ['1k', '5k', '10k', '25k'],
    premiums: { '1k': 25, '5k': 45, '10k': 70, '25k': 110 },
    required: false,
    default: '5k',
  },
  {
    key: 'comprehensive',
    name: 'Comprehensive',
    category: 'Physical Damage',
    limits: ['$100 ded', '$250 ded', '$500 ded', '$1,000 ded'],
    premiums: { '$100 ded': 220, '$250 ded': 180, '$500 ded': 140, '$1,000 ded': 100 },
    required: false,
    default: '$500 ded',
  },
  {
    key: 'collision',
    name: 'Collision',
    category: 'Physical Damage',
    limits: ['$100 ded', '$250 ded', '$500 ded', '$1,000 ded'],
    premiums: { '$100 ded': 320, '$250 ded': 270, '$500 ded': 210, '$1,000 ded': 160 },
    required: false,
    default: '$500 ded',
  },
  {
    key: 'rental',
    name: 'Rental Reimbursement',
    category: 'Additional',
    limits: ['$30/day', '$50/day', '$75/day'],
    premiums: { '$30/day': 25, '$50/day': 40, '$75/day': 60 },
    required: false,
    default: '$30/day',
  },
  {
    key: 'roadside',
    name: 'Roadside Assistance',
    category: 'Additional',
    limits: ['Basic', 'Premium'],
    premiums: { Basic: 15, Premium: 30 },
    required: false,
    default: 'Basic',
  },
]

export function defaultCoverages() {
  const cov = {}
  for (const def of COVERAGE_DEFS) {
    cov[def.key] = { selected: def.required, limit: def.default }
  }
  return cov
}

export function validateInsured(ins) {
  const errors = {}
  if (!ins.firstName?.trim()) errors.firstName = 'First name is required'
  else if (!NAME_RE.test(ins.firstName.trim())) errors.firstName = 'First name may contain only letters and spaces'
  if (!ins.lastName?.trim()) errors.lastName = 'Last name is required'
  else if (!NAME_RE.test(ins.lastName.trim())) errors.lastName = 'Last name may contain only letters and spaces'
  if (!ins.dateOfBirth) errors.dateOfBirth = 'Date of birth is required'
  if (!ins.gender) errors.gender = 'Gender is required'
  return errors
}

export function validateDriver(d) {
  const errors = {}
  if (!d.firstName?.trim()) errors.firstName = 'First name is required'
  else if (!NAME_RE.test(d.firstName.trim())) errors.firstName = 'First name may contain only letters and spaces'
  if (!d.lastName?.trim()) errors.lastName = 'Last name is required'
  else if (!NAME_RE.test(d.lastName.trim())) errors.lastName = 'Last name may contain only letters and spaces'
  if (!d.dateOfBirth) errors.dateOfBirth = 'Date of birth is required'
  if (!d.gender) errors.gender = 'Gender is required'
  if (!d.licenseNumber?.trim()) errors.licenseNumber = 'License number is required'
  else if (!LICENSE_RE.test(d.licenseNumber.trim())) errors.licenseNumber = 'License number must be exactly 10 digits'
  return errors
}

export function validateVehicle(v) {
  const errors = {}
  if (!v.vin?.trim()) errors.vin = 'VIN is required'
  else if (!VIN_RE.test(v.vin.trim()))
    errors.vin = 'VIN must be 15 alphanumeric characters starting with VIN (e.g. VINABC123456789)'
  if (!v.year) errors.year = 'Year is required'
  if (!v.make?.trim()) errors.make = 'Make is required'
  if (!v.model?.trim()) errors.model = 'Model is required'
  if (!v.ownership) errors.ownership = 'Ownership is required'
  return errors
}

export function ageOn(dateOfBirth, onDate) {
  const dob = new Date(dateOfBirth)
  const ref = new Date(onDate)
  let age = ref.getFullYear() - dob.getFullYear()
  const m = ref.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) age--
  return age
}

export function daysBackdated(effectiveDate) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const eff = new Date(effectiveDate + 'T00:00:00')
  return Math.floor((today - eff) / (1000 * 60 * 60 * 24))
}

// Underwriting issues. Returns array of { code, title, description, blocking }
export function evaluateUWIssues(data, userRole) {
  const issues = []
  if (data.effectiveDate && daysBackdated(data.effectiveDate) > 90 && userRole !== 'underwriter') {
    issues.push({
      code: 'BACKDATE_90',
      title: 'Policy backdated more than 90 days',
      description: `Effective date ${data.effectiveDate} is ${daysBackdated(
        data.effectiveDate
      )} days in the past. Underwriter approval is required to issue a policy backdated more than 90 days.`,
      blocking: true,
    })
  }
  for (const d of data.drivers || []) {
    if (d.dateOfBirth && data.effectiveDate && ageOn(d.dateOfBirth, data.effectiveDate) < 16) {
      issues.push({
        code: 'YOUNG_DRIVER',
        title: `Driver ${d.firstName} ${d.lastName} is under 16`,
        description: 'Drivers must be at least 16 years old on the policy effective date.',
        blocking: true,
      })
    }
    const incidents = (Number(d.accidents) || 0) + (Number(d.violations) || 0)
    if (incidents >= 4) {
      issues.push({
        code: 'HIGH_RISK_DRIVER',
        title: `Driver ${d.firstName} ${d.lastName} has ${incidents} incidents`,
        description: 'Drivers with 4 or more combined accidents and violations require underwriter review.',
        blocking: true,
      })
    }
  }
  return issues
}

export function calculatePremium(data) {
  const lines = []
  let vehicleBase = 0
  for (const v of data.vehicles || []) {
    let base = 400
    const age = new Date().getFullYear() - Number(v.year || new Date().getFullYear())
    if (age <= 3) base += 150
    else if (age <= 10) base += 75
    if (v.costNew) base += Math.min(300, Number(v.costNew) * 0.004)
    if (v.annualMileage && Number(v.annualMileage) > 15000) base += 80
    if (v.usage === 'Business') base += 120
    else if (v.usage === 'Commute') base += 60
    vehicleBase += base
  }
  if (vehicleBase > 0) lines.push({ label: `Vehicle base (${(data.vehicles || []).length} vehicle(s))`, amount: vehicleBase })

  let driverAdj = 0
  for (const d of data.drivers || []) {
    const age = d.dateOfBirth ? ageOn(d.dateOfBirth, data.effectiveDate || new Date()) : 30
    if (age < 25) driverAdj += 250
    else if (age > 70) driverAdj += 120
    driverAdj += (Number(d.accidents) || 0) * 150
    driverAdj += (Number(d.violations) || 0) * 90
    if (Number(d.yearsLicensed) >= 10) driverAdj -= 50
  }
  if ((data.drivers || []).length) lines.push({ label: `Driver factors (${data.drivers.length} driver(s))`, amount: driverAdj })

  let coverageTotal = 0
  const nVehicles = Math.max(1, (data.vehicles || []).length)
  for (const def of COVERAGE_DEFS) {
    const sel = data.coverages?.[def.key]
    if (sel?.selected) {
      const perVehicle = def.category === 'Physical Damage' || def.category === 'Additional'
      const amt = (def.premiums[sel.limit] || 0) * (perVehicle ? nVehicles : 1)
      coverageTotal += amt
      lines.push({ label: `${def.name} (${sel.limit})`, amount: amt })
    }
  }

  const subtotal = vehicleBase + driverAdj + coverageTotal
  const taxes = Math.round(subtotal * 0.06 * 100) / 100
  const total = Math.round((subtotal + taxes) * 100) / 100
  return { lines, subtotal: Math.round(subtotal * 100) / 100, taxes, total }
}

export function addYears(dateStr, years) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().slice(0, 10)
}

export function proRataRefund(policy, cancelDate) {
  const eff = new Date(policy.effectiveDate + 'T00:00:00')
  const exp = new Date(policy.expirationDate + 'T00:00:00')
  const cxl = new Date(cancelDate + 'T00:00:00')
  const totalDays = Math.max(1, (exp - eff) / (1000 * 60 * 60 * 24))
  const unusedDays = Math.max(0, Math.min(totalDays, (exp - cxl) / (1000 * 60 * 60 * 24)))
  return Math.round((policy.premium?.total || 0) * (unusedDays / totalDays) * 100) / 100
}

export function fmtMoney(n) {
  return (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d.length <= 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
