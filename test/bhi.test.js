const b = require('../srv/lib/bhi')
// Mirrors the approved calculator math (nsw_bridge_bsi_bhi_calculator_1.html)
describe('BSI/BHI engine', () => {
  const els = [
    { elementType: 'Deck slab', conditionRating: 8 }, { elementType: 'Girder', conditionRating: 7 },
    { elementType: 'Pier', conditionRating: 6 }, { elementType: 'Bearing', conditionRating: 8 },
    { elementType: 'Drainage', conditionRating: 9 }, { elementType: 'Approach', conditionRating: 8 }
  ]
  test('Road BSI: weighted worst-per-bucket x ageFactor - envPenalty (hand-computed)', () => {
    const env = { age: 40, floodExp: 1, corrZone: 1, seismic: 0, importClass: 2 }
    const r = b.computeBSI(els, 'Road', env)
    // raw = .25*8+.30*7+.20*6+.10*8+.08*9+.07*8 = 7.38; ageFactor = 1-(40/120)*.3 = 0.9 → 6.64
    expect(r.bsi).toBeCloseTo(6.64, 2)
    expect(r.coverage).toBe(100)
    const bhi = b.computeBHI(r.bsi, env)
    // vuln = min(.4, .08) ; importFactor = .88 → 6.64*10*.92*.88 = 53.8
    expect(bhi).toBeCloseTo(53.8, 1)
    expect(b.bsiPriority(r.bsi)).toBe('ROUTINE')
    expect(b.remainingServiceLife(r.bsi, 40)).toBe(24)
  })
  test('mode weights differ (Rail superstructure-heavy) + missing buckets excluded, never zeroed', () => {
    const rail = b.computeBSI([{ elementType: 'Girder', conditionRating: 4 }], 'Rail', { age: 0 })
    expect(rail.bsi).toBe(4) // only superstructure present → its rating, not dragged by missing buckets
    expect(rail.coverage).toBe(35)
  })
  test('no elements falls back to bridge conditionRating; none at all → null', () => {
    expect(b.computeBSI([], 'Road', { age: 0, fallbackCondition: 6 }).bsi).toBe(6)
    expect(b.computeBSI([], 'Road', { age: 0 }).bsi).toBeNull()
  })
})
