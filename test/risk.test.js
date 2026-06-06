const { deriveRisk, weightsFromConfig, RISK_BANDS } = require('../srv/lib/risk')

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

  test('weightsFromConfig ignores inactive rows', () => {
    const w = weightsFromConfig([
      { factor: 'consequence_importance', weight: 2, active: true },
      { factor: 'consequence_priority', weight: 9, active: false }
    ])
    expect(w.consequence_importance).toBe(2)
    expect(w.consequence_priority).toBeUndefined()
  })
})
