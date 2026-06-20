'use strict'

// ─────────────────────────────────────────────────────────────────────────────
// Deterioration / Remaining-Service-Life models (DET-2/DET-3)
//
// Forecasts future condition and the years-to-intervention (RUL) for a structure
// under three transparent models, selected per AssetClassStrategy.deteriorationModel:
//
//   Linear  — condition loses `degradationRatePerYear` legacy points/year (the existing
//             RISK-2 proxy). RUL = (rating − interventionThreshold) / rate.
//   Markov  — annual state-transition probabilities (transitionMatrix JSON) on the 1-10
//             legacy scale; forecast = expected state after N one-year steps; RUL = first
//             year the expected condition reaches the intervention threshold.
//   Weibull — survival model with shape β and characteristic life η (years); condition
//             tracks the survival curve from current age; RUL = age at threshold − current.
//
// Pure functions, no I/O. All parameters are passed in (config-driven, zero hardcoding).
// Scale: legacy 1-10 where 10 = best, 1 = worst (matches condition-rating.js).
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ── Linear ─────────────────────────────────────────────────────────────────
function linearForecast (rating, ratePerYear, years) {
  const r = num(rating), rate = num(ratePerYear) ?? 0
  if (r === null) return null
  return clamp(r - rate * Math.max(0, years), 1, 10)
}
function linearRul (rating, ratePerYear, threshold) {
  const r = num(rating), rate = num(ratePerYear), t = num(threshold) ?? 1
  if (r === null || !rate || rate <= 0) return null
  if (r <= t) return 0
  return round((r - t) / rate)
}

// ── Markov ───────────────────────────────────────────────────────────────────
// matrix: { "10": {"10":0.97,"9":0.03}, "9": {...}, ... } — rows sum ~1.
function parseMatrix (raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch (_e) { return null }
}
// Expected condition after `years` one-year steps from an integer starting state.
function markovForecast (rating, matrixRaw, years) {
  const m = parseMatrix(matrixRaw)
  const start = num(rating)
  if (!m || start === null) return null
  // distribution vector over states 1..10
  let dist = {}
  dist[Math.round(clamp(start, 1, 10))] = 1
  for (let y = 0; y < Math.max(0, Math.round(years)); y++) {
    const next = {}
    for (const [state, p] of Object.entries(dist)) {
      const row = m[state] || { [state]: 1 } // absorbing if no row
      for (const [to, prob] of Object.entries(row)) {
        next[to] = (next[to] || 0) + p * Number(prob)
      }
    }
    dist = next
  }
  // expected value
  let ev = 0, tot = 0
  for (const [state, p] of Object.entries(dist)) { ev += Number(state) * p; tot += p }
  return tot > 0 ? clamp(ev / tot, 1, 10) : null
}
function markovRul (rating, matrixRaw, threshold, horizon = 100) {
  const t = num(threshold) ?? 1
  for (let y = 0; y <= horizon; y++) {
    const c = markovForecast(rating, matrixRaw, y)
    if (c === null) return null
    if (c <= t) return y
  }
  return horizon // did not reach threshold within the horizon
}

// ── Weibull ────────────────────────────────────────────────────────────────
// Condition tracked against the survival function S(t)=exp(-(t/eta)^beta), mapped
// from the best rating (10) down to worst (1). currentAge anchors where on the curve.
function weibullSurvival (ageYears, beta, eta) {
  const a = num(ageYears), b = num(beta), e = num(eta)
  if (a === null || !b || !e || e <= 0) return null
  return Math.exp(-Math.pow(Math.max(0, a) / e, b))
}
function weibullForecast (currentAge, beta, eta, years, bestRating = 10, worstRating = 1) {
  const s = weibullSurvival((num(currentAge) || 0) + Math.max(0, years), beta, eta)
  if (s === null) return null
  return clamp(worstRating + s * (bestRating - worstRating), 1, 10)
}
function weibullRul (currentAge, beta, eta, threshold, horizon = 120) {
  const t = num(threshold) ?? 1
  for (let y = 0; y <= horizon; y++) {
    const c = weibullForecast(currentAge, beta, eta, y)
    if (c === null) return null
    if (c <= t) return y
  }
  return horizon
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
// strategy: { deteriorationModel, degradationRatePerYear, interventionThreshold,
//             transitionMatrix, weibullShape, weibullScaleYears }
// ctx: { conditionRating, ageYears }
function forecast ({ strategy = {}, ctx = {}, years = 0 } = {}) {
  const model = String(strategy.deteriorationModel || 'Linear')
  if (model === 'Markov') return markovForecast(ctx.conditionRating, strategy.transitionMatrix, years)
  if (model === 'Weibull') return weibullForecast(ctx.ageYears, strategy.weibullShape, strategy.weibullScaleYears, years)
  return linearForecast(ctx.conditionRating, strategy.degradationRatePerYear, years)
}
function remainingServiceLife ({ strategy = {}, ctx = {} } = {}) {
  const model = String(strategy.deteriorationModel || 'Linear')
  const t = strategy.interventionThreshold
  if (model === 'Markov') return markovRul(ctx.conditionRating, strategy.transitionMatrix, t)
  if (model === 'Weibull') return weibullRul(ctx.ageYears, strategy.weibullShape, strategy.weibullScaleYears, t)
  return linearRul(ctx.conditionRating, strategy.degradationRatePerYear, t)
}

function round (n) { return Math.round(Number(n) * 10) / 10 }

module.exports = {
  forecast, remainingServiceLife,
  linearForecast, linearRul, markovForecast, markovRul, weibullForecast, weibullRul, weibullSurvival
}
