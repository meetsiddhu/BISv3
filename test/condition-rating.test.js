const { deriveCondition, legacyToBand, conditionLabel, isHighPriorityBand, labelToBand, labelToLegacy } = require('../srv/lib/condition-rating')

describe('canonical condition rating (ARCH-2 / INSPECT-5)', () => {
  test('legacy 10 (best) -> band 1 Good, not high priority', () => {
    const d = deriveCondition(10)
    expect(d.band).toBe(1)
    expect(d.condition).toBe('Good')
    expect(d.highPriorityAsset).toBe(false)
  })

  test('legacy 1 (worst) -> band 5 Critical, high priority', () => {
    const d = deriveCondition(1)
    expect(d.band).toBe(5)
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
    expect(conditionLabel(legacyToBand(6))).toBe('Poor')
    expect(isHighPriorityBand(4)).toBe(true)
    expect(isHighPriorityBand(3)).toBe(false)
  })

  test('reverse map is NOT inverted (ARCH-R1): Good -> high legacy, Critical -> low', () => {
    expect(labelToBand('Good')).toBe(1)
    expect(labelToBand('Critical')).toBe(5)
    expect(labelToBand('unknown')).toBeNull()
    // Good must map to a GOOD legacy rating (high, ~10) — the old bug gave 2 (Critical).
    expect(labelToLegacy('Good')).toBeGreaterThanOrEqual(8)
    expect(labelToLegacy('Critical')).toBeLessThanOrEqual(2)
    // round-trips back to the same band
    expect(legacyToBand(labelToLegacy('Good'))).toBe(1)
    expect(legacyToBand(labelToLegacy('Critical'))).toBe(5)
  })
})
