'use strict'

const {
  scoreCompleteness, tierForScore, isPopulated,
  TIER_COMPLETE, TIER_PARTIAL, TIER_INCOMPLETE
} = require('../srv/lib/data-quality')

// A register-complete bridge: every weighted group fully populated.
const completeBridge = {
  bridgeId: 'BR-1001', bridgeName: 'Test Bridge', assetClass: 'Road Bridge',
  latitude: -33.86, longitude: 151.2, state: 'NSW',
  structureType: 'Beam', material: 'Concrete', yearBuilt: 1985,
  spanLength: 24, totalLength: 120, numberOfLanes: 2,
  conditionRating: 7, lastInspectionDate: '2025-01-10',
  assetOwner: 'Demo Authority', route: 'Main Rd', lga: 'Demo LGA'
}

// An open-data stub: identity + a point, nothing else (what OpenStreetMap typically gives).
const openDataStub = {
  bridgeId: 'OSM-9001', bridgeName: 'Unnamed crossing',
  latitude: -32.1, longitude: 150.9
}

describe('data-quality completeness scorer (council fix #4)', () => {
  test('isPopulated treats blanks/NaN/null as empty', () => {
    expect(isPopulated('x')).toBe(true)
    expect(isPopulated(0)).toBe(true)        // a real zero is data
    expect(isPopulated('')).toBe(false)
    expect(isPopulated('   ')).toBe(false)
    expect(isPopulated(null)).toBe(false)
    expect(isPopulated(undefined)).toBe(false)
    expect(isPopulated(NaN)).toBe(false)
  })

  test('a register-complete bridge scores Complete (>=90)', () => {
    const dq = scoreCompleteness(completeBridge)
    expect(dq.score).toBeGreaterThanOrEqual(90)
    expect(dq.tier).toBe(TIER_COMPLETE)
  })

  test('an open-data stub scores Incomplete and low', () => {
    const dq = scoreCompleteness(openDataStub)
    expect(dq.tier).toBe(TIER_INCOMPLETE)
    expect(dq.score).toBeLessThan(60)
  })

  test('a half-populated record lands in Partial', () => {
    const partial = {
      bridgeId: 'BR-2', bridgeName: 'Half', assetClass: 'Culvert',  // identity full
      latitude: -33, longitude: 151, state: 'NSW',                  // location full
      structureType: 'Box', material: 'Concrete', yearBuilt: 1990, spanLength: 6, // structural 4/6
      conditionRating: 6                                            // condition 1/2; no admin -> ~69
    }
    const dq = scoreCompleteness(partial)
    expect(dq.tier).toBe(TIER_PARTIAL)
    expect(dq.score).toBeGreaterThanOrEqual(60)
    expect(dq.score).toBeLessThan(90)
  })

  test('null / non-object input is treated as the worst tier, never throws', () => {
    expect(scoreCompleteness(null)).toEqual({ score: 0, tier: TIER_INCOMPLETE })
    expect(scoreCompleteness(undefined).tier).toBe(TIER_INCOMPLETE)
  })

  test('tierForScore honours the 90 / 60 thresholds', () => {
    expect(tierForScore(95)).toBe(TIER_COMPLETE)
    expect(tierForScore(90)).toBe(TIER_COMPLETE)
    expect(tierForScore(75)).toBe(TIER_PARTIAL)
    expect(tierForScore(60)).toBe(TIER_PARTIAL)
    expect(tierForScore(40)).toBe(TIER_INCOMPLETE)
  })
})
