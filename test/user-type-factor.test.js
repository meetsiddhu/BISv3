const re = require('../srv/lib/prioritisation-rule-engine')

// Council B7 — the user-type axis must be MONOTONE (TfNSW PS224353 intent: a structure that
// serves MORE relevant customer types can only maintain or RAISE its priority, never lower it).
//   factor = 1 + Σ over present applicable rows of ( typeWeighting × (rowWeight − 1) ) / 10,
//   clamped [0.5, 2]
// These are GOLDEN VECTORS: hand-computed expected values pinned against the formula, plus the
// monotonicity property and the Over/Under axis-matching semantics ('Under' rows must no longer
// match every bridge).

const CRIT = { ID: 'c-X', code: 'X' }
const row = (userType, weight, overUnder = '*', over = {}) =>
  Object.assign({ criterion_ID: 'c-X', userType, overUnder, applicable: true, weight }, over)
const TYPES = [
  { code: 'ROAD_PASS', weighting: 1, active: true },
  { code: 'ROAD_HV23', weighting: 1, active: true },
  { code: 'ROAD_HV1', weighting: 1, active: true },
  { code: 'RAIL_PASS', weighting: 1, active: true },
  { code: 'AT_PED', weighting: 0.5, active: true },   // the TfNSW active-transport 0.5
  { code: 'AT_CYCLE', weighting: 0.5, active: true }
]
const f = (rows, present, overUnder) =>
  re.userTypeFactor(CRIT, rows, TYPES, new Set(present), overUnder).factor

describe('userTypeFactor — monotone golden vectors (council B7)', () => {
  test('no rows configured ⇒ factor 1 (criterion is user-type-agnostic)', () => {
    expect(f([], ['ROAD_PASS'])).toBe(1)
    expect(re.userTypeFactor(CRIT, null, TYPES, new Set(['ROAD_PASS'])).factor).toBe(1)
  })

  test('golden vectors: factor = 1 + Σ tw×(w−1)/10', () => {
    // single neutral type (w=1): 1 + 1×0/10 = 1 — presence alone never penalises
    expect(f([row('ROAD_PASS', 1)], ['ROAD_PASS'])).toBe(1)
    // single uplift type (w=1.5, tw=1): 1 + 1×0.5/10 = 1.05
    expect(f([row('ROAD_HV1', 1.5)], ['ROAD_HV1'])).toBeCloseTo(1.05, 10)
    // seed-shaped vector: ROAD_PASS w1 + ROAD_HV23 w1.2 + ROAD_HV1 w1.5 all present
    // = 1 + (0 + 0.2 + 0.5)/10 = 1.07
    expect(f([row('ROAD_PASS', 1), row('ROAD_HV23', 1.2), row('ROAD_HV1', 1.5)],
      ['ROAD_PASS', 'ROAD_HV23', 'ROAD_HV1'])).toBeCloseTo(1.07, 10)
    // absent types contribute NOTHING (only ROAD_PASS present): 1 + 0 = 1
    expect(f([row('ROAD_PASS', 1), row('ROAD_HV23', 1.2), row('ROAD_HV1', 1.5)],
      ['ROAD_PASS'])).toBe(1)
  })

  test('active-transport 0.5 weighting DAMPENS the uplift — it no longer self-cancels', () => {
    // AT_PED w=1.5 tw=0.5: 1 + 0.5×0.5/10 = 1.025 (old weighted mean returned w itself,
    // and the 0.5 type-weighting cancelled out of numerator and denominator)
    expect(f([row('AT_PED', 1.5)], ['AT_PED'])).toBeCloseTo(1.025, 10)
    // same rowWeight on a full-weight type uplifts twice as much
    expect(f([row('RAIL_PASS', 1.5)], ['RAIL_PASS'])).toBeCloseTo(1.05, 10)
  })

  test('MONOTONICITY: adding a present user type (weight ≥ 1) never lowers the factor', () => {
    const rows = [row('ROAD_PASS', 1), row('ROAD_HV23', 1.2), row('ROAD_HV1', 1.5),
      row('AT_PED', 1.3), row('RAIL_PASS', 1.4)]
    const order = ['ROAD_PASS', 'ROAD_HV23', 'ROAD_HV1', 'AT_PED', 'RAIL_PASS']
    let prev = -Infinity
    for (let n = 1; n <= order.length; n++) {
      const cur = f(rows, order.slice(0, n))
      expect(cur).toBeGreaterThanOrEqual(prev) // more present types ⇒ factor never drops
      prev = cur
    }
    // the old anti-monotone failure case, pinned: HV-only vs HV + passenger traffic.
    // Weighted mean gave 1.2 → 1.1 (MORE users LOWERED priority); the additive form rises.
    const hvOnly = f([row('ROAD_PASS', 1), row('ROAD_HV23', 1.2)], ['ROAD_HV23'])
    const hvPlusPass = f([row('ROAD_PASS', 1), row('ROAD_HV23', 1.2)], ['ROAD_HV23', 'ROAD_PASS'])
    expect(hvPlusPass).toBeGreaterThanOrEqual(hvOnly)
  })

  test('clamped to [0.5, 2]', () => {
    // every type present at the max weight 10: 1 + Σ tw×9/10 = 5.5 ⇒ clamp at 2
    const many = TYPES.map((t) => row(t.code, 10))
    expect(f(many, TYPES.map((t) => t.code))).toBe(2)
    // pathological down-weight (w=0 on a heavily-weighted type): 1 + 10×(0−1)/10 = 0 ⇒ clamp 0.5
    const heavy = [{ code: 'ROAD_PASS', weighting: 10, active: true }]
    expect(re.userTypeFactor(CRIT, [row('ROAD_PASS', 0)], heavy, new Set(['ROAD_PASS'])).factor).toBe(0.5)
  })

  test('inapplicable rows and rows for other criteria are ignored', () => {
    expect(f([row('ROAD_HV1', 1.5, '*', { applicable: false })], ['ROAD_HV1'])).toBe(1)
    expect(f([row('ROAD_HV1', 1.5, '*', { criterion_ID: 'c-OTHER' })], ['ROAD_HV1'])).toBe(1)
  })
})

describe('Over/Under axis matching (council B7 — Under rows must not match everything)', () => {
  const rows = [row('RAIL_PASS', 1.5, 'Under'), row('ROAD_PASS', 1.4, 'Over'), row('ROAD_PASS', 1.2, '*')]

  test("'Under' rows apply ONLY when the context axis is Under (or Both)", () => {
    // axis Over: the Under row is OUT; Over + '*' rows apply ⇒ 1 + (0.4 + 0.2)/10 = 1.06
    expect(f(rows, ['RAIL_PASS', 'ROAD_PASS'], 'Over')).toBeCloseTo(1.06, 10)
    // axis Under: Under + '*' apply ⇒ 1 + (0.5 + 0.2)/10 = 1.07
    expect(f(rows, ['RAIL_PASS', 'ROAD_PASS'], 'Under')).toBeCloseTo(1.07, 10)
    // axis Both: ALL apply ⇒ 1 + (0.5 + 0.4 + 0.2)/10 = 1.11
    expect(f(rows, ['RAIL_PASS', 'ROAD_PASS'], 'Both')).toBeCloseTo(1.11, 10)
  })

  test('UNKNOWN axis matches wildcard rows only — axis-scoped rows are conservative, not universal', () => {
    expect(f(rows, ['RAIL_PASS', 'ROAD_PASS'], null)).toBeCloseTo(1.02, 10) // only the '*' row
    expect(f([row('RAIL_PASS', 1.5, 'Under')], ['RAIL_PASS'], null)).toBe(1) // the B7 dead-code fix
  })

  test('deriveOverUnder: attribute wins, then secondaryModes ⇒ Both, single mode ⇒ Over, none ⇒ null', () => {
    const d = re.deriveOverUnder
    expect(d({ bridge: { transportMode: 'Road' }, attributes: { OVER_UNDER: 'Under' } })).toBe('Under')
    expect(d({ bridge: {}, attributes: { OVER_UNDER: 'both' } })).toBe('Both') // case-insensitive
    expect(d({ bridge: { transportMode: 'Road', secondaryModes: 'Rail' }, attributes: {} })).toBe('Both')
    expect(d({ bridge: { transportMode: 'Road' }, attributes: {} })).toBe('Over')
    expect(d({ bridge: {}, attributes: {} })).toBeNull()
    expect(d({})).toBeNull()
  })
})

describe('end-to-end monotonicity through evaluate (golden score vectors)', () => {
  const crit = {
    ID: 'c-X', code: 'X', name: 'X', category: 'Consequence', valueType: 'Numeric', active: true,
    bindings: [{ sourceType: 'BridgeField', sourceRef: 'averageDailyTraffic' }],
    bands: [{ lowerBound: 0, upperBound: null, score: 50, label: 'all', displayOrder: 1 }]
  }
  const model = (utw) => ({
    code: 'T-B7', version: 1, aggregationMethod: 'WeightedSum',
    criteria: [crit], rules: [],
    classWeights: [{ criterion_ID: 'c-X', assetClass: '*', transportMode: '*', included: true, weight: 1, missingDataPolicy: 'flag' }],
    userTypeWeights: utw,
    userTypes: TYPES
  })
  const utw = [row('ROAD_PASS', 1), row('ROAD_HV23', 1.3), row('ROAD_HV1', 1.5)]
  const ev = (bridge) => re.evaluate({ model: model(utw), context: { bridge, manual: {} }, cfg: {} })

  test('adding a PRESENT user type never lowers the evaluated score', () => {
    const passOnly = ev({ transportMode: 'Road', averageDailyTraffic: 1000 })
    const plusHv = ev({ transportMode: 'Road', averageDailyTraffic: 1000, heavyVehiclePercent: 12 })
    const plusHv1 = ev({ transportMode: 'Road', averageDailyTraffic: 1000, heavyVehiclePercent: 12, hmlApproved: true })
    expect(plusHv.priorityScore).toBeGreaterThanOrEqual(passOnly.priorityScore)
    expect(plusHv1.priorityScore).toBeGreaterThanOrEqual(plusHv.priorityScore)
    // golden values: base 50; +HV23 ⇒ ×1.03 = 51.5 → 52; +HV1 ⇒ ×1.08 = 54
    expect(passOnly.priorityScore).toBe(50)
    expect(plusHv.priorityScore).toBe(52)
    expect(plusHv1.priorityScore).toBe(54)
    // the factor is surfaced per criterion for the inspector
    expect(plusHv1.criterionBreakdown[0].utFactor).toBeCloseTo(1.08, 3)
    expect(plusHv1.criterionBreakdown[0].userTypes.sort()).toEqual(['ROAD_HV1', 'ROAD_HV23', 'ROAD_PASS'])
  })

  test("an 'Under' axis row no longer inflates a plain over-bridge (derived axis applied)", () => {
    const underRow = [row('RAIL_PASS', 1.5, 'Under')]
    const railShared = ev0(underRow, { transportMode: 'Road', secondaryModes: 'Rail', averageDailyTraffic: 100 })
    const plainRoad = ev0(underRow, { transportMode: 'Road', averageDailyTraffic: 100 })
    // shared structure (axis Both, RAIL_PASS present): factor 1.05 ⇒ 52.5 → 53 (round)
    expect(railShared.priorityScore).toBe(53)
    // plain road over-bridge: RAIL_PASS absent AND axis Over — the Under row cannot fire
    expect(plainRoad.priorityScore).toBe(50)
  })
  const ev0 = (utwRows, bridge) => re.evaluate({ model: model(utwRows), context: { bridge, manual: {} }, cfg: {} })
})
