'use strict'

// Risk prioritisation engine (Phase 2/4).
// Consequence (importance + high-priority) x Likelihood (condition / structural)
// -> 0-100 score -> band. Engineer override keeps manually-set consequence/likelihood.
// Bands match the RiskBand seed thresholds.

// Default bands mirror the RiskBand seed thresholds, so scoring is unchanged when no
// config is supplied. The RiskBand TABLE is the source of truth (rule 4: config-driven);
// admin edits flow in via bandsFromConfig(). This array is only the fallback.
const RISK_BANDS = [
  { name: 'Very High', min: 60 },
  { name: 'High',      min: 36 },
  { name: 'Medium',    min: 16 },
  { name: 'Low',       min: 0 }
]

// Build the band ladder from RiskBand rows ({code/name, minScore, maxScore, active,
// sortOrder}). Returns bands sorted DESCENDING by min (deriveRisk does find(score>=min)).
// Returns null if the configured set is empty or invalid, so the caller falls back to the
// hardcoded default rather than scoring against a broken ladder (rule: never corrupt fleet
// scoring from bad config).
function bandsFromConfig (rows) {
  const bands = []
  for (const r of rows || []) {
    if (!r || r.active === false) continue
    if (r.minScore === null || r.minScore === undefined || r.minScore === '') continue
    const min = Number(r.minScore)
    if (!Number.isFinite(min)) continue
    bands.push({ name: r.name || r.code, min, max: Number(r.maxScore), code: r.code })
  }
  if (!bands.length) return null
  bands.sort((a, b) => b.min - a.min)
  return validateRiskBands(bands).ok ? bands : null
}

// Validate a band ladder: at least one band, a band starting at 0 (covers the bottom),
// and strictly-decreasing mins (no two bands share a threshold / no gap-by-duplicate).
// Returns { ok, errors[] }. Used by config UIs + importers AND by bandsFromConfig.
function validateRiskBands (bands) {
  const errors = []
  // Accept both the internal shape ({min,max}) and raw RiskBand rows ({minScore,maxScore}),
  // so config UIs and importers can validate before writing.
  const list = (bands || []).map(b => ({
    name: b.name || b.code,
    min: b.min != null ? b.min : b.minScore,
    max: b.max != null ? b.max : b.maxScore
  })).sort((a, b) => b.min - a.min)
  if (!list.length) { return { ok: false, errors: ['At least one risk band is required.'] } }
  for (const b of list) {
    if (!Number.isFinite(Number(b.min))) errors.push(`Band "${b.name}" has a non-numeric minScore.`)
    if (Number.isFinite(Number(b.max)) && Number(b.max) < Number(b.min)) errors.push(`Band "${b.name}": maxScore < minScore.`)
  }
  for (let i = 1; i < list.length; i++) {
    if (Number(list[i].min) === Number(list[i - 1].min)) errors.push(`Bands "${list[i - 1].name}" and "${list[i].name}" share the same minScore (${list[i].min}).`)
  }
  if (Number(list[list.length - 1].min) !== 0) errors.push('The lowest band must start at minScore 0 to cover the full score range.')
  return { ok: errors.length === 0, errors }
}

// Validate RiskConfig weight rows: weights must be finite and within [0, max]. A negative
// or wildly large weight silently distorts a scoring factor fleet-wide. Returns {ok,errors}.
function validateRiskWeights (rows, maxWeight) {
  const cap = Number.isFinite(Number(maxWeight)) ? Number(maxWeight) : 10
  const errors = []
  for (const r of rows || []) {
    if (!r || r.active === false || r.factor == null) continue
    if (r.weight === null || r.weight === undefined || r.weight === '') continue
    const n = Number(r.weight)
    if (!Number.isFinite(n)) { errors.push(`Factor "${r.factor}": weight is not a number.`); continue }
    if (n < 0) errors.push(`Factor "${r.factor}": weight must not be negative (${n}).`)
    if (n > cap) errors.push(`Factor "${r.factor}": weight ${n} exceeds the maximum of ${cap}.`)
  }
  return { ok: errors.length === 0, errors }
}

// NaN-safe clamp: a non-finite input collapses to the lower bound, so a stray NaN
// anywhere in the pipeline can never propagate into the score (RISK P0-001 hardening).
const clampRisk = (n, lo, hi) => { const x = Number(n); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : lo }

// Default weights mirror the RiskConfig seed, so scoring is unchanged when no
// config is supplied. Admin overrides these from the RiskConfig table (rule 4:
// config-driven, zero hardcoding).
const DEFAULT_WEIGHTS = {
  consequence_importance: 1,
  consequence_priority: 1,
  consequence_traffic: 0.5,
  likelihood_condition: 1,
  likelihood_structural: 1
}

function deriveRisk (b, weights, bands) {
  b = b || {}
  const w = Object.assign({}, DEFAULT_WEIGHTS, weights || {})
  // Band ladder: configured RiskBand rows (source of truth) or the hardcoded fallback.
  const ladder = (Array.isArray(bands) && bands.length) ? bands : RISK_BANDS
  // RISK P0-001: defense-in-depth — a non-finite weight (e.g. a malformed RiskConfig
  // row reaching deriveRisk directly, bypassing weightsFromConfig's guard) must never
  // propagate NaN into the score. Fall back to the documented default per factor; the
  // mode_* factors default to 0 ("absent => no change", per the comment below).
  for (const k of Object.keys(w)) {
    if (!Number.isFinite(Number(w[k]))) w[k] = Object.prototype.hasOwnProperty.call(DEFAULT_WEIGHTS, k) ? DEFAULT_WEIGHTS[k] : 0
  }
  const override = b.riskOverride === true

  // Consequence: importance + high-priority + heavy-traffic + transport-mode
  // criticality, each weighted. The mode bump (e.g. a rail/light-rail corridor carries
  // higher network consequence than an equivalent local road) is config-driven via a
  // RiskConfig factor keyed `mode_<TransportMode>`; absent config => 0 (no change).
  const importanceComp = (b.importanceLevel || 2) * w.consequence_importance
  const priorityComp = (b.highPriorityAsset ? 1 : 0) * w.consequence_priority
  // P2-002: heavy-traffic consequence bump applies STRICTLY above 10,000 AADT (documented
  // boundary in docs/risk-model/METHODOLOGY.md § Consequence).
  const heavyTraffic = Number(b.averageDailyTraffic) > 10000 ? 1 : 0
  const trafficComp = heavyTraffic * w.consequence_traffic
  const modeComp = Number(w['mode_' + (b.transportMode || 'Road')] || 0)
  // Override values are clamped/coerced too (a non-numeric manual override can't leak NaN).
  const consequence = (override && b.riskConsequence)
    ? clampRisk(b.riskConsequence, 1, 5)
    : clampRisk(Math.round(importanceComp + priorityComp + trafficComp + modeComp), 1, 5)

  // Likelihood: worse of condition / structural ratings, each weighted. P3-002: a missing
  // rating defaults to band 3 (Medium) — deliberately neutral, to avoid over- or
  // under-weighting incomplete data (documented in METHODOLOGY.md).
  const condLk = b.conditionRating != null ? clampRisk(Math.ceil((11 - b.conditionRating) / 2), 1, 5) : 3
  const strLk  = b.structuralAdequacyRating != null ? clampRisk(Math.ceil((11 - b.structuralAdequacyRating) / 2), 1, 5) : condLk
  // P1-001: clamp each weighted likelihood component to [1,5] BEFORE the max, so an
  // out-of-range weight can't push a single component arbitrarily high pre-clamp. The
  // worse (higher) of condition/structural still drives likelihood.
  const likelihood = (override && b.riskLikelihood)
    ? clampRisk(b.riskLikelihood, 1, 5)
    : clampRisk(Math.round(Math.max(
        clampRisk(condLk * w.likelihood_condition, 1, 5),
        clampRisk(strLk * w.likelihood_structural, 1, 5)
      )), 1, 5)

  const score = consequence * likelihood * 4 // 4..100
  const band = ladder.find(x => score >= x.min) || ladder[ladder.length - 1]
  return { consequence, likelihood, score, priority: band.name }
}

// RISK-4: monetised exposure. A TRANSPARENT linear proxy maps the 1-5 likelihood to an
// annual failure-probability — this is a planning heuristic, NOT an actuarial model
// (documented + assumption-flagged in docs/risk-model/METHODOLOGY.md).
const LIKELIHOOD_TO_ANNUAL_PROB = { 1: 0.01, 2: 0.03, 3: 0.08, 4: 0.18, 5: 0.35 }
// RISK-T2: the probability proxy is config-governable — pass a probMap (e.g. from
// RiskConfig factors prob_1..prob_5); falls back to the documented default.
function expectedValueAud (likelihood, likelyFailureCostAud, probMap) {
  const cost = Number(likelyFailureCostAud)
  if (!Number.isFinite(cost) || cost <= 0) return null
  // P2-001: an out-of-range likelihood is a data error, NOT a zero-probability event.
  // Return null ("insufficient/invalid data") rather than silently masking it as EV 0.
  const lk = Number(likelihood)
  if (!(Number.isFinite(lk) && lk >= 1 && lk <= 5)) return null
  const p = (probMap && probMap[lk] != null) ? Number(probMap[lk]) : (LIKELIHOOD_TO_ANNUAL_PROB[lk] || 0)
  return Math.round(p * cost * 100) / 100
}

// RISK-T4: benefit-cost (ROI) of mitigation. benefit = expected value avoided
// (= EV x riskReduction%); ratio = benefit / mitigation cost. > 1 => the spend pays
// for itself in annualised expected-loss terms. Decision-support; assumption-flagged.
function benefitCostRatio (expectedValue, mitigationCostAud, riskReductionPct) {
  if (expectedValue == null || mitigationCostAud == null) return null
  const ev = Number(expectedValue), cost = Number(mitigationCostAud)
  const red = Number(riskReductionPct)
  if (!Number.isFinite(ev) || !Number.isFinite(cost) || cost <= 0) return null
  const reduction = Number.isFinite(red) ? Math.max(0, Math.min(100, red)) / 100 : 1
  return Math.round((ev * reduction / cost) * 100) / 100
}

// Build a probability map {1..5} from RiskConfig factors prob_1..prob_5 (active rows).
function probMapFromConfig (weights) {
  const m = {}
  for (let i = 1; i <= 5; i++) { const v = weights && weights['prob_' + i]; if (v != null && Number.isFinite(Number(v))) m[i] = Number(v) }
  return Object.keys(m).length ? m : null
}

// RISK-2: advisory remaining-useful-life. Legacy condition 1-10 (10=best); years until
// the asset degrades to worst (1) at the assumed rate (points/year). Assumption-based —
// surfaced for planning, deliberately NOT folded into the core score (no false precision).
function estimatedRulYears (conditionRating, degradationRatePerYear) {
  const c = Number(conditionRating), r = Number(degradationRatePerYear)
  if (!Number.isFinite(c) || !Number.isFinite(r) || r <= 0) return null
  const years = (c - 1) / r
  return years > 0 ? Math.round(years * 10) / 10 : 0
}

// Build a weights map from RiskConfig rows ({factor, weight, active}).
// RISK P0-001: skip non-finite weights at the source. A non-numeric `weight` would
// otherwise yield Number(weight) === NaN, which propagates through deriveRisk's
// arithmetic and emits a NaN risk score on EVERY bridge. Skipped factors fall back to
// DEFAULT_WEIGHTS via the Object.assign in deriveRisk, so scoring stays well-defined.
function weightsFromConfig (rows) {
  const w = {}
  for (const r of rows || []) {
    if (r && r.active !== false && r.factor != null) {
      // Treat blank (null/undefined/'') as "not configured" — fall back to the default
      // weight rather than coercing to 0 (Number('') === 0 would silently disable a factor).
      if (r.weight === null || r.weight === undefined || r.weight === '') continue
      const n = Number(r.weight)
      if (Number.isFinite(n)) w[r.factor] = n
    }
  }
  return w
}

module.exports = { deriveRisk, clampRisk, weightsFromConfig, bandsFromConfig, validateRiskBands, validateRiskWeights, expectedValueAud, estimatedRulYears, benefitCostRatio, probMapFromConfig, RISK_BANDS, DEFAULT_WEIGHTS, LIKELIHOOD_TO_ANNUAL_PROB }
