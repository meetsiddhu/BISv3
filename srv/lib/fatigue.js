'use strict'

// AS 5100.6 fatigue SCREENING (council fix #3, FATIGUE-1).
//
// ADVISORY ONLY. This prompts a detailed AS 5100.6 fatigue assessment — it is NOT a
// certified fatigue rating. Fatigue is a leading failure mode for steel / composite
// structures under cyclic loading, and it is far more demanding on RAIL structures (high
// stress-cycle counts at high stress range) than on most road bridges. The register
// previously had no fatigue signal at all; this gives a transparent, config-driven screen
// that flags which structures warrant a real fatigue assessment.
//
// Pure + config-driven (no I/O). Defaults are representative published-practice values that
// an engineer calibrates per network via SystemConfig key 'fatigueScreening'. The maths is
// deliberately transparent (consumed-life fraction), not a black box — every input is named.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }

// Materials for which fatigue is a screening concern (cyclic-load-sensitive). Concrete /
// timber / masonry fatigue rarely governs at screening level for these structure types, so
// they screen as Not Applicable (a detailed assessment can still be recorded explicitly).
const FATIGUE_SENSITIVE = ['steel', 'composite', 'wrought iron', 'cast iron']

const DEFAULT_FATIGUE_CONFIG = Object.freeze({
  designLifeYears: 100,           // AS 5100.6 nominal design fatigue life
  // relative cyclic-demand factor by transport mode (rail >> road >> light/pedestrian).
  // Higher = faster fatigue accumulation for the same age + detail.
  modeDemand: Object.freeze({ Rail: 1.0, LightRail: 0.7, Multi: 1.0, Road: 0.5, Marine: 0.3, Active: 0.15, Pedestrian: 0.1 }),
  // AS 5100.6 detail-category factor: a lower (poorer) detail category accumulates fatigue
  // damage faster for the same stress history. Category 71 is taken as the 1.0 reference.
  detailCategoryFactor: Object.freeze({ '36': 1.6, '40': 1.5, '50': 1.3, '71': 1.0, '90': 0.85, '125': 0.7 }),
  // status thresholds on the consumed-life fraction (0..>1).
  elevatedAt: 0.6, highAt: 0.85
})

function isFatigueSensitive (material) {
  const m = String(material || '').toLowerCase()
  return FATIGUE_SENSITIVE.some(s => m.includes(s))
}

// Screen one bridge -> { status, estimatedFatigueLifeYears, detailCategory, note }.
// status: Not Applicable (non-fatigue material) | Not Assessed (insufficient data) |
//         Low | Elevated | High (consumed-life screen). currentYear is injected so the
// result is deterministic/testable; falls back to the system year.
function screenFatigue (bridge, cfg, currentYear) {
  const C = Object.assign({}, DEFAULT_FATIGUE_CONFIG, cfg || {})
  const b = bridge || {}
  const material = b.superstructureMaterial || b.material
  if (!isFatigueSensitive(material)) {
    return { status: 'Not Applicable', estimatedFatigueLifeYears: null, detailCategory: null, note: 'Fatigue screening applies to steel / composite structures.' }
  }
  const yearBuilt = num(b.yearBuilt)
  const yr = num(currentYear) || new Date().getFullYear()
  if (!yearBuilt) {
    return { status: 'Not Assessed', estimatedFatigueLifeYears: null, detailCategory: b.fatigueDetailCategory || null, note: 'Year built unknown — record it (and the AS 5100.6 detail category) to screen fatigue.' }
  }
  const age = Math.max(0, yr - yearBuilt)
  const mode = b.transportMode || 'Road'
  const demand = num(C.modeDemand[mode]) ?? 0.5
  const detailCategory = b.fatigueDetailCategory || null
  const detailFactor = (detailCategory && num(C.detailCategoryFactor[detailCategory])) || 1.0
  // Effective fatigue life shrinks with cyclic demand + poorer detailing.
  const effectiveLife = C.designLifeYears / (demand * detailFactor || 1)
  const consumed = effectiveLife > 0 ? age / effectiveLife : 1
  const remaining = Math.round(Math.max(0, effectiveLife - age) * 10) / 10
  let status = 'Low'
  if (consumed >= C.highAt) status = 'High'
  else if (consumed >= C.elevatedAt) status = 'Elevated'
  const note = `${Math.round(consumed * 100)}% of advisory fatigue life consumed (${mode} demand, ` +
    `detail ${detailCategory || 'unspecified'}). Advisory screen — confirm with a detailed AS 5100.6 assessment.`
  return { status, estimatedFatigueLifeYears: remaining, detailCategory, note }
}

module.exports = {
  DEFAULT_FATIGUE_CONFIG, FATIGUE_SENSITIVE, isFatigueSensitive, screenFatigue
}
