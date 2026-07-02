'use strict'

// Per-asset-class BHI/BSI weighting (additive uplift). The engine resolves element-weight sets
// with precedence (assetClass+mode → mode → Road). A class override changes the computed BSI;
// classes without an override are byte-identical to the legacy per-mode behaviour.

const bhi = require('../srv/lib/bhi')

// substructure 2 (bad), deck 10 (good): heavier substructure weighting drags BSI down.
const ELEMENTS = [
  { elementType: 'deck', conditionRating: 10 },
  { elementType: 'pier', conditionRating: 2 } // -> substructure bucket
]
const ENV = { age: 0 }

describe('[BHI uplift] per-asset-class element weighting', () => {
  // A config that weights substructure MUCH heavier, but only for the "Culvert" class on Road.
  const cfg = bhi.resolveBhiConfig({
    classModeWeights: {
      Culvert: { Road: { substructure: 0.5 } },
      Bad: { Road: { deck: -5, substructure: 'oops' } } // hardening: ignored
    }
  })

  it('resolveBhiConfig parses class overrides + merges over the mode default', () => {
    expect(cfg.classModeWeights.Culvert.Road.substructure).toBe(0.5)
    // deck not overridden for Culvert -> inherits the Road default (0.25)
    expect(cfg.classModeWeights.Culvert.Road.deck).toBe(0.25)
  })

  it('hardening: non-finite / negative class overrides are ignored (default holds)', () => {
    // deck:-5 ignored -> stays at Road default 0.25; substructure:'oops' ignored -> 0.20
    expect(cfg.classModeWeights.Bad.Road.deck).toBe(0.25)
    expect(cfg.classModeWeights.Bad.Road.substructure).toBe(0.20)
  })

  it('weightsFor: precedence (class+mode -> mode -> Road)', () => {
    expect(bhi.weightsFor('Road', false, cfg, 'Culvert').substructure).toBe(0.5)   // class override
    expect(bhi.weightsFor('Road', false, cfg, 'Beam Bridge').substructure).toBe(0.20) // no override -> mode default
    expect(bhi.weightsFor('Road', false, cfg).substructure).toBe(0.20)              // no class -> mode default (back-compat)
  })

  it('computeBSI: the class override actually changes the score', () => {
    const def = bhi.computeBSI(ELEMENTS, 'Road', ENV, cfg).bsi              // mode default
    const culvert = bhi.computeBSI(ELEMENTS, 'Road', ENV, cfg, 'Culvert').bsi // heavier substructure
    const beam = bhi.computeBSI(ELEMENTS, 'Road', ENV, cfg, 'Beam Bridge').bsi // no override
    expect(culvert).toBeLessThan(def)   // heavier weight on the bad substructure pulls BSI down
    expect(beam).toBe(def)              // class with no override == default (back-compat)
  })

  it('back-compat: omitting classModeWeights entirely behaves like the legacy engine', () => {
    const legacyCfg = bhi.resolveBhiConfig({ modeWeights: { Road: { deck: 0.25 } } })
    expect(legacyCfg.classModeWeights).toEqual({})
    // computeBSI with no assetClass uses the per-mode default exactly as before
    const a = bhi.computeBSI(ELEMENTS, 'Road', ENV, legacyCfg).bsi
    const b = bhi.computeBSI(ELEMENTS, 'Road', ENV, legacyCfg, 'AnyClass').bsi
    expect(a).toBe(b)
  })
})
