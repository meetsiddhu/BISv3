'use strict'

// The BhiModel store bridges relational rows ⇄ the engine's config object. These pin the PURE
// transforms (no DB): a config serialised to rows and read back must reproduce the SAME
// normalised config the engine would compute — so migrating BHI storage JSON→relational is
// behaviour-preserving. See srv/lib/bhi-model-store.js + docs/CONFIGURABLE-ENGINES-ASSESSMENT.md.

const store = require('../srv/lib/bhi-model-store')
const bhi = require('../srv/lib/bhi')

const makeGen = () => { let n = 0; return () => `id-${++n}` }

describe('[bhi-model-store] rows ⇄ config round-trip (pure)', () => {
  test('default config → rows → config reproduces the engine defaults', () => {
    const def = bhi.resolveBhiConfig(null)
    const { weights, coefficients } = store.rowsFromConfig(null, { modelId: 'm1', genId: makeGen() })
    // mode-default rows carry assetClass '*'; every mode+bucket present
    expect(weights.length).toBeGreaterThan(0)
    expect(weights.every(w => w.model_ID === 'm1')).toBe(true)
    const back = bhi.resolveBhiConfig(store.configFromRows({ weights, coefficients }))
    expect(back.modeWeights).toEqual(def.modeWeights)
    expect(back.env).toEqual(def.env)
    expect(back.classModeWeights).toEqual(def.classModeWeights)
  })

  test('per-class override survives the row round-trip', () => {
    const input = { classModeWeights: { Culvert: { Road: { substructure: 0.5 } } }, calibrated: ['Road'] }
    const { weights, coefficients } = store.rowsFromConfig(input, { modelId: 'm2', genId: makeGen() })
    // the override lands as a real-assetClass weight row
    expect(weights.some(w => w.assetClass === 'Culvert' && w.mode === 'Road' && w.bucket === 'substructure' && w.weight === 0.5)).toBe(true)
    // calibrated flag rides on the mode-default ('*') Road rows
    expect(weights.some(w => w.assetClass === '*' && w.mode === 'Road' && w.calibrated === true)).toBe(true)
    const back = bhi.resolveBhiConfig(store.configFromRows({ weights, coefficients }))
    const expected = bhi.resolveBhiConfig(input)
    expect(back.classModeWeights.Culvert.Road.substructure).toBe(0.5)
    expect(back.classModeWeights).toEqual(expected.classModeWeights)
    expect(back.calibrated).toEqual(expect.arrayContaining(['Road']))
  })

  test('coefficients round-trip through BhiCoefficient rows', () => {
    const { weights, coefficients } = store.rowsFromConfig({ env: { floodStep: 0.3 } }, { modelId: 'm3', genId: makeGen() })
    expect(coefficients.some(c => c.coeffKey === 'floodStep' && c.coeffValue === 0.3)).toBe(true)
    const back = bhi.resolveBhiConfig(store.configFromRows({ weights, coefficients }))
    expect(back.env.floodStep).toBe(0.3)
  })

  test('configFromRows ignores malformed rows (defensive)', () => {
    const cfg = store.configFromRows({
      weights: [{ assetClass: '*', mode: 'Road', bucket: 'deck', weight: 'x' }, { assetClass: '*', mode: '', bucket: 'deck', weight: 0.2 }],
      coefficients: [{ coeffKey: '', coeffValue: 5 }, { coeffKey: 'floodStep', coeffValue: 'nope' }]
    })
    expect(cfg.modeWeights.Road).toBeUndefined() // weight 'x' dropped; empty-mode row dropped
    expect(cfg.env).toEqual({})                   // both coeff rows invalid
  })
})
