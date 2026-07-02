const b = require('../srv/lib/bhi')

// Council BHI-1 — the BSI/BHI admin screen sends a STRUCTURED config object
// ({modeWeights, env, calibrated}); the /system/api/bhi-config PUT normalises it with
// resolveBhiConfig and stores the result; the GET reads it back and the screen renders
// it. This pins that contract: object input is accepted, partial overrides merge over
// the engine defaults, junk is dropped, and the normalised form is idempotent (so a
// save→reload→save cannot drift).

describe('BSI/BHI config round-trip (UI ⇄ engine contract)', () => {
  test('accepts a structured object (not only a JSON string)', () => {
    const cfg = b.resolveBhiConfig({ env: { floodStep: 0.1 } })
    expect(cfg.env.floodStep).toBe(0.1)
    expect(cfg.env.corrStep).toBe(b.DEFAULT_ENV_COEFFICIENTS.corrStep) // untouched default held
  })

  test('partial mode-weight override merges over defaults; other buckets/modes unchanged', () => {
    const cfg = b.resolveBhiConfig({ modeWeights: { Road: { deck: 0.4 } } })
    expect(cfg.modeWeights.Road.deck).toBe(0.4)
    expect(cfg.modeWeights.Road.superstructure).toBe(b.DEFAULT_MODE_WEIGHTS.Road.superstructure)
    expect(cfg.modeWeights.Rail.deck).toBe(b.DEFAULT_MODE_WEIGHTS.Rail.deck)
  })

  test('negative / non-numeric weights are dropped (defaults held) — the API also rejects them upfront', () => {
    const cfg = b.resolveBhiConfig({ modeWeights: { Road: { deck: -5, superstructure: 'x' } } })
    expect(cfg.modeWeights.Road.deck).toBe(b.DEFAULT_MODE_WEIGHTS.Road.deck)
    expect(cfg.modeWeights.Road.superstructure).toBe(b.DEFAULT_MODE_WEIGHTS.Road.superstructure)
  })

  test('calibrated-mode list round-trips', () => {
    const cfg = b.resolveBhiConfig({ calibrated: ['Road', 'Rail'] })
    expect(cfg.calibrated).toEqual(['Road', 'Rail'])
  })

  test('normalised form is idempotent: resolve(JSON(resolve(x))) === resolve(x)', () => {
    const input = { modeWeights: { Pedestrian: { deck: 0.5 } }, env: { vulnCap: 0.3 }, calibrated: ['Road'] }
    const once = b.resolveBhiConfig(input)
    const twice = b.resolveBhiConfig(JSON.stringify(once))
    expect(twice).toEqual(once)
  })

  test('per-class overrides round-trip + stay idempotent (the screen always re-sends classModeWeights)', () => {
    // The admin screen rebuilds classModeWeights from its rows and ALWAYS includes it on save,
    // so a save from any tab cannot wipe per-class overrides. Pin that the engine preserves them.
    const once = b.resolveBhiConfig({ classModeWeights: { Culvert: { Road: { substructure: 0.5, deck: -2 } } } })
    expect(once.classModeWeights.Culvert.Road.substructure).toBe(0.5)
    // junk (-2) dropped → the bucket inherits the effective Road weight (no mode override here → default)
    expect(once.classModeWeights.Culvert.Road.deck).toBe(b.DEFAULT_MODE_WEIGHTS.Road.deck)
    const twice = b.resolveBhiConfig(JSON.stringify(once))
    expect(twice).toEqual(once) // idempotent: save→reload→save cannot drift the per-class block
  })

  test('a per-class override inherits a mode-level override, then applies its own delta (precedence class → mode → default)', () => {
    const cfg = b.resolveBhiConfig({ modeWeights: { Road: { deck: 0.4 } }, classModeWeights: { Culvert: { Road: { substructure: 0.5 } } } })
    expect(cfg.classModeWeights.Culvert.Road.substructure).toBe(0.5) // class delta
    expect(cfg.classModeWeights.Culvert.Road.deck).toBe(0.4)         // inherited from the mode-level override, not the raw default
  })

  test('the screen renders from these exact keys (no hardcoding): defaults expose modes, buckets, coefficientKeys', () => {
    const modes = Object.keys(b.DEFAULT_MODE_WEIGHTS)
    expect(modes).toEqual(expect.arrayContaining(['Road', 'Rail', 'Pedestrian']))
    expect(Object.keys(b.DEFAULT_MODE_WEIGHTS.Road)).toEqual(expect.arrayContaining(['deck', 'superstructure', 'substructure']))
    expect(Object.keys(b.DEFAULT_ENV_COEFFICIENTS)).toEqual(expect.arrayContaining(['ageSpanYears', 'floodStep', 'rslUtilisation']))
  })
})
