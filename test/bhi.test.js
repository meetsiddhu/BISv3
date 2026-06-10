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

// Council B8 — weights/coefficients are GOVERNED CONFIG (SystemConfig 'bhiWeights' JSON) with
// the approved calculator values as documented code defaults. Calculator parity = defaults
// unchanged (the suite above runs entirely on defaults and must stay green untouched).
describe('BSI/BHI config governance (council B8)', () => {
  afterEach(() => b.configure(null)) // never leak an override into other tests

  test('defaults: resolveBhiConfig(null/invalid) is the documented calculator config', () => {
    expect(b.resolveBhiConfig(null)).toEqual(b.DEFAULT_BHI_CONFIG)
    expect(b.resolveBhiConfig('not json {{')).toEqual(b.DEFAULT_BHI_CONFIG)
    expect(b.DEFAULT_MODE_WEIGHTS.Road.superstructure).toBe(0.30) // pinned calculator value
    expect(b.DEFAULT_ENV_COEFFICIENTS.floodStep).toBe(0.04)
    expect(b.MODE_WEIGHTS).toEqual(b.DEFAULT_MODE_WEIGHTS) // back-compat alias intact
    // only the road models are calibrated; rail/ped are road-derived until calibrated
    expect(b.DEFAULT_BHI_CONFIG.calibrated).toEqual(['Road', 'RoadOverWater'])
  })

  test('partial JSON override merges per mode / per coefficient; junk values are ignored', () => {
    const cfg = b.resolveBhiConfig(JSON.stringify({
      modeWeights: { Rail: { superstructure: 0.5, deck: 'junk' } },
      env: { floodStep: 0.1, notAKnob: 9, corrStep: 'NaN' }
    }))
    expect(cfg.modeWeights.Rail.superstructure).toBe(0.5)   // overridden
    expect(cfg.modeWeights.Rail.deck).toBe(0.20)            // junk ignored → default holds
    expect(cfg.modeWeights.Road).toEqual(b.DEFAULT_MODE_WEIGHTS.Road) // untouched mode = defaults
    expect(cfg.env.floodStep).toBe(0.1)
    expect(cfg.env.corrStep).toBe(0.03)                     // junk ignored
    expect(cfg.env.notAKnob).toBeUndefined()                // unknown knobs never enter
  })

  test('an env-coefficient override actually moves the computation (and configure() resets)', () => {
    const env = { age: 40, floodExp: 3, corrZone: 1, seismic: 0, importClass: 2, fallbackCondition: 8 }
    const before = b.computeBSI([], 'Road', env).bsi          // envPenalty = 2×0.04 = 0.08
    b.configure({ env: { floodStep: 0.2 } })                  // envPenalty = 2×0.2 = 0.4
    const after = b.computeBSI([], 'Road', env).bsi
    expect(before - after).toBeCloseTo(0.32, 2)
    b.configure(null)
    expect(b.computeBSI([], 'Road', env).bsi).toBe(before)    // defaults restored exactly
  })

  test('B8 bucket mapping: joints → bearings, railings/parapets → deck (no longer ~3x superstructure)', () => {
    expect(b.bucketOf('Expansion joint')).toBe('bearings')
    expect(b.bucketOf('Deck joint')).toBe('bearings')
    expect(b.bucketOf('Railing')).toBe('deck')
    expect(b.bucketOf('Handrail')).toBe('deck')
    expect(b.bucketOf('Parapet')).toBe('deck')
    expect(b.bucketOf('Traffic barrier')).toBe('deck')
    expect(b.bucketOf('Girder')).toBe('superstructure')      // structural elements unchanged
    expect(b.bucketOf('Deck slab')).toBe('deck')
    expect(b.bucketOf('Pier')).toBe('substructure')
    expect(b.bucketOf('Mystery element')).toBe('superstructure') // default fallback unchanged
    // effect on the score: a bad joint now governs the 0.10 bearings bucket, not the 0.30
    // superstructure bucket — with a sound girder present the structure is no longer dragged 3x
    const r = b.computeBSI([{ elementType: 'Girder', conditionRating: 8 }, { elementType: 'Expansion joint', conditionRating: 2 }], 'Road', { age: 0 })
    // (8×0.30 + 2×0.10)/(0.40) = 6.5
    expect(r.bsi).toBeCloseTo(6.5, 2)
  })

  test('modeKeyFor resolves the calibration identity of the active weight set', () => {
    expect(b.modeKeyFor('Road', false)).toBe('Road')
    expect(b.modeKeyFor('Road', true)).toBe('RoadOverWater')
    expect(b.modeKeyFor('Rail', false)).toBe('Rail')
    expect(b.modeKeyFor('LightRail', false)).toBe('Rail')
    expect(b.modeKeyFor('Pedestrian', false)).toBe('Pedestrian')
  })
})
