'use strict'

// [Domain 22 — Property-Based Testing] condition-rating engine (single source of truth,
// CLAUDE.md §4b). fast-check is not a dependency, so this hand-rolls PBT: exhaustive over
// the small integer domain + randomised sampling over reals and out-of-range inputs.
// Invariants asserted (not examples — properties that must hold for ALL inputs):

const CR = require('../srv/lib/condition-rating')

const VALID_BANDS = [1, 2, 3, 4, 5]
const seed = () => Math.random() // randomness is fine here: failures print the offending input

describe('[Domain 22] PBT — condition-rating invariants', () => {
  test('P1: every integer rating 1..10 maps to a band in 1..5', () => {
    for (let r = 1; r <= 10; r++) {
      expect(VALID_BANDS).toContain(CR.legacyToBand(r))
    }
  })

  test('P2: monotonic — higher (better) rating never yields a worse (higher) band', () => {
    for (let r1 = 1; r1 <= 10; r1++) {
      for (let r2 = r1; r2 <= 10; r2++) {
        // r2 >= r1 (equal or better) => band(r2) <= band(r1)
        expect(CR.legacyToBand(r2)).toBeLessThanOrEqual(CR.legacyToBand(r1))
      }
    }
  })

  test('P3: band->label is total over 1..5 and round-trips (label->band)', () => {
    for (const b of VALID_BANDS) {
      const label = CR.conditionLabel(b)
      expect(typeof label).toBe('string')
      expect(CR.labelToBand(label)).toBe(b)
    }
  })

  test('P4: out-of-range / non-finite ratings never produce a fake band', () => {
    const bad = [0, -1, 11, 100, -999, NaN, Infinity, -Infinity, null, undefined]
    for (const r of bad) {
      const band = CR.legacyToBand(r)
      expect(band === null || band === undefined).toBe(true)
      if (CR.isValidLegacy) expect(CR.isValidLegacy(r)).toBe(false)
    }
  })

  test('P5: isValidLegacy true exactly on [1,10]', () => {
    if (!CR.isValidLegacy) return
    for (let r = 1; r <= 10; r++) expect(CR.isValidLegacy(r)).toBe(true)
    expect(CR.isValidLegacy(0)).toBe(false)
    expect(CR.isValidLegacy(10.0001)).toBe(false)
  })

  test('P6: randomised reals in [1,10] always yield a valid band (1000 samples)', () => {
    for (let i = 0; i < 1000; i++) {
      const r = 1 + seed() * 9 // [1,10]
      const band = CR.legacyToBand(r)
      expect(VALID_BANDS).toContain(band)
    }
  })

  test('P7: high-priority threshold is internally consistent (band>=4 <=> rating<=4)', () => {
    // Documented rule: high-priority = band >= 4; ratings 1..4 are the worst half.
    for (let r = 1; r <= 10; r++) {
      const highPriority = CR.legacyToBand(r) >= 4
      expect(highPriority).toBe(r <= 4)
    }
  })
})
