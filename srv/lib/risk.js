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

function deriveRisk (b) {
  b = b || {}
  const override = b.riskOverride === true
  const consequence = (override && b.riskConsequence)
    ? b.riskConsequence
    : clampRisk((b.importanceLevel || 2) + (b.highPriorityAsset ? 1 : 0), 1, 5)
  const condLk = b.conditionRating != null ? clampRisk(Math.ceil((11 - b.conditionRating) / 2), 1, 5) : 3
  const strLk  = b.structuralAdequacyRating != null ? clampRisk(Math.ceil((11 - b.structuralAdequacyRating) / 2), 1, 5) : condLk
  const likelihood = (override && b.riskLikelihood) ? b.riskLikelihood : Math.max(condLk, strLk)
  const score = consequence * likelihood * 4 // 4..100
  const band = RISK_BANDS.find(x => score >= x.min) || RISK_BANDS[RISK_BANDS.length - 1]
  return { consequence, likelihood, score, priority: band.name }
}

module.exports = { deriveRisk, clampRisk, RISK_BANDS }
