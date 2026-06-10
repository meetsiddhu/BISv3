'use strict'
// BSI/BHI engine (from the approved NSW BSI/BHI calculator mockup — docs/prioritisation/
// nsw_bridge_bsi_bhi_calculator_1.html). Pure functions.
//   BSI_raw = Σ(elementRating × weight)/Σ(weight)        (ratings on the legacy 0-10 scale)
//   BSI     = clamp 0..10 ( BSI_raw × ageFactor − envPenalty )
//   BHI     = clamp 0..100 ( BSI×10 × (1−vulnerability) × importFactor )
//   RSL     = (BSI/10) × (100−age) × rslUtilisation
//
// CONFIG (council B8 — zero hardcoding): the per-mode element weights AND every environmental
// coefficient are governed via the SystemConfig row 'bhiWeights' (JSON, partial overrides merge
// over the defaults below). The constants below are the DOCUMENTED DEFAULTS — the exact values
// of the approved calculator, kept so the calculator-parity tests pin them byte-identically.
// Callers refresh via configure(await getConfig('bhiWeights')); the pure compute functions also
// accept an explicit cfg argument.
//
// CALIBRATION HONESTY (council B8): the source calculator's four methodology tabs are
// NHVR/RMS ROAD load-rating weight sets. Until rail/pedestrian weight sets are sourced and
// calibrated, the non-road modes are labelled 'road-derived weights (calibrate)' (see
// `calibrated` below + the bhiDetail action) instead of presenting them as rail/ped methodology.
const DEFAULT_MODE_WEIGHTS = Object.freeze({
  Road: Object.freeze({ deck: 0.25, superstructure: 0.30, substructure: 0.20, bearings: 0.10, drainage: 0.08, approach: 0.07 }),
  RoadOverWater: Object.freeze({ deck: 0.22, superstructure: 0.28, substructure: 0.22, bearings: 0.10, drainage: 0.08, approach: 0.05, scour: 0.05 }),
  Rail: Object.freeze({ deck: 0.20, superstructure: 0.35, substructure: 0.25, bearings: 0.12, drainage: 0.05, approach: 0.03 }),
  Pedestrian: Object.freeze({ deck: 0.30, superstructure: 0.30, substructure: 0.25, bearings: 0.08, drainage: 0.07 })
})
// Environmental / age / importance coefficients (calculator defaults, all overridable):
//   ageFactor   = max(0, 1 − (age/ageSpanYears) × ageWearMax)
//   envPenalty  = (floodExp−1)×floodStep + (corrZone−1)×corrStep + seismic×seismicStep
//   vulnerability = min(vulnCap, (age/vulnAgeSpanYears)×vulnAgeShare + envPenalty)
//   importFactor  = importBase + (importClass−1)×importStep
//   RSL          = (BSI/10) × (rslHorizonYears − age) × rslUtilisation
const DEFAULT_ENV_COEFFICIENTS = Object.freeze({
  ageSpanYears: 120, ageWearMax: 0.3,
  floodStep: 0.04, corrStep: 0.03, seismicStep: 0.02,
  vulnCap: 0.4, vulnAgeSpanYears: 100, vulnAgeShare: 0.2,
  importBase: 0.85, importStep: 0.03,
  rslHorizonYears: 100, rslUtilisation: 0.6
})
const DEFAULT_BHI_CONFIG = Object.freeze({
  modeWeights: DEFAULT_MODE_WEIGHTS,
  env: DEFAULT_ENV_COEFFICIENTS,
  // Modes whose weight sets ARE the source methodology. Rail/Pedestrian stay out until a
  // defensible weight set is sourced — bhiDetail labels them 'road-derived weights (calibrate)'.
  calibrated: Object.freeze(['Road', 'RoadOverWater'])
})

// Element-type → weight-bucket mapping. Order matters (first match wins).
// B8: joints articulate with the BEARING system (not ~3x-weighted superstructure, the old
// fallback) and railings/parapets/barriers are deck furniture — both used to fall through to
// the superstructure default and overweight cosmetic elements.
const BUCKETS = [
  [/joint/i, 'bearings'],
  [/railing|handrail|guardrail|guard rail|parapet|balustrade|barrier/i, 'deck'],
  [/deck|slab|surface/i, 'deck'], [/gird|beam|super|truss|arch|span/i, 'superstructure'],
  [/pier|abut|found|sub|column|headstock/i, 'substructure'], [/bear/i, 'bearings'],
  [/drain|scupper/i, 'drainage'], [/approach|embank/i, 'approach'], [/scour|water|channel/i, 'scour']]
const bucketOf = (t) => { for (const [re, b] of BUCKETS) { if (re.test(String(t || ''))) return b } return 'superstructure' }
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ── Config resolution: SystemConfig 'bhiWeights' JSON merged over the documented defaults ──
// Accepts a JSON string, a plain object or null. Partial overrides merge per mode / per
// coefficient; non-finite or negative values are IGNORED (the default holds) — a bad admin
// edit can degrade a weight, never NaN the fleet.
function resolveBhiConfig (raw) {
  let o
  try { o = typeof raw === 'string' ? JSON.parse(raw) : raw } catch (_e) { o = null }
  if (!o || typeof o !== 'object') return DEFAULT_BHI_CONFIG
  const modeWeights = {}
  const sourceModes = Object.assign({}, DEFAULT_MODE_WEIGHTS, (o.modeWeights && typeof o.modeWeights === 'object') ? o.modeWeights : {})
  for (const mode of Object.keys(sourceModes)) {
    const base = Object.assign({}, DEFAULT_MODE_WEIGHTS[mode] || {})
    const over = (o.modeWeights || {})[mode]
    if (over && typeof over === 'object') {
      for (const [k, v] of Object.entries(over)) { const n = Number(v); if (Number.isFinite(n) && n >= 0) base[k] = n }
    }
    if (Object.keys(base).length) modeWeights[mode] = base
  }
  const env = Object.assign({}, DEFAULT_ENV_COEFFICIENTS)
  if (o.env && typeof o.env === 'object') {
    for (const [k, v] of Object.entries(o.env)) { const n = Number(v); if (Number.isFinite(n) && k in DEFAULT_ENV_COEFFICIENTS) env[k] = n }
  }
  const calibrated = Array.isArray(o.calibrated) ? o.calibrated.map(String) : DEFAULT_BHI_CONFIG.calibrated.slice()
  return { modeWeights, env, calibrated }
}
// Module-level ACTIVE config — service handlers refresh it from SystemConfig before computing
// (configure(await getConfig('bhiWeights'))); pure callers may pass cfg explicitly instead.
let _active = DEFAULT_BHI_CONFIG
function configure (raw) { _active = resolveBhiConfig(raw); return _active }
function activeBhiConfig () { return _active }

function modeKeyFor (mode, overWater) {
  if (/rail|lightrail/i.test(mode || '')) return 'Rail'
  if (/ped|active|shared/i.test(mode || '')) return 'Pedestrian'
  return overWater ? 'RoadOverWater' : 'Road'
}
function weightsFor (mode, overWater, cfg) {
  const c = cfg || _active
  return c.modeWeights[modeKeyFor(mode, overWater)] || c.modeWeights.Road
}
const envPenaltyOf = (env, E) =>
  (num(env && env.floodExp, 1) - 1) * E.floodStep + (num(env && env.corrZone, 1) - 1) * E.corrStep + num(env && env.seismic, 0) * E.seismicStep
// elements: BridgeElements rows (elementType + conditionRating 1-10). env: {age, floodExp 1-5,
// corrZone 1-4, seismic 0-3, importClass 1-4, overWater}. Missing element buckets are EXCLUDED
// from Σweight (never silently zeroed); fallback rating = bridge conditionRating when no elements.
function computeBSI (elements, mode, env, cfg) {
  const c = cfg || _active
  const E = c.env
  const w = weightsFor(mode, env && env.overWater, c)
  const byBucket = {}
  for (const e of (elements || [])) {
    const b = bucketOf(e.elementType)
    const r = num(e.conditionRating, null)
    if (r === null || !(b in w)) continue
    byBucket[b] = byBucket[b] ? Math.min(byBucket[b], r) : r // worst element per bucket governs
  }
  let n = 0; let d = 0
  for (const [k, wt] of Object.entries(w)) { if (byBucket[k] !== undefined) { n += byBucket[k] * wt; d += wt } }
  if (d === 0 && env && num(env.fallbackCondition, null) !== null) { n = num(env.fallbackCondition, 0); d = 1 }
  if (d === 0) return { bsi: null, coverage: 0 }
  const age = Math.max(0, num(env && env.age, 0))
  const ageFactor = Math.max(0, 1 - (age / E.ageSpanYears) * E.ageWearMax)
  const envPenalty = envPenaltyOf(env, E)
  const bsi = clamp((n / d) * ageFactor - envPenalty, 0, 10)
  return { bsi: Math.round(bsi * 100) / 100, coverage: Math.round(d / Object.values(w).reduce((a, b) => a + b, 0) * 100), ageFactor: Math.round(ageFactor * 1000) / 1000, envPenalty: Math.round(envPenalty * 1000) / 1000 }
}
function computeBHI (bsi, env, cfg) {
  if (bsi === null || bsi === undefined) return null
  const E = (cfg || _active).env
  const age = Math.max(0, num(env && env.age, 0))
  const envPenalty = envPenaltyOf(env, E)
  const vulnerability = Math.min(E.vulnCap, (age / E.vulnAgeSpanYears) * E.vulnAgeShare + envPenalty)
  const importFactor = E.importBase + (num(env && env.importClass, 1) - 1) * E.importStep
  return Math.round(clamp(bsi * 10 * (1 - vulnerability) * importFactor, 0, 100) * 10) / 10
}
const remainingServiceLife = (bsi, age, cfg) => {
  if (bsi === null) return null
  const E = (cfg || _active).env
  return Math.max(0, Math.round((bsi / 10) * (E.rslHorizonYears - Math.max(0, num(age, 0))) * E.rslUtilisation))
}
const bsiPriority = (bsi) => bsi === null ? null : bsi < 4 ? 'URGENT' : bsi < 6 ? 'HIGH' : bsi < 7.5 ? 'ROUTINE' : 'MONITORING'
function envFromBridge (b) {
  const year = num(b && b.yearBuilt, null)
  return {
    age: year ? (new Date().getFullYear() - year) : 0,
    floodExp: b && b.floodImpacted ? 3 : 1,
    corrZone: /marine|coastal/i.test((b && b.region) || '') ? 3 : 1,
    seismic: num(b && String(b.seismicZone || '').replace(/\D/g, ''), 0) || 0,
    importClass: num(b && b.importanceLevel, 1),
    overWater: !!(b && (b.floodImmunityAriYears || b.floodImpacted)),
    fallbackCondition: num(b && b.conditionRating, null)
  }
}
module.exports = {
  computeBSI, computeBHI, remainingServiceLife, bsiPriority, envFromBridge, weightsFor, bucketOf,
  modeKeyFor, resolveBhiConfig, configure, activeBhiConfig,
  DEFAULT_BHI_CONFIG, DEFAULT_MODE_WEIGHTS, DEFAULT_ENV_COEFFICIENTS,
  // Back-compat alias (pre-B8 callers): the DOCUMENTED DEFAULT weights, not the active config.
  MODE_WEIGHTS: DEFAULT_MODE_WEIGHTS
}
