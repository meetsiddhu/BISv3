const { deriveRisk, weightsFromConfig, expectedValueAud, estimatedRulYears, benefitCostRatio, probMapFromConfig, RISK_BANDS } = require('../srv/lib/risk')

describe('risk prioritisation engine', () => {
  test('high consequence + poor condition -> Very High', () => {
    const r = deriveRisk({ importanceLevel: 4, highPriorityAsset: true, conditionRating: 2, structuralAdequacyRating: 2 })
    expect(r.consequence).toBe(5)
    expect(r.likelihood).toBe(5)
    expect(r.score).toBe(100)
    expect(r.priority).toBe('Very High')
  })

  test('good condition + low importance -> Low', () => {
    const r = deriveRisk({ importanceLevel: 1, highPriorityAsset: false, conditionRating: 10, structuralAdequacyRating: 10 })
    expect(r.consequence).toBe(1)
    expect(r.likelihood).toBe(1)
    expect(r.score).toBe(4)
    expect(r.priority).toBe('Low')
  })

  test('mid values land in a middle band', () => {
    const r = deriveRisk({ importanceLevel: 2, highPriorityAsset: false, conditionRating: 6, structuralAdequacyRating: 6 })
    // consequence 2, likelihood ceil((11-6)/2)=3 -> score 24 -> Medium
    expect(r.score).toBe(24)
    expect(r.priority).toBe('Medium')
  })

  test('engineer override uses manual consequence/likelihood', () => {
    const r = deriveRisk({ riskOverride: true, riskConsequence: 5, riskLikelihood: 4, conditionRating: 10, importanceLevel: 1 })
    expect(r.consequence).toBe(5)
    expect(r.likelihood).toBe(4)
    expect(r.score).toBe(80)
    expect(r.priority).toBe('Very High')
  })

  test('missing data falls back to safe defaults (no crash)', () => {
    const r = deriveRisk({})
    expect(r.consequence).toBeGreaterThanOrEqual(1)
    expect(r.likelihood).toBeGreaterThanOrEqual(1)
    expect(typeof r.priority).toBe('string')
  })

  test('consequence and likelihood are clamped to 1..5', () => {
    const r = deriveRisk({ importanceLevel: 10, highPriorityAsset: true, conditionRating: -5 })
    expect(r.consequence).toBeLessThanOrEqual(5)
    expect(r.likelihood).toBeLessThanOrEqual(5)
  })

  test('bands are contiguous and ordered high-to-low', () => {
    expect(RISK_BANDS[0].name).toBe('Very High')
    expect(RISK_BANDS[RISK_BANDS.length - 1].min).toBe(0)
  })

  test('default weights reproduce the un-weighted result (no regression)', () => {
    const b = { importanceLevel: 3, highPriorityAsset: true, conditionRating: 5, structuralAdequacyRating: 7 }
    expect(deriveRisk(b)).toEqual(deriveRisk(b, {}))
  })

  test('config weights change the consequence (config-driven scoring)', () => {
    const b = { importanceLevel: 2, conditionRating: 5, structuralAdequacyRating: 5 }
    const base = deriveRisk(b)
    const weighted = deriveRisk(b, { consequence_importance: 2 }) // 2*2=4 vs 2
    expect(weighted.consequence).toBeGreaterThan(base.consequence)
  })

  test('heavy traffic raises consequence when weighted', () => {
    const light = deriveRisk({ importanceLevel: 3, averageDailyTraffic: 500 })
    const heavy = deriveRisk({ importanceLevel: 3, averageDailyTraffic: 50000 })
    expect(heavy.consequence).toBeGreaterThanOrEqual(light.consequence)
  })

  test('mode criticality raises consequence for rail vs road (Gap B)', () => {
    const base = { importanceLevel: 2, conditionRating: 5, structuralAdequacyRating: 5 }
    const w = { mode_Rail: 1, mode_Road: 0 }
    const road = deriveRisk(Object.assign({ transportMode: 'Road' }, base), w)
    const rail = deriveRisk(Object.assign({ transportMode: 'Rail' }, base), w)
    expect(rail.consequence).toBeGreaterThan(road.consequence)
    expect(rail.score).toBeGreaterThan(road.score)
  })

  test('mode weighting defaults to no-op when unconfigured (backward compatible)', () => {
    const b = { importanceLevel: 3, transportMode: 'Rail', conditionRating: 6, structuralAdequacyRating: 6 }
    expect(deriveRisk(b)).toEqual(deriveRisk(b, {}))
  })

  test('expected value = probability proxy x failure cost (RISK-4)', () => {
    expect(expectedValueAud(5, 1000000)).toBe(350000) // 0.35 x 1,000,000
    expect(expectedValueAud(1, 1000000)).toBe(10000)  // 0.01 x 1,000,000
    expect(expectedValueAud(3, 0)).toBeNull()
    expect(expectedValueAud(3, null)).toBeNull()
  })

  test('estimated RUL = condition headroom / degradation rate (RISK-2)', () => {
    expect(estimatedRulYears(9, 1)).toBe(8)     // (9-1)/1
    expect(estimatedRulYears(5, 0.5)).toBe(8)   // (5-1)/0.5
    expect(estimatedRulYears(1, 1)).toBe(0)     // worst already
    expect(estimatedRulYears(8, 0)).toBeNull()  // no rate -> no estimate
    expect(estimatedRulYears(8, null)).toBeNull()
  })

  test('benefit-cost ratio = (EV x reduction%) / mitigation cost (RISK-T4)', () => {
    // EV 100k, reduction 80%, mitigation 40k -> 80k/40k = 2.0
    expect(benefitCostRatio(100000, 40000, 80)).toBe(2)
    // reduction defaults to 100% when not given
    expect(benefitCostRatio(50000, 50000, undefined)).toBe(1)
    expect(benefitCostRatio(100000, 0, 80)).toBeNull()   // no mitigation cost
    expect(benefitCostRatio(null, 40000, 80)).toBeNull()
  })

  test('config probability map overrides the default proxy (RISK-T2)', () => {
    const m = probMapFromConfig({ prob_1: 0.02, prob_5: 0.5 })
    expect(m[1]).toBe(0.02)
    expect(m[5]).toBe(0.5)
    expect(expectedValueAud(5, 1000000, m)).toBe(500000)  // uses config 0.5, not default 0.35
    expect(probMapFromConfig({})).toBeNull()              // no prob_ factors -> default proxy
  })

  test('weightsFromConfig ignores inactive rows', () => {
    const w = weightsFromConfig([
      { factor: 'consequence_importance', weight: 2, active: true },
      { factor: 'consequence_priority', weight: 9, active: false }
    ])
    expect(w.consequence_importance).toBe(2)
    expect(w.consequence_priority).toBeUndefined()
  })
})
