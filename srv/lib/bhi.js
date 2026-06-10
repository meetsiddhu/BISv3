'use strict'
// BSI/BHI engine (from the approved NSW BSI/BHI calculator mockup — docs/prioritisation/
// nsw_bridge_bsi_bhi_calculator_1.html). Pure functions; element weights are PER TRANSPORT MODE
// (config-style constants mirroring the calculator's four models; overridable later via config).
//   BSI_raw = Σ(elementRating × weight)/Σ(weight)        (ratings on the legacy 0-10 scale)
//   BSI     = clamp 0..10 ( BSI_raw × ageFactor − envPenalty )
//   BHI     = clamp 0..100 ( BSI×10 × (1−vulnerability) × importFactor )
//   RSL     = (BSI/10) × (100−age) × 0.6
const MODE_WEIGHTS = {
  Road: { deck: 0.25, superstructure: 0.30, substructure: 0.20, bearings: 0.10, drainage: 0.08, approach: 0.07 },
  RoadOverWater: { deck: 0.22, superstructure: 0.28, substructure: 0.22, bearings: 0.10, drainage: 0.08, approach: 0.05, scour: 0.05 },
  Rail: { deck: 0.20, superstructure: 0.35, substructure: 0.25, bearings: 0.12, drainage: 0.05, approach: 0.03 },
  Pedestrian: { deck: 0.30, superstructure: 0.30, substructure: 0.25, bearings: 0.08, drainage: 0.07 }
}
const BUCKETS = [[/deck|slab|surface/i, 'deck'], [/gird|beam|super|truss|arch|span/i, 'superstructure'],
  [/pier|abut|found|sub|column|headstock/i, 'substructure'], [/bear/i, 'bearings'],
  [/drain|scupper/i, 'drainage'], [/approach|embank/i, 'approach'], [/scour|water|channel/i, 'scour']]
const bucketOf = (t) => { for (const [re, b] of BUCKETS) { if (re.test(String(t || ''))) return b } return 'superstructure' }
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function weightsFor (mode, overWater) {
  if (/rail|lightrail/i.test(mode || '')) return MODE_WEIGHTS.Rail
  if (/ped|active|shared/i.test(mode || '')) return MODE_WEIGHTS.Pedestrian
  return overWater ? MODE_WEIGHTS.RoadOverWater : MODE_WEIGHTS.Road
}
// elements: BridgeElements rows (elementType + conditionRating 1-10). env: {age, floodExp 1-5,
// corrZone 1-4, seismic 0-3, importClass 1-4, overWater}. Missing element buckets are EXCLUDED
// from Σweight (never silently zeroed); fallback rating = bridge conditionRating when no elements.
function computeBSI (elements, mode, env) {
  const w = weightsFor(mode, env && env.overWater)
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
  const ageFactor = Math.max(0, 1 - (age / 120) * 0.3)
  const envPenalty = (num(env && env.floodExp, 1) - 1) * 0.04 + (num(env && env.corrZone, 1) - 1) * 0.03 + num(env && env.seismic, 0) * 0.02
  const bsi = clamp((n / d) * ageFactor - envPenalty, 0, 10)
  return { bsi: Math.round(bsi * 100) / 100, coverage: Math.round(d / Object.values(w).reduce((a, b) => a + b, 0) * 100), ageFactor: Math.round(ageFactor * 1000) / 1000, envPenalty: Math.round(envPenalty * 1000) / 1000 }
}
function computeBHI (bsi, env) {
  if (bsi === null || bsi === undefined) return null
  const age = Math.max(0, num(env && env.age, 0))
  const envPenalty = (num(env && env.floodExp, 1) - 1) * 0.04 + (num(env && env.corrZone, 1) - 1) * 0.03 + num(env && env.seismic, 0) * 0.02
  const vulnerability = Math.min(0.4, (age / 100) * 0.2 + envPenalty)
  const importFactor = 0.85 + (num(env && env.importClass, 1) - 1) * 0.03
  return Math.round(clamp(bsi * 10 * (1 - vulnerability) * importFactor, 0, 100) * 10) / 10
}
const remainingServiceLife = (bsi, age) => bsi === null ? null : Math.max(0, Math.round((bsi / 10) * (100 - Math.max(0, num(age, 0))) * 0.6))
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
module.exports = { computeBSI, computeBHI, remainingServiceLife, bsiPriority, envFromBridge, weightsFor, bucketOf, MODE_WEIGHTS }
