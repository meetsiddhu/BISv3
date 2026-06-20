const det = require('../srv/lib/deterioration')

// DET-2/3 — deterioration forecasting + remaining-service-life (legacy 1-10 scale, 10=best).
describe('linear model', () => {
  test('condition loses the rate per year and clamps at 1', () => {
    expect(det.linearForecast(8, 0.5, 4)).toBe(6)      // 8 - 0.5*4
    expect(det.linearForecast(2, 0.5, 100)).toBe(1)    // clamped
    expect(det.linearForecast(8, 0.5, 0)).toBe(8)
  })
  test('RUL is years to reach the intervention threshold', () => {
    expect(det.linearRul(8, 0.5, 4)).toBe(8)           // (8-4)/0.5
    expect(det.linearRul(4, 0.5, 4)).toBe(0)           // already at threshold
    expect(det.linearRul(8, 0, 4)).toBeNull()          // no rate → not derivable
  })
})

describe('markov model', () => {
  const matrix = { '8': { '8': 0.9, '7': 0.1 }, '7': { '7': 0.9, '6': 0.1 }, '6': { '6': 0.9, '5': 0.1 }, '5': { '5': 1 } }
  test('expected condition decreases over time', () => {
    const c0 = det.markovForecast(8, matrix, 0)
    const c5 = det.markovForecast(8, matrix, 5)
    expect(c0).toBe(8)
    expect(c5).toBeLessThan(c0)
  })
  test('RUL returns the first year expected condition reaches the threshold', () => {
    const rul = det.markovRul(8, matrix, 6)
    expect(rul).toBeGreaterThan(0)
    expect(Number.isFinite(rul)).toBe(true)
  })
  test('absorbing/garbage matrix is handled (no throw, returns a number or null)', () => {
    expect(() => det.markovForecast(8, 'not json', 3)).not.toThrow()
    expect(det.markovForecast(8, null, 3)).toBeNull()
  })
})

describe('weibull model', () => {
  test('survival decreases monotonically with age', () => {
    const s10 = det.weibullSurvival(10, 2, 80)
    const s50 = det.weibullSurvival(50, 2, 80)
    expect(s50).toBeLessThan(s10)
    expect(s10).toBeLessThanOrEqual(1)
  })
  test('forecast maps survival onto the 1-10 condition scale and declines with age', () => {
    const c10 = det.weibullForecast(10, 2, 80, 0)
    const c40 = det.weibullForecast(10, 2, 80, 30)
    expect(c40).toBeLessThan(c10)
    expect(c10).toBeGreaterThan(1)
    expect(c10).toBeLessThanOrEqual(10)
  })
  test('RUL is finite within the horizon', () => {
    const rul = det.weibullRul(10, 2, 60, 4)
    expect(Number.isFinite(rul)).toBe(true)
  })
})

describe('dispatcher', () => {
  test('selects the model named on the strategy', () => {
    const lin = det.forecast({ strategy: { deteriorationModel: 'Linear', degradationRatePerYear: 0.4 }, ctx: { conditionRating: 9 }, years: 5 })
    expect(lin).toBe(7) // 9 - 0.4*5
    const wbl = det.forecast({ strategy: { deteriorationModel: 'Weibull', weibullShape: 2, weibullScaleYears: 70 }, ctx: { ageYears: 20 }, years: 10 })
    expect(wbl).toBeGreaterThan(1)
    expect(det.remainingServiceLife({ strategy: { deteriorationModel: 'Linear', degradationRatePerYear: 0.5, interventionThreshold: 4 }, ctx: { conditionRating: 8 } })).toBe(8)
  })
})
