// Pure-function unit tests for srv/lib/effective-runs.js (council B3a/B3b).
// No I/O — exercises the "one effective run per bridge" reducer directly:
//   • review-held rows (reviewStatus='pending') are dropped from default surfaces
//   • manual beats fleet; newest-within-type wins; legacy null runType = manual
//     unless it carries a fleetRunId (a pre-runType fleet batch row).
const { effectiveRuns, isHeld, isFleet } = require('../srv/lib/effective-runs')

describe('effective-runs: isHeld', () => {
  test('only reviewStatus === "pending" is held', () => {
    expect(isHeld({ reviewStatus: 'pending' })).toBe(true)
    expect(isHeld({ reviewStatus: 'released' })).toBe(false)
    expect(isHeld({ reviewStatus: null })).toBe(false)
    expect(isHeld({})).toBe(false)
  })

  test('null / undefined row is not held (defensive)', () => {
    expect(isHeld(null)).toBe(false)
    expect(isHeld(undefined)).toBe(false)
  })
})

describe('effective-runs: isFleet', () => {
  test('explicit runType "fleet" is fleet; "manual" is not', () => {
    expect(isFleet({ runType: 'fleet' })).toBe(true)
    expect(isFleet({ runType: 'manual' })).toBe(false)
  })

  test('legacy null runType is fleet ONLY when a fleetRunId is present', () => {
    expect(isFleet({ runType: null, fleetRunId: 'F1' })).toBe(true)
    expect(isFleet({ runType: null })).toBe(false)
    expect(isFleet({})).toBe(false)
  })
})

describe('effective-runs: effectiveRuns reducer', () => {
  test('null / empty input yields an empty array', () => {
    expect(effectiveRuns(null)).toEqual([])
    expect(effectiveRuns([])).toEqual([])
  })

  test('drops held rows and inactive rows before deduplication', () => {
    const out = effectiveRuns([
      { ID: 'a', bridge_ID: 1, reviewStatus: 'pending' }, // held → dropped
      { ID: 'b', bridge_ID: 2, active: false },           // inactive → dropped
      { ID: 'c', bridge_ID: 3 }                           // kept
    ])
    expect(out.map((r) => r.ID)).toEqual(['c'])
  })

  test('one run per bridge: manual beats fleet for the same bridge', () => {
    const out = effectiveRuns([
      { ID: 'fleet', bridge_ID: 7, runType: 'fleet', assessedAt: '2026-06-01T00:00:00Z' },
      { ID: 'manual', bridge_ID: 7, runType: 'manual', assessedAt: '2026-01-01T00:00:00Z' }
    ])
    expect(out).toHaveLength(1)
    expect(out[0].ID).toBe('manual') // manual wins even though it is older
  })

  test('same type: newest (by assessedAt) wins, regardless of input order', () => {
    const older = { ID: 'old', bridge_ID: 9, runType: 'manual', assessedAt: '2025-01-01T00:00:00Z' }
    const newer = { ID: 'new', bridge_ID: 9, runType: 'manual', assessedAt: '2026-01-01T00:00:00Z' }
    expect(effectiveRuns([older, newer])[0].ID).toBe('new')
    expect(effectiveRuns([newer, older])[0].ID).toBe('new') // order-independent
  })

  test('falls back to createdAt when assessedAt is missing for the timestamp comparison', () => {
    const out = effectiveRuns([
      { ID: 'old', bridge_ID: 4, runType: 'fleet', createdAt: '2025-01-01T00:00:00Z' },
      { ID: 'new', bridge_ID: 4, runType: 'fleet', createdAt: '2026-01-01T00:00:00Z' }
    ])
    expect(out[0].ID).toBe('new')
  })

  test('different bridges are all retained (one each)', () => {
    const out = effectiveRuns([
      { ID: 'a', bridge_ID: 1, runType: 'manual' },
      { ID: 'b', bridge_ID: 2, runType: 'fleet', fleetRunId: 'F1' },
      { ID: 'c', bridge_ID: 3, runType: 'manual' }
    ])
    expect(out).toHaveLength(3)
  })

  test('rows without bridge_ID are keyed by bridgeRef then ID', () => {
    const out = effectiveRuns([
      { ID: 'x', bridgeRef: 'REF-1', runType: 'manual' },
      { ID: 'y', bridgeRef: 'REF-1', runType: 'fleet' } // same ref → manual wins
    ])
    expect(out).toHaveLength(1)
    expect(out[0].ID).toBe('x')
  })

  test('a legacy fleet batch row (null runType + fleetRunId) loses to a manual run', () => {
    const out = effectiveRuns([
      { ID: 'legacyFleet', bridge_ID: 11, runType: null, fleetRunId: 'F9', assessedAt: '2026-06-01T00:00:00Z' },
      { ID: 'manual', bridge_ID: 11, runType: 'manual', assessedAt: '2026-05-01T00:00:00Z' }
    ])
    expect(out[0].ID).toBe('manual')
  })
})
