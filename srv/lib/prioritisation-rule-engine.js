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
function weightSetHash (model, resolved) {
  const basis = canonical({
    code: model.code, version: model.version, aggregationMethod: model.aggregationMethod,
    criteria: resolved.map(r => ({
      code: r.criterion.code, weight: r.weight, policy: r.missingDataPolicy,
      bands: (r.criterion.bands || []).map(b => ({ l: b.lowerBound, u: b.upperBound, t: b.textValue, s: b.score })),
      bindings: (r.criterion.bindings || []).map(b => ({ st: b.sourceType, sr: b.sourceRef, tr: b.transform }))
    })),
    rules: (model.rules || []).filter(r => r.active !== false).map(r => ({ t: r.ruleType, c: r.config, p: r.priority }))
  })
  return crypto.createHash('sha256').update(JSON.stringify(basis)).digest('hex')
}

// ── the evaluation pipeline ──
function evaluate ({ model, assetClass, transportMode, context, cfg }) {
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
      weightSetHash: weightSetHash(model, resolved)
    })
  }

  // Generic pipeline: WeightedSum / WeightedSumWithRules
  const resolved = resolveModelCriteria(model, assetClass, transportMode)
  const rules = (model.rules || []).filter(r => r.active !== false).sort((a, b) => num(a.priority, 0) - num(b.priority, 0))
  const confRule = model.aggregationMethod === 'WeightedSumWithRules' ? rules.find(r => r.ruleType === 'ConfidenceWeight') : null

  const rows = []; const flags = []
  let sumContrib = 0; let sumWeight = 0
  for (const r of resolved) {
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
    // G1/G2: user-type factor (1 when the criterion has no user-type rows configured)
    const present = context._presentUserTypes || (context._presentUserTypes = bridgeUserTypes(context))
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
    weightSetHash: weightSetHash(model, resolved),
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
// Effective user-type factor for one criterion: weighted mean of applicable per-user-type weights
// over the user types PRESENT, scaled by UserTypes.weighting (active transport 0.5 etc.).
// No rows configured for the criterion => factor 1 (criterion is user-type-agnostic).
function userTypeFactor (criterion, utRows, userTypes, present, overUnder) {
  const rows = (utRows || []).filter(r =>
    (r.criterion_ID ? r.criterion_ID === criterion.ID : true) && r.applicable !== false &&
    present.has(r.userType) && ((r.overUnder || '*') === '*' || (overUnder || '*') === '*' || r.overUnder === overUnder))
  if (!rows.length) return { factor: 1, rows: [] }
  let wSum = 0; let denom = 0
  for (const r of rows) {
    const tw = num((userTypes.find(u => u.code === r.userType) || {}).weighting, 1)
    wSum += num(r.weight, 1) * tw; denom += tw
  }
  return { factor: denom > 0 ? (wSum / denom) : 1, rows: rows.map(r => r.userType + (r.overUnder && r.overUnder !== '*' ? ':' + r.overUnder : '')) }
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
  bridgeUserTypes, userTypeFactor, preFilter,
  confidenceFor, parseCond, weightSetHash, DERIVED
}
