'use strict'
// ════════════════════════════════════════════════════════════════════════════════════════════
// CONFIGURABLE PRIORITISATION RULE ENGINE (Phase 2) — pure evaluation library.
//
//   resolveModelCriteria → bindRaw → valueFunction → missingDataPolicy → confidence →
//   weighted aggregate → AggregationRules (floors/vetoes/escalations/hurdles) → band → hash
//
// PURE: no I/O. The caller passes a `context` bundle (bridge row + child rows + attribute map +
// manual judgement values). Same model + same context ⇒ identical result incl. weightSetHash —
// the reproducibility contract of the approved design.
//
// BACKWARD COMPATIBILITY (Phase 0 Q1): aggregationMethod 'RiskCritBlend-v1' DELEGATES to the
// approved engine srv/lib/prioritisation.js derivePriority — byte-identical, zero regression.
// Generic models use 'WeightedSum' / 'WeightedSumWithRules'.
//
// Missing data is NEVER a silent zero: each criterion's missingDataPolicy is explicit —
//   flag (exclude + surface) | neutral (definitional midpoint 50 of the 0..100 scale, flagged)
//   | penalise[:score] (conservative worst-case 100 unless configured) | exclude.
// ════════════════════════════════════════════════════════════════════════════════════════════
const crypto = require('crypto')
const base = require('./prioritisation')
const bhiLib = require('./bhi')

const has = (v) => v !== null && v !== undefined && v !== ''
const num = base.num

// ── tiny condition parser for AggregationRule.config.when: ">=4" "<1" "==Scour-critical" ──
function parseCond (cond) {
  if (!has(cond)) return () => false
  const m = String(cond).trim().match(/^(>=|<=|==|!=|>|<)\s*(.+)$/)
  if (!m) return (v) => String(v).toLowerCase() === String(cond).trim().toLowerCase()
  const [, op, rhsRaw] = m
  const rhsNum = Number(rhsRaw)
  const isNum = Number.isFinite(rhsNum)
  return (v) => {
    if (isNum) {
      const lv = Number(v)
      if (!Number.isFinite(lv)) return false
      return op === '>=' ? lv >= rhsNum : op === '<=' ? lv <= rhsNum : op === '>' ? lv > rhsNum
        : op === '<' ? lv < rhsNum : op === '==' ? lv === rhsNum : lv !== rhsNum
    }
    const ls = String(v).toLowerCase(); const rs = rhsRaw.trim().toLowerCase()
    return op === '==' ? ls === rs : op === '!=' ? ls !== rs : false
  }
}

// ── Derived registry: tested code; SELECTION is config (CriterionSourceBinding.sourceRef) ──
const DERIVED = {
  deriveLikelihood: (ctx) => base.deriveLikelihood(ctx.bridge?.conditionRating, ctx.bridge?.structuralAdequacyRating),
  minElementCondition: (ctx) => agg('min', (ctx.elements || []), 'conditionRating'),
  maxOpenDefectSeverity: (ctx) => agg('max', (ctx.defects || []).filter(d => (d.status || 'Open') === 'Open' || d.status === 'InProgress'), 'severity'),
  latestRatingFactor: (ctx) => latest(ctx.capacities || [], 'ratingDate')?.ratingFactor ?? null,
  activeRestrictionCount: (ctx) => (ctx.restrictions || []).filter(r => r.active !== false && (r.restrictionStatus || 'Active') === 'Active').length,
  bsi: (ctx) => bhiLib.computeBSI(ctx.elements, ctx.bridge?.transportMode, bhiLib.envFromBridge(ctx.bridge)).bsi,
  bhi: (ctx) => { const r = bhiLib.computeBSI(ctx.elements, ctx.bridge?.transportMode, bhiLib.envFromBridge(ctx.bridge)); return bhiLib.computeBHI(r.bsi, bhiLib.envFromBridge(ctx.bridge)) },
  conditionTrend: (ctx) => { // condition change per year over inspection history (negative = deteriorating)
    const rows = (ctx.inspections || []).filter(i => has(i.inspectionDate) && has(i.conditionRating))
      .sort((a, b) => String(a.inspectionDate).localeCompare(String(b.inspectionDate)))
    if (rows.length < 2) return null
    const f = rows[0]; const l = rows[rows.length - 1]
    const yrs = (new Date(l.inspectionDate) - new Date(f.inspectionDate)) / (365.25 * 24 * 3600 * 1000)
    return yrs > 0 ? (num(l.conditionRating, 0) - num(f.conditionRating, 0)) / yrs : null
  }
}
function agg (kind, rows, field) {
  const vals = rows.map(r => Number(r[field])).filter(Number.isFinite)
  if (!vals.length) return null
  return kind === 'min' ? Math.min(...vals) : kind === 'max' ? Math.max(...vals) : vals.length
}
function latest (rows, dateField) {
  return rows.filter(r => has(r[dateField])).sort((a, b) => String(b[dateField]).localeCompare(String(a[dateField])))[0] || null
}

// ── bindRaw: resolve a criterion's raw value from the context per its bindings (in order) ──
function bindOne (b, ctx) {
  const t = (b.transform || '').match(/^(min|max|count)\((\w*)\)$/)
  switch (b.sourceType) {
    case 'Manual': return ctx.manual?.[b.sourceRef]
    case 'BridgeField': return ctx.bridge?.[b.sourceRef]
    case 'Attribute': case 'External': return ctx.attributes?.[b.sourceRef]
    case 'Capacity': return latest(ctx.capacities || [], 'ratingDate')?.[b.sourceRef] ?? null
    case 'Element': return agg(t ? t[1] : 'min', ctx.elements || [], t && t[2] ? t[2] : (b.sourceRef || 'conditionRating'))
    case 'Defect': return DERIVED.maxOpenDefectSeverity(ctx)
    case 'Inspection': return latest(ctx.inspections || [], 'inspectionDate')?.[b.sourceRef] ?? null
    case 'Restriction': return b.sourceRef === 'activeCount' ? DERIVED.activeRestrictionCount(ctx)
      : (ctx.restrictions || []).find(r => (r.restrictionStatus || 'Active') === 'Active')?.[b.sourceRef] ?? null
    case 'Derived': return DERIVED[b.sourceRef] ? DERIVED[b.sourceRef](ctx) : null
    default: return null
  }
}
function bindRaw (criterion, ctx) {
  for (const b of (criterion.bindings || [])) {
    const v = bindOne(b, ctx)
    if (has(v)) return { raw: v, source: b.sourceType + ':' + b.sourceRef, unit: b.unit || '' }
  }
  return { raw: null, source: (criterion.bindings || []).map(b => b.sourceType + ':' + b.sourceRef).join('|') || 'unbound', unit: '' }
}

// ── valueFunction: raw → 0..100 via the criterion's bands (numeric ranges XOR discrete) ──
function valueFunction (raw, bands) {
  if (!has(raw) || !(bands || []).length) return null
  const sorted = bands.slice().sort((a, b) => num(a.displayOrder, 0) - num(b.displayOrder, 0))
  const n = Number(raw)
  if (Number.isFinite(n)) {
    const hit = sorted.find(b => (b.lowerBound == null || n >= num(b.lowerBound, -Infinity)) &&
                                 (b.upperBound == null || n <= num(b.upperBound, Infinity)) && !has(b.textValue))
    if (hit) return { score: num(hit.score, null), label: hit.label || '' }
  }
  const s = String(raw).toLowerCase()
  const hit = sorted.find(b => has(b.textValue) && String(b.textValue).toLowerCase() === s)
  return hit ? { score: num(hit.score, null), label: hit.label || '' } : null
}

// ── per-class criterion resolution with wildcard precedence ──
const PRECEDENCE = (ac, tm) => [[ac, tm], [ac, '*'], ['*', tm], ['*', '*']]
function resolveModelCriteria (model, assetClass, transportMode) {
  const out = []
  for (const c of (model.criteria || [])) {
    if (c.active === false) continue
    let wRow = null
    for (const [ac, tm] of PRECEDENCE(assetClass || '*', transportMode || '*')) {
      wRow = (model.classWeights || []).find(w =>
        (w.criterion_ID ? w.criterion_ID === c.ID : (w.criterion && w.criterion.code === c.code)) &&
        (w.assetClass || '*') === ac && (w.transportMode || '*') === tm)
      if (wRow) break
    }
    if (!wRow || wRow.included === false) { if (wRow) continue; else continue } // no row = not in this class's model
    out.push({ criterion: c, weight: num(wRow.weight, 0), missingDataPolicy: wRow.missingDataPolicy || 'flag' })
  }
  return out
}

// ── missing-data policy (NEVER silent zero) ──
function applyMissingPolicy (policy) {
  const p = String(policy || 'flag')
  if (p === 'neutral') return { score: 50, include: true, flag: 'missing→neutral(50)' } // midpoint of the 0..100 scale
  if (p.startsWith('penalise')) { const sc = num(p.split(':')[1], 100); return { score: sc, include: true, flag: 'missing→penalised(' + sc + ')' } }
  if (p === 'exclude') return { score: null, include: false, flag: null }
  return { score: null, include: false, flag: 'missing→flagged' } // 'flag' default
}

// ── confidence: linear decay from 1 → floor at maxAgeMonths (knobs come from the rule CONFIG) ──
function confidenceFor (code, ctx, confRule) {
  if (!confRule) return 1
  let cfgJ; try { cfgJ = JSON.parse(confRule.config || '{}') } catch (_e) { cfgJ = {} }
  const maxAge = num(cfgJ.maxAgeMonths, 24); const floor = Math.min(1, Math.max(0, num(cfgJ.floor, 0.5)))
  const age = ctx.asAtMonths && has(ctx.asAtMonths[code]) ? num(ctx.asAtMonths[code], null)
    : (ctx.asAtMonths && has(ctx.asAtMonths.default) ? num(ctx.asAtMonths.default, null) : null)
  if (!has(age)) return 1
  return Math.max(floor, 1 - (1 - floor) * Math.min(1, Math.max(0, age) / maxAge))
}

// ── band ladder ops (ladder = [{code,min}] as PrioritisationConfig) ──
function ladderOrder (ladder) { return ladder.slice().sort((a, b) => num(b.min, 0) - num(a.min, 0)) } // [P1..P5]
function bandIndex (band, ladder) { return ladderOrder(ladder).findIndex(b => b.code === band) }
function shiftBand (band, steps, ladder) { // negative steps = toward P1 (raise severity)
  const ord = ladderOrder(ladder); const i = bandIndex(band, ladder)
  return ord[Math.min(ord.length - 1, Math.max(0, i + steps))].code
}

// ── deterministic weight-set hash (canonical JSON, sorted keys) ──
function canonical (v) {
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === 'object') return Object.keys(v).sort().reduce((o, k) => { o[k] = canonical(v[k]); return o }, {})
  return v
}
function weightSetHash (model, resolved, extras) {
  const basis = canonical({
    code: model.code, version: model.version, aggregationMethod: model.aggregationMethod,
    criteria: resolved.map(r => ({
      code: r.criterion.code, weight: r.weight, policy: r.missingDataPolicy,
      bands: (r.criterion.bands || []).map(b => ({ l: b.lowerBound, u: b.upperBound, t: b.textValue, s: b.score })),
      bindings: (r.criterion.bindings || []).map(b => ({ st: b.sourceType, sr: b.sourceRef, tr: b.transform }))
    })),
    rules: (model.rules || []).filter(r => r.active !== false).map(r => ({ t: r.ruleType, c: r.config, p: r.priority })),
    // Council B6: the hash basis covers EVERYTHING that moves a score — the user-type weighting
    // axis (G1/G2 factor inputs) and, when the caller applies them (fleet runs), the pre-filter
    // set. Two runs share a weightSetHash only if the full resolved parameter set is identical.
    userTypeWeights: (model.userTypeWeights || []).filter(u => u.applicable !== false)
      .map(u => ({ ut: u.userType, c: u.criterion_ID, ou: u.overUnder, w: u.weight })),
    userTypes: (model.userTypes || []).filter(u => u.active !== false).map(u => ({ c: u.code, w: u.weighting })),
    preFilters: ((extras && extras.preFilters) || []).filter(f => f.active !== false)
      .map(f => ({ c: f.code, st: f.sourceType, sr: f.sourceRef, cond: f.condition }))
  })
  return crypto.createHash('sha256').update(JSON.stringify(basis)).digest('hex')
}

// ── the evaluation pipeline ──
// `preFilters` (optional) = the eligibility-gate set the CALLER applied before scoring (fleet
// runs); it enters the weightSetHash basis so the hash proves the full resolved parameter set.
function evaluate ({ model, assetClass, transportMode, context, cfg, preFilters }) {
  const conf = base.resolveConfig(cfg || {})
  const ladder = conf.bandThresholds

  // Backward-compat delegation: the approved formula, byte-identical (Phase 0 Q1).
  if (model.aggregationMethod === 'RiskCritBlend-v1') {
    const m = context.manual || {}
    const out = base.derivePriority({
      dimSafety: m.dimSafety, dimNetwork: m.dimNetwork, dimFinancial: m.dimFinancial,
      dimEnvironmental: m.dimEnvironmental, dimReputational: m.dimReputational,
      likelihood: m.likelihood, strategy: m.strategy
    }, conf)
    const resolved = resolveModelCriteria(model, assetClass, transportMode)
    const breakdown = resolved.map(r => ({
      code: r.criterion.code, category: r.criterion.category, raw: m[(r.criterion.bindings || [])[0]?.sourceRef] ?? null,
      source: 'Manual (approved design)', score: null, weight: r.weight, confidence: 1,
      contribution: null, note: 'delegated: RiskCritBlend-v1'
    }))
    return Object.assign({}, out, {
      modelCode: model.code, modelVersion: model.version, delegated: true,
      criterionBreakdown: breakdown, flags: [], forceReview: false,
      // B4: coverage disclosure does not apply to the delegated approved formula (the engineer
      // supplies every dimension; there is no configurable denominator) — honest nulls, not 100%.
      includedWeight: null, totalWeight: null,
      weightSetHash: weightSetHash(model, resolved, { preFilters })
    })
  }

  // Generic pipeline: WeightedSum / WeightedSumWithRules
  const resolved = resolveModelCriteria(model, assetClass, transportMode)
  const rules = (model.rules || []).filter(r => r.active !== false).sort((a, b) => num(a.priority, 0) - num(b.priority, 0))
  const confRule = model.aggregationMethod === 'WeightedSumWithRules' ? rules.find(r => r.ruleType === 'ConfidenceWeight') : null

  const rows = []; const flags = []
  let sumContrib = 0; let sumWeight = 0
  // B4: coverage disclosure — totalWeight is the FULL resolved weight for this asset class;
  // sumWeight (the denominator actually used) only accumulates criteria that scored. The pair
  // is surfaced so a run scored on 12 of 40 weight can never read like full-evidence scoring.
  let totalWeight = 0
  for (const r of resolved) {
    if (r.weight > 0) totalWeight += r.weight
    const { raw, source, unit } = bindRaw(r.criterion, context)
    const vf = valueFunction(raw, r.criterion.bands)
    let score = vf ? vf.score : null
    let include = true; let note = vf ? vf.label : ''
    if (!has(score)) {
      const pol = applyMissingPolicy(r.missingDataPolicy)
      score = pol.score; include = pol.include
      if (pol.flag) { flags.push(r.criterion.code + ': ' + pol.flag); note = pol.flag }
    }
    const c = confidenceFor(r.criterion.code, context, confRule)
    // G1/G2: user-type factor (1 when the criterion has no user-type rows configured).
    // B7: the Over/Under axis is DERIVED into the context (attribute OVER_UNDER or register
    // heuristic) unless the caller supplied it — axis-scoped rows no longer match everything.
    const present = context._presentUserTypes || (context._presentUserTypes = bridgeUserTypes(context))
    if (context.overUnder === undefined) context.overUnder = deriveOverUnder(context)
    const utw = userTypeFactor(r.criterion, model.userTypeWeights, model.userTypes || [], present, context.overUnder)
    const contribution = (include && has(score) && r.weight > 0) ? score * r.weight * c * utw.factor : 0
    if (include && has(score) && r.weight > 0) { sumContrib += contribution; sumWeight += r.weight }
    rows.push({ code: r.criterion.code, category: r.criterion.category, raw: has(raw) ? raw : null, unit, source, score: has(score) ? Math.round(score * 100) / 100 : null, weight: r.weight, confidence: Math.round(c * 1000) / 1000, utFactor: Math.round(utw.factor * 1000) / 1000, userTypes: utw.rows, contribution: Math.round(contribution * 1000) / 1000, included: include && r.weight > 0, note })
  }
  const baseScore = sumWeight > 0 ? sumContrib / sumWeight : 0
  let priorityScore = Math.round(baseScore)
  let band = base.bandOf(priorityScore, ladder)
  let forceReview = false

  if (model.aggregationMethod === 'WeightedSumWithRules') {
    for (const rule of rules) {
      if (rule.ruleType === 'ConfidenceWeight' || rule.ruleType === 'Normalise') continue
      let rc; try { rc = JSON.parse(rule.config || '{}') } catch (_e) { continue }
      const trigRow = rule.criterion_ID ? rows.find(x => resolved.find(rr => rr.criterion.ID === rule.criterion_ID && rr.criterion.code === x.code)) : null
      const trigVal = trigRow ? (rc.on === 'raw' ? trigRow.raw : trigRow.score) : priorityScore
      if (!parseCond(rc.when)(trigVal)) continue
      const before = band
      if (rc.floorBand && bandIndex(band, ladder) > bandIndex(rc.floorBand, ladder)) band = rc.floorBand          // SafetyFloor / Escalate-to
      if (rc.capBand && bandIndex(band, ladder) < bandIndex(rc.capBand, ladder)) band = rc.capBand                // Veto / HurdleMin cap
      if (has(rc.raiseBands)) band = shiftBand(band, -Math.abs(num(rc.raiseBands, 0)), ladder)                    // Escalate
      if (rc.setBand) band = rc.setBand
      if (rc.forceReview) forceReview = true
      flags.push(`${rule.ruleType}[${trigRow ? trigRow.code : 'global'}]: when ${rc.when} → ${before}→${band}${rc.forceReview ? ' +review' : ''}`)
    }
  }

  return {
    priorityScore, band, baseScore: Math.round(baseScore * 100) / 100,
    modelCode: model.code, modelVersion: model.version, delegated: false,
    criterionBreakdown: rows, flags, forceReview,
    // B4: "Scored on X of Y weight" — the denominator actually used vs the model's full weight.
    includedWeight: Math.round(sumWeight * 1000) / 1000,
    totalWeight: Math.round(totalWeight * 1000) / 1000,
    weightSetHash: weightSetHash(model, resolved, { preFilters }),
    formulaVersion: 'rule-engine-v1'
  }
}


// ── G1/G2: customer user-type axis (TfNSW PS224353). Which user types are present at the asset,
// derived from register facts + attributes (config data, no hardcoded asset logic beyond mapping).
function bridgeUserTypes (ctx) {
  const b = ctx.bridge || {}; const a = ctx.attributes || {}
  const modes = (String(b.transportMode || '') + ',' + String(b.secondaryModes || '')).toLowerCase()
  const out = new Set()
  if (modes.includes('road')) {
    out.add('ROAD_PASS')
    if (num(b.heavyVehiclePercent, 0) > 0 || b.freightRoute) { out.add('ROAD_HV23'); }
    if (b.hmlApproved || b.overMassRoute) out.add('ROAD_HV1')
  }
  if (modes.includes('rail') || modes.includes('lightrail')) { out.add('RAIL_PASS'); if (b.freightRoute) out.add('RAIL_FREIGHT') }
  if (modes.includes('pedestrian') || modes.includes('active') || num(a.ACTIVE_TRANSPORT_EXPOSURE, 0) > 0) { out.add('AT_PED'); out.add('AT_CYCLE') }
  if (modes.includes('marine') || String(a.NAVIGABLE_WATER).toLowerCase() === 'true') { out.add('WATER_PASS'); out.add('WATER_FREIGHT') }
  if (!out.size) out.add('ROAD_PASS') // conservative default reference user type (per TfNSW note)
  return out
}
// G2/B7: derive the Over/Under-bridge axis for the CONTEXT — which side of the structure the
// scored customers are on. Resolution order (config data first, then register heuristic):
//   1. Admin attribute OVER_UNDER ('Over' | 'Under' | 'Both') — explicit engineering call.
//   2. secondaryModes present (shared/crossing structure, e.g. Road over Rail): customers exist
//      on BOTH axes (the primary mode rides over; the secondary passes under).
//   3. A single-mode structure's customers travel ON it → 'Over'.
//   4. No register mode at all → null (axis unknown).
// Axis-scoped weight rows match ONLY their axis ('Both' matches either; '*' rows always match;
// an unknown axis matches '*' rows only) — so an 'Under' row can no longer match every bridge.
function deriveOverUnder (ctx) {
  const b = (ctx && ctx.bridge) || {}; const a = (ctx && ctx.attributes) || {}
  const explicit = String(a.OVER_UNDER ?? '').trim().toLowerCase()
  if (explicit === 'over') return 'Over'
  if (explicit === 'under') return 'Under'
  if (explicit === 'both') return 'Both'
  if (String(b.secondaryModes || '').trim()) return 'Both'
  return String(b.transportMode || '').trim() ? 'Over' : null
}
const axisMatch = (rowAxis, ctxAxis) => {
  const r = rowAxis || '*'
  if (r === '*') return true
  if (!ctxAxis) return false // unknown axis: axis-scoped rows do NOT apply (council B7)
  return ctxAxis === 'Both' || r === ctxAxis
}
// Effective user-type factor for one criterion (council B7 — MONOTONE, replacing the
// anti-monotone weighted mean that LOWERED priority when a bridge served more user groups):
//
//   factor = 1 + Σ over present applicable rows of ( typeWeighting × (rowWeight − 1) ) / 10
//   clamped to [0.5, 2]
//
// Properties (the TfNSW PS224353 intent — more relevant customer types can only maintain or
// RAISE a structure's priority, never lower it):
//   • no rows configured for the criterion ⇒ factor 1 (criterion is user-type-agnostic);
//   • a present type with rowWeight 1 is neutral (adds 0) — presence alone never penalises;
//   • a present type with rowWeight > 1 ADDS uplift scaled by its UserTypes.weighting, so the
//     active-transport 0.5 weighting now DAMPENS the uplift instead of self-cancelling in a
//     weighted-mean denominator;
//   • MONOTONICITY: with rowWeights ≥ 1 (the governed seed range), adding a present user type
//     never lowers the factor — golden-vector tested in test/user-type-factor.test.js;
//   • the /10 scale keeps the axis a moderating factor (a 1.5-weight type adds 5%), and the
//     [0.5, 2] clamp bounds the total influence of the axis on any one criterion.
function userTypeFactor (criterion, utRows, userTypes, present, overUnder) {
  const rows = (utRows || []).filter(r =>
    (r.criterion_ID ? r.criterion_ID === criterion.ID : true) && r.applicable !== false &&
    present.has(r.userType) && axisMatch(r.overUnder, overUnder))
  if (!rows.length) return { factor: 1, rows: [] }
  let factor = 1
  for (const r of rows) {
    const tw = num((userTypes.find(u => u.code === r.userType) || {}).weighting, 1)
    factor += tw * (num(r.weight, 1) - 1) / 10
  }
  return { factor: Math.min(2, Math.max(0.5, factor)), rows: rows.map(r => r.userType + (r.overUnder && r.overUnder !== '*' ? ':' + r.overUnder : '')) }
}
// ── G3: pre-filter eligibility gates — excluded BEFORE scoring, with the matching rationale.
function preFilter (ctx, filters) {
  for (const f of (filters || [])) {
    if (f.active === false) continue
    const raw = f.sourceType === 'Attribute' ? (ctx.attributes || {})[f.sourceRef] : (ctx.bridge || {})[f.sourceRef]
    if (has(raw) && parseCond(f.condition)(raw)) return { excluded: true, code: f.code, rationale: f.rationale || f.name }
  }
  return { excluded: false }
}

module.exports = {
  evaluate, resolveModelCriteria, bindRaw, valueFunction, applyMissingPolicy,
  bridgeUserTypes, userTypeFactor, deriveOverUnder, preFilter,
  confidenceFor, parseCond, weightSetHash, DERIVED
}
