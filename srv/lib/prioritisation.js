'use strict'

// Bridge Prioritisation engine (approved design — docs/prioritisation/).
// Pure + config-driven (rule 4). Mirrors the approved wireframe math EXACTLY:
//   criticality = Σ(dimension × weight)        weights normalised to sum 1
//   tier        = round(criticality) clamped 1..5         (half-up)
//   residual    = likelihood × tier            [restriction is a FLAG, never in the score]
//   riskN       = residual / maxResidual × 100
//   critN       = criticality / maxCriticality × 100
//   stratN      = strategy urgency (0..100)
//   priorityScore = wRisk·riskN + wCrit·critN + wStrat·stratN   (priority weights normalised)
//   band        = 5-entry ladder lookup (P1..P5), 0-floor, guarded
// Every output is reproducible from (inputs + the stamped param snapshot + formulaVersion).

const { validateRiskBands } = require('./risk')

const FORMULA_VERSION = 'v1-normalised'

// Defaults mirror the wireframe; the engine NEVER hardcodes in the math — these are only the
// fallback when a config value is missing/non-finite, and are documented.
const DEFAULT_CONFIG = Object.freeze({
  version: 'default',
  wSafety: 0.35, wNetwork: 0.25, wFinancial: 0.15, wEnvironmental: 0.10, wReputational: 0.15,
  wRisk: 0.40, wCrit: 0.40, wStrat: 0.20,
  maxResidual: 25, maxCriticality: 5,
  urgencyRenew: 80, urgencyMaintain: 50, urgencyMonitor: 20, urgencyDecommission: 30,
  bandThresholds: [
    { code: 'P1', min: 80 }, { code: 'P2', min: 60 }, { code: 'P3', min: 40 },
    { code: 'P4', min: 20 }, { code: 'P5', min: 0 }
  ],
  formulaVersion: FORMULA_VERSION
})

// Numeric coercion at the boundary: Decimal columns arrive as strings from OData/DB; a stray
// string or non-finite value must fall back to the documented default, never NaN the fleet.
function num (v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function round1 (n) { return Math.round(n * 10) / 10 }

// Normalise a weight vector to sum 1 (robust to admin edits). All-zero/invalid -> equal weights.
function normalise (weights) {
  const vals = weights.map((w) => Math.max(0, num(w, 0)))
  const sum = vals.reduce((s, w) => s + w, 0)
  if (sum <= 0) return weights.map(() => 1 / weights.length)
  return vals.map((w) => w / sum)
}

// Resolve a raw config row (entity row with Decimal-as-string values, or a plain object) into a
// fully-numeric param object the math runs against. Parses the band ladder JSON safely.
function resolveConfig (raw) {
  const c = raw || {}
  const D = DEFAULT_CONFIG
  let ladder = c.bandThresholds
  if (typeof ladder === 'string') { try { ladder = JSON.parse(ladder) } catch (_e) { ladder = null } }
  if (!Array.isArray(ladder) || !ladder.length || !validateRiskBands(ladder).ok) ladder = D.bandThresholds
  return {
    version: c.version || D.version,
    formulaVersion: c.formulaVersion || D.formulaVersion,
    dimWeights: [
      num(c.wSafety, D.wSafety), num(c.wNetwork, D.wNetwork), num(c.wFinancial, D.wFinancial),
      num(c.wEnvironmental, D.wEnvironmental), num(c.wReputational, D.wReputational)
    ],
    priorityWeights: [num(c.wRisk, D.wRisk), num(c.wCrit, D.wCrit), num(c.wStrat, D.wStrat)],
    maxResidual: num(c.maxResidual, D.maxResidual) || D.maxResidual,
    maxCriticality: num(c.maxCriticality, D.maxCriticality) || D.maxCriticality,
    urgency: {
      Renew: num(c.urgencyRenew, D.urgencyRenew), Maintain: num(c.urgencyMaintain, D.urgencyMaintain),
      Monitor: num(c.urgencyMonitor, D.urgencyMonitor), Decommission: num(c.urgencyDecommission, D.urgencyDecommission)
    },
    bandThresholds: ladder,
    rubrics: c.rubrics || null // raw rubrics JSON (string|object|null) — resolved via rubricsFor()
  }
}

function tierOf (criticality) {
  return Math.min(5, Math.max(1, Math.round(num(criticality, 1))))
}

// Guarded band lookup: sort desc by min, first band whose min <= score; fallback to the lowest
// (never returns undefined, even for a score below every threshold).
function bandOf (score, ladder) {
  const list = (ladder || DEFAULT_CONFIG.bandThresholds).slice().sort((a, b) => b.min - a.min)
  const hit = list.find((b) => score >= num(b.min, 0))
  return (hit || list[list.length - 1]).code
}

// Derive a default likelihood from condition (mirrors the BIS risk engine: worse condition =>
// higher likelihood band). Advisory only — the user may override (logged).
function deriveLikelihood (conditionRating, structuralAdequacyRating) {
  // Treat null/undefined/'' as MISSING (Number(null)===0 is finite, so coerce-then-check would
  // wrongly read a missing rating as 0 = worst). Only a real numeric rating contributes.
  const has = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
  const band = (rating) => Math.min(5, Math.max(1, Math.ceil((11 - Number(rating)) / 2)))
  const cl = has(conditionRating) ? band(conditionRating) : null
  const sl = has(structuralAdequacyRating) ? band(structuralAdequacyRating) : null
  if (cl == null && sl == null) return 3 // neutral default when no condition data
  return Math.max(cl == null ? 0 : cl, sl == null ? 0 : sl) || 3
}

// The core computation. inputs: {dimSafety,dimNetwork,dimFinancial,dimEnvironmental,
// dimReputational, likelihood, strategy}. cfg: a RESOLVED config (resolveConfig output).
function derivePriority (inputs, cfg) {
  const c = (cfg && cfg.dimWeights) ? cfg : resolveConfig(cfg)
  const dims = [
    num(inputs.dimSafety, 3), num(inputs.dimNetwork, 3), num(inputs.dimFinancial, 3),
    num(inputs.dimEnvironmental, 3), num(inputs.dimReputational, 3)
  ].map((d) => Math.min(5, Math.max(1, d)))
  const w = normalise(c.dimWeights)
  const criticality = dims.reduce((s, d, i) => s + d * w[i], 0)
  const tier = tierOf(criticality)
  const likelihood = Math.min(5, Math.max(1, num(inputs.likelihood, 3)))
  const residual = likelihood * tier // restriction is NOT a term here — it is a flag only
  const riskN = residual / c.maxResidual * 100
  const critN = criticality / c.maxCriticality * 100
  const stratN = num(c.urgency[inputs.strategy], c.urgency.Maintain)
  const pw = normalise(c.priorityWeights)
  const priorityScore = Math.round(pw[0] * riskN + pw[1] * critN + pw[2] * stratN)
  const band = bandOf(priorityScore, c.bandThresholds)
  return {
    criticality: round1(criticality), tier, likelihood, residual,
    riskN: Math.round(riskN * 1000) / 1000, critN: Math.round(critN * 1000) / 1000,
    stratN: Math.round(stratN * 1000) / 1000, priorityScore, band,
    // contributions for the decomposition bars (rounded for display)
    contribRisk: Math.round(pw[0] * riskN), contribCrit: Math.round(pw[1] * critN), contribStrat: Math.round(pw[2] * stratN),
    formulaVersion: c.formulaVersion
  }
}

// The substituted-formula text for the inspector (live values, not a static formula).
function formulaText (inputs, out, cfg) {
  const c = (cfg && cfg.dimWeights) ? cfg : resolveConfig(cfg)
  const w = normalise(c.dimWeights).map((x) => round1(x * 100) / 100)
  const pw = normalise(c.priorityWeights).map((x) => round1(x * 100) / 100)
  const d = inputs
  return (
    `criticality = ${w[0]}·${d.dimSafety} + ${w[1]}·${d.dimNetwork} + ${w[2]}·${d.dimFinancial} + ${w[3]}·${d.dimEnvironmental} + ${w[4]}·${d.dimReputational} = ${out.criticality}  → tier ${out.tier}\n` +
    `residual risk = L(${out.likelihood}) × consequence(${out.tier}) = ${out.residual}   [restriction is a flag, not in the score]\n` +
    `priority = ${pw[0]}·riskN + ${pw[1]}·critN + ${pw[2]}·stratN = ${pw[0]}·${Math.round(out.riskN)} + ${pw[1]}·${Math.round(out.critN)} + ${pw[2]}·${Math.round(out.stratN)} = ${out.priorityScore}  → ${out.band}`
  )
}

// Rubric anchors per criticality dimension per 1-5 level (single source of truth; the UI mirrors
// these, and PrioritisationConfig.rubrics overrides per version). Used to FREEZE the scoring
// guidance wording into each run so a reproduced past run shows what "Safety = 4" meant then.
const DEFAULT_RUBRICS = Object.freeze({
  dimSafety: { 1: 'Negligible safety consequence', 2: 'Minor injury possible', 3: 'Serious injury credible', 4: 'Single fatality credible', 5: 'Multiple fatalities credible' },
  dimNetwork: { 1: 'No network disruption', 2: 'Local detour, minutes', 3: 'Sub-network impact, hours', 4: 'Key corridor severed, days', 5: 'Strategic corridor lost, weeks+' },
  dimFinancial: { 1: 'Trivial cost', 2: 'Minor repair budget', 3: 'Material capital cost', 4: 'Major capital + indirect cost', 5: 'Severe whole-of-life / liability cost' },
  dimEnvironmental: { 1: 'No environmental effect', 2: 'Contained, reversible', 3: 'Local, remediable', 4: 'Significant, prolonged', 5: 'Severe / protected-area harm' },
  dimReputational: { 1: 'No public interest', 2: 'Local complaint', 3: 'Regional media', 4: 'State media / ministerial', 5: 'National / inquiry-level' }
})

// Resolve the active rubric map (config.rubrics JSON overrides the defaults).
function rubricsFor (raw) {
  let r
  try { r = typeof raw === 'string' ? JSON.parse(raw) : raw } catch (_e) { r = null }
  if (!r || typeof r !== 'object') return DEFAULT_RUBRICS
  const out = {}
  for (const k of Object.keys(DEFAULT_RUBRICS)) out[k] = (r[k] && typeof r[k] === 'object') ? r[k] : DEFAULT_RUBRICS[k]
  return out
}

// Freeze the chosen-level rubric wording for one assessment's dimensions.
function rubricSnapshot (dims, raw) {
  const r = rubricsFor(raw)
  const lvl = (k) => Math.min(5, Math.max(1, Math.round(num(dims[k], 3))))
  const out = {}
  for (const k of Object.keys(DEFAULT_RUBRICS)) { const L = lvl(k); out[k] = { level: L, text: r[k][L] || r[k][String(L)] || '' } }
  return out
}

module.exports = {
  derivePriority, resolveConfig, tierOf, bandOf, normalise, deriveLikelihood, formulaText, num,
  rubricsFor, rubricSnapshot, DEFAULT_RUBRICS, DEFAULT_CONFIG, FORMULA_VERSION
}
