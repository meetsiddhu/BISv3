'use strict'

// Risk prioritisation engine (Phase 2/4).
// Consequence (importance + high-priority) x Likelihood (condition / structural)
// -> 0-100 score -> band. Engineer override keeps manually-set consequence/likelihood.
// Bands match the RiskBand seed thresholds.

const RISK_BANDS = [
  { name: 'Very High', min: 60 },
  { name: 'High',      min: 36 },
  { name: 'Medium',    min: 16 },
  { name: 'Low',       min: 0 }
]

const clampRisk = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

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

function deriveRisk (b, weights) {
  b = b || {}
  const w = Object.assign({}, DEFAULT_WEIGHTS, weights || {})
  const override = b.riskOverride === true

  // Consequence: importance + high-priority + heavy-traffic + transport-mode
  // criticality, each weighted. The mode bump (e.g. a rail/light-rail corridor carries
  // higher network consequence than an equivalent local road) is config-driven via a
  // RiskConfig factor keyed `mode_<TransportMode>`; absent config => 0 (no change).
  const importanceComp = (b.importanceLevel || 2) * w.consequence_importance
  const priorityComp = (b.highPriorityAsset ? 1 : 0) * w.consequence_priority
  const heavyTraffic = Number(b.averageDailyTraffic) > 10000 ? 1 : 0
  const trafficComp = heavyTraffic * w.consequence_traffic
  const modeComp = Number(w['mode_' + (b.transportMode || 'Road')] || 0)
  const consequence = (override && b.riskConsequence)
    ? b.riskConsequence
    : clampRisk(Math.round(importanceComp + priorityComp + trafficComp + modeComp), 1, 5)

  // Likelihood: worse of condition / structural ratings, each weighted.
  const condLk = b.conditionRating != null ? clampRisk(Math.ceil((11 - b.conditionRating) / 2), 1, 5) : 3
  const strLk  = b.structuralAdequacyRating != null ? clampRisk(Math.ceil((11 - b.structuralAdequacyRating) / 2), 1, 5) : condLk
  const likelihood = (override && b.riskLikelihood)
    ? b.riskLikelihood
    : clampRisk(Math.round(Math.max(condLk * w.likelihood_condition, strLk * w.likelihood_structural)), 1, 5)

  const score = consequence * likelihood * 4 // 4..100
  const band = RISK_BANDS.find(x => score >= x.min) || RISK_BANDS[RISK_BANDS.length - 1]
  return { consequence, likelihood, score, priority: band.name }
}

// Build a weights map from RiskConfig rows ({factor, weight, active}).
function weightsFromConfig (rows) {
  const w = {}
  for (const r of rows || []) {
    if (r && r.active !== false && r.factor != null) w[r.factor] = Number(r.weight)
  }
  return w
}

module.exports = { deriveRisk, clampRisk, weightsFromConfig, RISK_BANDS, DEFAULT_WEIGHTS }
