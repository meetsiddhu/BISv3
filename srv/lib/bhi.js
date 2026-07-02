'use strict'
// BSI/BHI engine — element-weighted structure/health index per published bridge
// health index practice (element condition x importance weights, cf. AASHTO
// element-level condition states and DOT bridge-health-index implementations).
// Pure functions.
//   BSI_raw = Σ(elementRating × weight)/Σ(weight)        (ratings on the legacy 0-10 scale)
//   BSI     = clamp 0..10 ( BSI_raw × ageFactor − envPenalty )
//   BHI     = clamp 0..100 ( BSI×10 × (1−vulnerability) × importFactor )
//   RSL     = (BSI/10) × (100−age) × rslUtilisation
//
// CONFIG (council B8 — zero hardcoding): the per-mode element weights AND every environmental
// coefficient are governed via the SystemConfig row 'bhiWeights' (JSON, partial overrides merge
// over the defaults below). The constants below are REPRESENTATIVE DEFAULTS aligned to
// published practice — regression tests pin them byte-identically so they cannot drift
// silently; every portfolio is expected to calibrate them via 'bhiWeights'.
// Callers refresh via configure(await getConfig('bhiWeights')); the pure compute functions also
// accept an explicit cfg argument.
//
// CALIBRATION HONESTY (council B8): the default weight sets encode ROAD load-rating
// practice (NHVR-aligned). Until rail/pedestrian weight sets are sourced and
// calibrated, the non-road modes are labelled 'road-derived weights (calibrate)' (see
// `calibrated` below + the bhiDetail action) instead of presenting them as rail/ped methodology.
const DEFAULT_MODE_WEIGHTS = Object.freeze({
  Road: Object.freeze({ deck: 0.25, superstructure: 0.30, substructure: 0.20, bearings: 0.10, drainage: 0.08, approach: 0.07 }),
  RoadOverWater: Object.freeze({ deck: 0.22, superstructure: 0.28, substructure: 0.22, bearings: 0.10, drainage: 0.08, approach: 0.05, scour: 0.05 }),
  Rail: Object.freeze({ deck: 0.20, superstructure: 0.35, substructure: 0.25, bearings: 0.12, drainage: 0.05, approach: 0.03 }),
  Pedestrian: Object.freeze({ deck: 0.30, superstructure: 0.30, substructure: 0.25, bearings: 0.08, drainage: 0.07 })
})
// Environmental / age / importance coefficients (representative defaults, all overridable):
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
  // PER-ASSET-CLASS element-weight OVERRIDES (additive; default = none → every class uses the
  // per-mode default, so legacy behaviour is unchanged). Shape:
  //   { '<AssetClass>': { '<ModeKey>': { deck, superstructure, substructure, ... } } }
  // Resolved with precedence (assetClass+mode → mode → Road) in weightsFor(). This is the
  // hook that lets BHI/BSI be calibrated differently per asset class (e.g. a Culvert weights
  // substructure/scour higher than a Beam Bridge) without forking the engine.
  classModeWeights: Object.freeze({}),
  // Modes whose weight sets are within the road-calibrated scope. Rail/Pedestrian stay out
  // until a defensible weight set is sourced — bhiDetail labels them 'road-derived weights (calibrate)'.
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
  // PER-ASSET-CLASS overrides (additive): each class's per-mode bucket weights merge OVER the
  // resolved per-mode default for that mode. Same hardening as modeWeights — non-finite/negative
  // values are ignored so a bad class edit can never NaN the fleet, only soften back to default.
  const classModeWeights = {}
  if (o.classModeWeights && typeof o.classModeWeights === 'object') {
    for (const [cls, perMode] of Object.entries(o.classModeWeights)) {
      if (!perMode || typeof perMode !== 'object') continue
      const resolved = {}
      for (const [mode, over] of Object.entries(perMode)) {
        if (!over || typeof over !== 'object') continue
        const base = Object.assign({}, modeWeights[mode] || DEFAULT_MODE_WEIGHTS[mode] || {})
        for (const [k, v] of Object.entries(over)) { const n = Number(v); if (Number.isFinite(n) && n >= 0) base[k] = n }
        if (Object.keys(base).length) resolved[mode] = base
      }
      if (Object.keys(resolved).length) classModeWeights[String(cls)] = resolved
    }
  }
  return { modeWeights, env, calibrated, classModeWeights }
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
function weightsFor (mode, overWater, cfg, assetClass) {
  const c = cfg || _active
  const key = modeKeyFor(mode, overWater)
  // PER-ASSET-CLASS precedence (additive): a class+mode override wins, else the per-mode default,
  // else Road. assetClass omitted → identical to the legacy per-mode behaviour (back-compat).
  const cmw = (c && c.classModeWeights) || {}
  if (assetClass && cmw[assetClass] && cmw[assetClass][key]) return cmw[assetClass][key]
  return c.modeWeights[key] || c.modeWeights.Road
}
const envPenaltyOf = (env, E) =>
  (num(env && env.floodExp, 1) - 1) * E.floodStep + (num(env && env.corrZone, 1) - 1) * E.corrStep + num(env && env.seismic, 0) * E.seismicStep
// AS 5100.7 / AASHTO-NBE condition-state EXTENT: when an element carries a (near-)complete
// CS1..CS4 quantity distribution, derive its 1-10 rating from HOW MUCH is in each state — so a
// deck 90% in CS4 scores far worse than one 5% in CS4. CS1=good(10) .. CS4=severe(1). When the
// distribution is absent/incomplete (sum well below totalQuantity), fall back to the single
// inspector conditionRating, keeping legacy records unchanged. (Council fix #2.)
function effectiveRating (e) {
  const cs1 = num(e.conditionState1Qty, 0); const cs2 = num(e.conditionState2Qty, 0)
  const cs3 = num(e.conditionState3Qty, 0); const cs4 = num(e.conditionState4Qty, 0)
  const csTotal = cs1 + cs2 + cs3 + cs4
  const total = num(e.totalQuantity, 0)
  if (csTotal > 0 && total > 0 && csTotal >= 0.95 * total) {
    const weightedState = (cs1 + cs2 * 2 + cs3 * 3 + cs4 * 4) / csTotal // 1 (all good) .. 4 (all severe)
    return clamp(10 - (weightedState - 1) * 3, 1, 10) // 1->10, 2->7, 3->4, 4->1
  }
  return num(e.conditionRating, null)
}

// elements: BridgeElements rows (elementType + conditionRating 1-10, optional CS1-4 quantities).
// env: {age, floodExp 1-5, corrZone 1-4, seismic 0-3, importClass 1-4, overWater}. Missing element
// buckets are EXCLUDED from Σweight (never silently zeroed); fallback = bridge conditionRating.
function computeBSI (elements, mode, env, cfg, assetClass) {
  const c = cfg || _active
  const E = c.env
  const w = weightsFor(mode, env && env.overWater, c, assetClass)
  const byBucket = {}
  for (const e of (elements || [])) {
    const b = bucketOf(e.elementType)
    const r = effectiveRating(e)
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
