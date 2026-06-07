const { deriveCondition, legacyToTfNSW, conditionLabel, isHighPriorityTfNSW } = require('../srv/lib/condition-rating')

describe('canonical condition rating (ARCH-2 / INSPECT-5)', () => {
  test('legacy 10 (best) -> TfNSW 1 Good, not high priority', () => {
    const d = deriveCondition(10)
    expect(d.tfnsw).toBe(1)
    expect(d.condition).toBe('Good')
    expect(d.highPriorityAsset).toBe(false)
  })

  test('legacy 1 (worst) -> TfNSW 5 Critical, high priority', () => {
    const d = deriveCondition(1)
    expect(d.tfnsw).toBe(5)
    expect(d.condition).toBe('Critical')
    expect(d.highPriorityAsset).toBe(true)
  })

  test('high-priority boundary preserved: rating 4 flags, rating 5 does not', () => {
    expect(deriveCondition(4).highPriorityAsset).toBe(true)   // -> Very Poor
    expect(deriveCondition(5).highPriorityAsset).toBe(false)  // -> Poor
  })

  test('out-of-range returns null (caller raises validation error)', () => {
    expect(deriveCondition(0)).toBeNull()
    expect(deriveCondition(11)).toBeNull()
    expect(deriveCondition('x')).toBeNull()
  })

  test('helpers are consistent', () => {
    expect(conditionLabel(legacyToTfNSW(6))).toBe('Poor')
    expect(isHighPriorityTfNSW(4)).toBe(true)
    expect(isHighPriorityTfNSW(3)).toBe(false)
  })
})
