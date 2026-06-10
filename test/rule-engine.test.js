const re = require('../srv/lib/prioritisation-rule-engine')
const base = require('../srv/lib/prioritisation')

// ── helpers to build models in-memory (pure tests — no DB) ──
const crit = (code, opts = {}) => Object.assign({
  ID: 'c-' + code, code, name: code, category: 'Consequence', valueType: 'Numeric', active: true,
  bindings: [{ sourceType: 'Manual', sourceRef: code.toLowerCase() }],
  bands: [1, 2, 3, 4, 5].map(l => ({ lowerBound: l, upperBound: l, score: l * 20, label: 'L' + l, displayOrder: l }))
}, opts)
const w = (code, weight, opts = {}) => Object.assign({ criterion_ID: 'c-' + code, assetClass: '*', transportMode: '*', included: true, weight, missingDataPolicy: 'flag' }, opts)
const model = (opts = {}) => Object.assign({ code: 'T-1', version: 1, aggregationMethod: 'WeightedSumWithRules', criteria: [], classWeights: [], rules: [] }, opts)
const LADDER_CFG = {} // defaults: P1>=80 P2>=60 P3>=40 P4>=20 P5>=0

describe('rule engine — golden-vector backward compatibility (RiskCritBlend-v1 delegation)', () => {
  const m = model({
    code: 'NSW-RISK-V1', aggregationMethod: 'RiskCritBlend-v1',
    criteria: ['SAFETY', 'NETWORK', 'FINANCIAL', 'ENVIRONMENTAL', 'REPUTATIONAL', 'LIKELIHOOD'].map(c => crit(c)),
    classWeights: [w('SAFETY', 3.5), w('NETWORK', 2.5), w('FINANCIAL', 1.5), w('ENVIRONMENTAL', 1.0), w('REPUTATIONAL', 1.5), w('LIKELIHOOD', 0)]
  })
  const VECTORS = [
    { dimSafety: 3, dimNetwork: 3, dimFinancial: 3, dimEnvironmental: 3, dimReputational: 3, likelihood: 4, strategy: 'Renew' },
    { dimSafety: 5, dimNetwork: 5, dimFinancial: 5, dimEnvironmental: 5, dimReputational: 5, likelihood: 5, strategy: 'Renew' },
    { dimSafety: 1, dimNetwork: 1, dimFinancial: 1, dimEnvironmental: 1, dimReputational: 1, likelihood: 1, strategy: 'Monitor' },
    { dimSafety: 5, dimNetwork: 4, dimFinancial: 3, dimEnvironmental: 2, dimReputational: 4, likelihood: 4, strategy: 'Renew' },
    { dimSafety: 2, dimNetwork: 5, dimFinancial: 1, dimEnvironmental: 3, dimReputational: 2, likelihood: 3, strategy: 'Decommission' },
    { dimSafety: 4, dimNetwork: 4, dimFinancial: 4, dimEnvironmental: 4, dimReputational: 4, likelihood: 2, strategy: 'Maintain' }
  ]
  test('delegated output is BYTE-IDENTICAL to derivePriority across the vector matrix', () => {
    const cfg = base.resolveConfig({})
    for (const v of VECTORS) {
      const expected = base.derivePriority(v, cfg)
      const got = re.evaluate({ model: m, assetClass: 'Road Bridge', transportMode: 'Road', context: { manual: v }, cfg: {} })
      expect(got.priorityScore).toBe(expected.priorityScore)
      expect(got.band).toBe(expected.band)
      expect(got.criticality).toBe(expected.criticality)
      expect(got.tier).toBe(expected.tier)
      expect(got.residual).toBe(expected.residual)
      expect(got.delegated).toBe(true)
      expect(got.modelCode).toBe('NSW-RISK-V1')
      expect(got.weightSetHash).toMatch(/^[a-f0-9]{64}$/)
    }
  })
})

describe('rule engine — reproducibility', () => {
  const m = model({ criteria: [crit('A'), crit('B')], classWeights: [w('A', 2), w('B', 1)] })
  const ctx = { manual: { a: 4, b: 2 } }
  test('same model + same context ⇒ identical result incl. hash', () => {
    const r1 = re.evaluate({ model: m, context: ctx, cfg: LADDER_CFG })
    const r2 = re.evaluate({ model: m, context: ctx, cfg: LADDER_CFG })
    expect(r2).toEqual(r1)
  })
  test('a weight change ⇒ DIFFERENT weightSetHash (model identity is provable)', () => {
    const h1 = re.evaluate({ model: m, context: ctx, cfg: LADDER_CFG }).weightSetHash
    const m2 = model({ criteria: m.criteria, classWeights: [w('A', 3), w('B', 1)] })
    const h2 = re.evaluate({ model: m2, context: ctx, cfg: LADDER_CFG }).weightSetHash
    expect(h2).not.toBe(h1)
  })
  test('weighted-sum math is exact (hand-computed)', () => {
    // A: raw 4 → 80, weight 2; B: raw 2 → 40, weight 1 → (80*2 + 40*1)/3 = 66.67 → 67 → P2
    const r = re.evaluate({ model: m, context: ctx, cfg: LADDER_CFG })
    expect(r.baseScore).toBe(66.67)
    expect(r.priorityScore).toBe(67)
    expect(r.band).toBe('P2')
  })
})

describe('rule engine — per-class wildcard precedence', () => {
  const m = model({
    criteria: [crit('A')],
    classWeights: [
      w('A', 1, { assetClass: '*', transportMode: '*' }),
      w('A', 5, { assetClass: 'Rail Bridge', transportMode: '*' }),
      w('A', 9, { assetClass: 'Rail Bridge', transportMode: 'Rail' })
    ]
  })
  test('(class,mode) beats (class,*) beats (*,*)', () => {
    expect(re.resolveModelCriteria(m, 'Rail Bridge', 'Rail')[0].weight).toBe(9)
    expect(re.resolveModelCriteria(m, 'Rail Bridge', 'Road')[0].weight).toBe(5)
    expect(re.resolveModelCriteria(m, 'Road Bridge', 'Road')[0].weight).toBe(1)
  })
  test('included=false removes the criterion for that class', () => {
    const m2 = model({ criteria: [crit('A')], classWeights: [w('A', 1), w('A', 1, { assetClass: 'Pedestrian Bridge', included: false })] })
    expect(re.resolveModelCriteria(m2, 'Pedestrian Bridge', 'Pedestrian')).toHaveLength(0)
    expect(re.resolveModelCriteria(m2, 'Road Bridge', 'Road')).toHaveLength(1)
  })
})

describe('rule engine — value functions', () => {
  test('numeric range bands (open-ended) + discrete text bands', () => {
    const bands = [
      { lowerBound: null, upperBound: 0.99, score: 90, label: 'sub-standard', displayOrder: 1 },
      { lowerBound: 1, upperBound: null, score: 10, label: 'adequate', displayOrder: 2 },
      { textValue: 'Scour-critical', score: 95, label: 'critical', displayOrder: 3 }
    ]
    expect(re.valueFunction(0.8, bands).score).toBe(90)
    expect(re.valueFunction(1.4, bands).score).toBe(10)
    expect(re.valueFunction('scour-CRITICAL', bands).score).toBe(95)
    expect(re.valueFunction('unknown-text', bands)).toBeNull()
    expect(re.valueFunction(null, bands)).toBeNull()
  })
})

describe('rule engine — missing data is NEVER a silent zero', () => {
  const mk = (policy) => model({ criteria: [crit('A'), crit('B')], classWeights: [w('A', 1, { missingDataPolicy: policy }), w('B', 1)] })
  const ctx = { manual: { b: 5 } } // A missing, B → 100
  test("'flag' excludes from the denominator and surfaces a flag", () => {
    const r = re.evaluate({ model: mk('flag'), context: ctx, cfg: LADDER_CFG })
    expect(r.priorityScore).toBe(100) // B only — A did NOT drag the score to 50 silently
    expect(r.flags.join()).toMatch(/A: missing/)
    expect(r.criterionBreakdown.find(x => x.code === 'A').included).toBe(false)
  })
  test("'neutral' scores the definitional midpoint 50 and flags it", () => {
    const r = re.evaluate({ model: mk('neutral'), context: ctx, cfg: LADDER_CFG })
    expect(r.priorityScore).toBe(75) // (50+100)/2
    expect(r.flags.join()).toMatch(/neutral/)
  })
  test("'penalise' scores conservative worst-case (100 default, configurable)", () => {
    expect(re.evaluate({ model: mk('penalise'), context: ctx, cfg: LADDER_CFG }).priorityScore).toBe(100)
    expect(re.evaluate({ model: mk('penalise:80'), context: ctx, cfg: LADDER_CFG }).priorityScore).toBe(90)
  })
  test("'exclude' drops it without a flag", () => {
    const r = re.evaluate({ model: mk('exclude'), context: ctx, cfg: LADDER_CFG })
    expect(r.priorityScore).toBe(100)
    expect(r.flags).toHaveLength(0)
  })
})

describe('rule engine — non-compensatory rules', () => {
  const scour = crit('SCOUR', { bands: [{ textValue: 'Scour-critical', score: 90, displayOrder: 1 }, { textValue: 'Stable', score: 10, displayOrder: 2 }] })
  const cust = crit('CUSTOMER')
  test('SafetyFloor: a dangerous asset cannot be buried by a low compensatory score', () => {
    const m = model({
      criteria: [scour, cust],
      classWeights: [w('SCOUR', 1), w('CUSTOMER', 9)],
      rules: [{ ruleType: 'SafetyFloor', criterion_ID: 'c-SCOUR', active: true, priority: 1, config: JSON.stringify({ when: '>=90', floorBand: 'P2' }), rationale: 'scour-critical must surface' }]
    })
    const r = re.evaluate({ model: m, context: { manual: { customer: 1 }, attributes: {} , bridge: {} , }, cfg: LADDER_CFG, assetClass: '*', transportMode: '*' })
    // hack: SCOUR binds Manual scour — provide via manual
    const r2 = re.evaluate({ model: m, context: { manual: { customer: 1, scour: 'Scour-critical' } }, cfg: LADDER_CFG })
    expect(r2.baseScore).toBeLessThan(40) // compensatory score is LOW (90*1 + 20*9)/10 = 27
    expect(r2.band).toBe('P2')            // …but the floor raises the band
    expect(r2.flags.join()).toMatch(/SafetyFloor/)
    expect(r.band).toBeDefined()
  })
  test('Escalate raiseBands + forceReview; Veto caps', () => {
    const m = model({
      criteria: [crit('FCM', { bands: [{ textValue: 'yes', score: 100, displayOrder: 1 }, { textValue: 'no', score: 0, displayOrder: 2 }] }), crit('B')],
      classWeights: [w('FCM', 1), w('B', 1)],
      rules: [
        { ruleType: 'Escalate', criterion_ID: 'c-FCM', active: true, priority: 1, config: JSON.stringify({ when: '>=100', raiseBands: 1, forceReview: true }), rationale: 'fracture-critical' },
        { ruleType: 'HurdleMin', criterion_ID: 'c-B', active: true, priority: 2, config: JSON.stringify({ when: '<40', capBand: 'P3' }), rationale: 'hurdle' }
      ]
    })
    const r = re.evaluate({ model: m, context: { manual: { fcm: 'yes', b: 3 } }, cfg: LADDER_CFG })
    // base = (100+60)/2 = 80 → P1; escalate already at P1 stays P1; hurdle B score 60 not <40
    expect(r.band).toBe('P1'); expect(r.forceReview).toBe(true)
    const r2 = re.evaluate({ model: m, context: { manual: { fcm: 'no', b: 1 } }, cfg: LADDER_CFG })
    // base = (0+20)/2 = 10 → P5; B score 20 <40 → capBand P3 only lowers bands ABOVE the cap; P5 stays
    expect(r2.band).toBe('P5')
    const m3 = model({ criteria: m.criteria, classWeights: m.classWeights, rules: [{ ruleType: 'Veto', criterion_ID: 'c-B', active: true, priority: 1, config: JSON.stringify({ when: '<40', capBand: 'P4', forceReview: true }), rationale: 'veto' }] })
    const r3 = re.evaluate({ model: m3, context: { manual: { fcm: 'yes', b: 1 } }, cfg: LADDER_CFG })
    // base = (100+20)/2 = 60 → P2; veto caps to P4 + review
    expect(r3.band).toBe('P4'); expect(r3.forceReview).toBe(true)
  })
})

describe('rule engine — confidence weighting', () => {
  const m = model({
    criteria: [crit('A')], classWeights: [w('A', 1)],
    rules: [{ ruleType: 'ConfidenceWeight', active: true, priority: 0, config: JSON.stringify({ maxAgeMonths: 24, floor: 0.5 }), rationale: 'stale data down-weighted' }]
  })
  test('stale inputs decay linearly to the floor', () => {
    const fresh = re.evaluate({ model: m, context: { manual: { a: 5 }, asAtMonths: { default: 0 } }, cfg: LADDER_CFG })
    const half = re.evaluate({ model: m, context: { manual: { a: 5 }, asAtMonths: { default: 12 } }, cfg: LADDER_CFG })
    const stale = re.evaluate({ model: m, context: { manual: { a: 5 }, asAtMonths: { default: 48 } }, cfg: LADDER_CFG })
    expect(fresh.priorityScore).toBe(100)
    expect(half.priorityScore).toBe(75)   // conf 0.75
    expect(stale.priorityScore).toBe(50)  // floored at 0.5
  })
})

describe('rule engine — source bindings', () => {
  test('BridgeField / Attribute / Element-min / Defect-max / Capacity-latest / Derived / Restriction', () => {
    const ctx = {
      bridge: { conditionRating: 4, structuralAdequacyRating: 6, averageDailyTraffic: 14000 },
      attributes: { SCOUR_RATING: 'Scour-critical' },
      elements: [{ conditionRating: 7 }, { conditionRating: 3 }],
      defects: [{ severity: 2, status: 'Open' }, { severity: 4, status: 'Open' }, { severity: 4, status: 'Completed' }],
      capacities: [{ ratingFactor: 1.2, ratingDate: '2024-01-01' }, { ratingFactor: 0.9, ratingDate: '2025-06-01' }],
      inspections: [{ inspectionDate: '2020-01-01', conditionRating: 8 }, { inspectionDate: '2025-01-01', conditionRating: 4 }],
      restrictions: [{ restrictionStatus: 'Active', active: true }]
    }
    const bind = (sourceType, sourceRef, transform) => re.bindRaw({ bindings: [{ sourceType, sourceRef, transform }] }, ctx).raw
    expect(bind('BridgeField', 'averageDailyTraffic')).toBe(14000)
    expect(bind('Attribute', 'SCOUR_RATING')).toBe('Scour-critical')
    expect(bind('Element', 'conditionRating')).toBe(3)              // min by default (worst element)
    expect(bind('Defect', 'severity')).toBe(4)                       // max OPEN severity
    expect(bind('Capacity', 'ratingFactor')).toBe(0.9)               // latest by ratingDate
    expect(bind('Derived', 'deriveLikelihood')).toBe(base.deriveLikelihood(4, 6))
    expect(bind('Derived', 'conditionTrend')).toBeCloseTo(-0.8, 1)   // 8→4 over 5 years
    expect(bind('Restriction', 'activeCount')).toBe(1)
    // binding order = fallback chain (Manual first, Derived default)
    const chain = re.bindRaw({ bindings: [{ sourceType: 'Manual', sourceRef: 'likelihood' }, { sourceType: 'Derived', sourceRef: 'deriveLikelihood' }] }, Object.assign({ manual: {} }, ctx))
    expect(chain.raw).toBe(base.deriveLikelihood(4, 6))
    expect(chain.source).toBe('Derived:deriveLikelihood')
  })
})
