'use strict'

// ─────────────────────────────────────────────────────────────────────────────
// Heavy-Vehicle Structural Assessment (HV-1)
//
// Evaluates a candidate heavy vehicle (axle configuration + masses + dimensions)
// against a bridge's stored capacity, returning a pass / conditional / fail
// verdict with the governing check and margins — the core NHVR-style access
// question the register previously could only store the *outcome* of.
//
// Pure functions (no I/O). Checks, in order of severity:
//   1. Load-rating-factor gate   — RF < 1.0 → posting territory; RF < refusalRF → fail
//   2. Gross mass                — vehicle GVM vs grossMassLimit (and grossCombined)
//   3. Axle-group masses         — each group vs the matching axle-group limit
//   4. Bridge-formula (spacing)  — allowable mass for an axle set given its spacing
//   5. Dimensions                — height vs clearance, width vs trafficable width
//
// Every limit is read from the bridge + its BridgeCapacities row; nothing is
// hardcoded. A missing limit is reported as "not assessable" for that check
// (never silently passed). Verdict = worst check outcome.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
const has = (v) => v !== null && v !== undefined && v !== ''

// Default refusal threshold on rating factor: below this the structure is unsafe
// for the load and the vehicle is refused (vs merely "conditional / permit"). Config
// override via params.refusalRF.
const DEFAULT_REFUSAL_RF = 0.8

// Verdict severity ordering so we can take the worst.
const RANK = { pass: 0, conditional: 1, fail: 2, 'not-assessable': 0 }
const worst = (a, b) => (RANK[b] > RANK[a] ? b : a)

// Parse the vehicle's axle groups from JSON (array) or accept an already-parsed array.
function parseAxleGroups (vehicle) {
  if (!vehicle) return []
  const raw = vehicle.axleGroups
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    try { const a = JSON.parse(raw); return Array.isArray(a) ? a : [] } catch (_e) { return [] }
  }
  return []
}

// Map an axle-group type to the matching capacity-limit field.
const GROUP_LIMIT_FIELD = {
  steer: 'steerAxleLimit',
  single: 'singleAxleLimit',
  tandem: 'tandemGroupLimit',
  tri: 'triAxleGroupLimit',
  quad: 'triAxleGroupLimit' // no quad field in capacity; tri limit is the closest conservative proxy
}

// ── Individual checks. Each returns { check, verdict, detail, marginPct? } ──────

function ratingFactorCheck (capacity, params) {
  const rf = num(capacity && (capacity.ratingFactor))
  if (!has(rf)) return { check: 'Rating factor', verdict: 'not-assessable', detail: 'No rating factor on record.' }
  const refusal = num(params && params.refusalRF) ?? DEFAULT_REFUSAL_RF
  if (rf < refusal) return { check: 'Rating factor', verdict: 'fail', detail: `RF ${rf} below refusal threshold ${refusal}.`, marginPct: round((rf - 1) * 100) }
  if (rf < 1.0) return { check: 'Rating factor', verdict: 'conditional', detail: `RF ${rf} < 1.0 — posting/permit territory.`, marginPct: round((rf - 1) * 100) }
  return { check: 'Rating factor', verdict: 'pass', detail: `RF ${rf} ≥ 1.0.`, marginPct: round((rf - 1) * 100) }
}

function grossMassCheck (bridge, capacity, vehicle) {
  const gvm = num(vehicle && vehicle.gvmTonnes)
  if (!has(gvm)) return { check: 'Gross mass', verdict: 'not-assessable', detail: 'Vehicle GVM not provided.' }
  const limit = num((capacity && (capacity.grossCombined || capacity.grossMassLimit)))
  if (!has(limit)) return { check: 'Gross mass', verdict: 'not-assessable', detail: 'No gross mass limit on record.' }
  const marginPct = round(((limit - gvm) / limit) * 100)
  if (gvm > limit) return { check: 'Gross mass', verdict: 'fail', detail: `GVM ${gvm} t exceeds limit ${limit} t.`, marginPct }
  return { check: 'Gross mass', verdict: 'pass', detail: `GVM ${gvm} t within limit ${limit} t.`, marginPct }
}

function axleGroupChecks (capacity, groups) {
  const out = []
  groups.forEach((g, i) => {
    const mass = num(g.massT)
    const field = GROUP_LIMIT_FIELD[String(g.type || '').toLowerCase()]
    const limit = field ? num(capacity && capacity[field]) : null
    const label = `Axle group ${i + 1} (${g.type || '?'})`
    if (!has(mass)) { out.push({ check: label, verdict: 'not-assessable', detail: 'Group mass not provided.' }); return }
    if (!has(limit)) { out.push({ check: label, verdict: 'not-assessable', detail: `No ${g.type} axle limit on record.` }); return }
    const marginPct = round(((limit - mass) / limit) * 100)
    if (mass > limit) out.push({ check: label, verdict: 'fail', detail: `${mass} t exceeds ${g.type} limit ${limit} t.`, marginPct })
    else out.push({ check: label, verdict: 'pass', detail: `${mass} t within ${g.type} limit ${limit} t.`, marginPct })
  })
  return out
}

// Bridge-formula style check: the allowable mass over a set of axles increases with the
// outer spacing. We use a transparent, config-driven linear allowable: allowable =
// base + rate * spacingM, clamped to the gross limit. base/rate come from params
// (config) so nothing is hardcoded; when absent, the check is not-assessable.
function bridgeFormulaCheck (capacity, groups, params) {
  const cfg = (params && params.bridgeFormula) || null
  if (!cfg || !has(num(cfg.baseT)) || !has(num(cfg.ratePerM))) {
    return { check: 'Bridge formula (spacing)', verdict: 'not-assessable', detail: 'No bridge-formula parameters configured.' }
  }
  if (!groups.length) return { check: 'Bridge formula (spacing)', verdict: 'not-assessable', detail: 'No axle groups provided.' }
  const totalMass = groups.reduce((s, g) => s + (num(g.massT) || 0), 0)
  // outer-to-outer spacing = sum of inter-group spacings
  const spanM = groups.reduce((s, g) => s + (num(g.spacingM) || 0), 0)
  const allowable = num(cfg.baseT) + num(cfg.ratePerM) * spanM
  const marginPct = round(((allowable - totalMass) / allowable) * 100)
  if (totalMass > allowable) return { check: 'Bridge formula (spacing)', verdict: 'fail', detail: `Set mass ${round(totalMass)} t over ${round(spanM)} m exceeds allowable ${round(allowable)} t.`, marginPct }
  return { check: 'Bridge formula (spacing)', verdict: 'pass', detail: `Set mass ${round(totalMass)} t over ${round(spanM)} m within allowable ${round(allowable)} t.`, marginPct }
}

function dimensionChecks (bridge, capacity, vehicle) {
  const out = []
  const h = num(vehicle && vehicle.overallHeightM)
  const clearance = num((capacity && capacity.minClearancePosted)) ?? num(bridge && bridge.clearanceHeight)
  if (has(h) && has(clearance)) {
    const marginPct = round(((clearance - h) / clearance) * 100)
    out.push(h > clearance
      ? { check: 'Height clearance', verdict: 'fail', detail: `Vehicle ${h} m exceeds clearance ${clearance} m.`, marginPct }
      : { check: 'Height clearance', verdict: 'pass', detail: `Vehicle ${h} m under clearance ${clearance} m.`, marginPct })
  }
  const w = num(vehicle && vehicle.overallWidthM)
  const width = num((capacity && (capacity.trafficableWidth || capacity.carriagewayWidth)))
  if (has(w) && has(width)) {
    const marginPct = round(((width - w) / width) * 100)
    out.push(w > width
      ? { check: 'Width', verdict: 'fail', detail: `Vehicle ${w} m exceeds trafficable width ${width} m.`, marginPct }
      : { check: 'Width', verdict: 'pass', detail: `Vehicle ${w} m within trafficable width ${width} m.`, marginPct })
  }
  return out
}

function round (n) { return Math.round(Number(n) * 10) / 10 }

// Normalise a comma list of mode codes to a lower-cased Set.
function modeSet (s) {
  return new Set(String(s || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean))
}

// RAIL-1 (council fix #3): mode applicability gate. A vehicle/load model only applies to the
// transport mode(s) it declares (AssessmentVehicles.applicableModes). Running a road
// heavy-vehicle model against a rail or pedestrian structure and reporting the road mass /
// bridge-formula / dimension "passes" would be actively misleading — worse than no answer.
// So a mode mismatch refuses the assessment with a clear reason. Rules: a 'Multi' structure
// (shared road+rail) accepts any model; an unspecified bridge mode defaults to Road (schema
// default) so legacy data is unaffected; a vehicle with no declared scope is not blocked
// (legacy/custom rows). Returns a not-assessable check on mismatch, else null.
function modeApplicabilityCheck (bridge, vehicle) {
  const bridgeMode = String((bridge && bridge.transportMode) || 'Road').trim()
  if (bridgeMode.toLowerCase() === 'multi') return null
  const applicable = modeSet(vehicle && vehicle.applicableModes)
  if (!applicable.size) return null
  if (applicable.has(bridgeMode.toLowerCase()) || applicable.has('multi')) return null
  const label = (vehicle && (vehicle.code || vehicle.name)) || 'load model'
  return {
    check: 'Mode applicability',
    verdict: 'not-assessable',
    detail: `${label} applies to ${[...applicable].join('/')} structures, not a ${bridgeMode} structure — use the ${bridgeMode} design load model.`
  }
}

// ── Public: assess one vehicle against one bridge+capacity ─────────────────────
// bridge: Bridges row; capacity: a BridgeCapacities row (latest); vehicle: an
// AssessmentVehicles row (axleGroups JSON) or equivalent object; params: optional
// config { refusalRF, bridgeFormula:{baseT, ratePerM} }.
function assessVehicle ({ bridge, capacity, vehicle, params } = {}) {
  // Refuse a mode-mismatched model up front rather than emitting misleading road checks.
  const modeMismatch = modeApplicabilityCheck(bridge, vehicle)
  if (modeMismatch) {
    return {
      bridgeId: bridge && (bridge.bridgeId || bridge.ID),
      vehicle: vehicle && (vehicle.code || vehicle.name),
      verdict: 'not-assessable',
      governingCheck: modeMismatch.check,
      governingDetail: modeMismatch.detail,
      minMarginPct: null,
      checks: [modeMismatch]
    }
  }
  const groups = parseAxleGroups(vehicle)
  const checks = [
    ratingFactorCheck(capacity, params),
    grossMassCheck(bridge, capacity, vehicle),
    ...axleGroupChecks(capacity || {}, groups),
    bridgeFormulaCheck(capacity || {}, groups, params),
    ...dimensionChecks(bridge || {}, capacity || {}, vehicle || {})
  ]
  let verdict = 'pass'
  for (const c of checks) verdict = worst(verdict, c.verdict)
  // if EVERY check is not-assessable, the structure cannot be assessed for this vehicle
  const assessable = checks.some(c => c.verdict !== 'not-assessable')
  if (!assessable) verdict = 'not-assessable'
  const governing = checks
    .filter(c => c.verdict === verdict && verdict !== 'pass')
    .sort((a, b) => (num(a.marginPct) ?? 0) - (num(b.marginPct) ?? 0))[0]
    || checks.filter(c => c.verdict !== 'not-assessable').sort((a, b) => (num(a.marginPct) ?? 999) - (num(b.marginPct) ?? 999))[0]
    || null
  return {
    bridgeId: bridge && (bridge.bridgeId || bridge.ID),
    vehicle: vehicle && (vehicle.code || vehicle.name),
    verdict,                       // pass | conditional | fail | not-assessable
    governingCheck: governing ? governing.check : null,
    governingDetail: governing ? governing.detail : null,
    minMarginPct: checks.reduce((m, c) => has(c.marginPct) ? Math.min(m, c.marginPct) : m, Infinity) === Infinity ? null
      : checks.reduce((m, c) => has(c.marginPct) ? Math.min(m, c.marginPct) : m, Infinity),
    checks
  }
}

// ── Public: route rollup — the governing (worst) structure along a route ───────
// assessments: array of assessVehicle() results (one per structure on the route).
function assessRoute (assessments) {
  const list = (assessments || []).filter(Boolean)
  if (!list.length) return { routeVerdict: 'not-assessable', governingStructure: null, structures: [] }
  let routeVerdict = 'pass'
  for (const a of list) routeVerdict = worst(routeVerdict, a.verdict)
  // governing = worst verdict, then tightest margin
  const governing = list
    .filter(a => a.verdict === routeVerdict)
    .sort((a, b) => (num(a.minMarginPct) ?? 999) - (num(b.minMarginPct) ?? 999))[0] || null
  return {
    routeVerdict,
    governingStructure: governing ? governing.bridgeId : null,
    governingCheck: governing ? governing.governingCheck : null,
    structureCount: list.length,
    structures: list
  }
}

module.exports = { assessVehicle, assessRoute, parseAxleGroups }
