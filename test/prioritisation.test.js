const p = require('../srv/lib/prioritisation')

const cfg = p.resolveConfig({}) // defaults == approved wireframe
const mk = (o) => Object.assign({ dimSafety: 3, dimNetwork: 3, dimFinancial: 3, dimEnvironmental: 3, dimReputational: 3, likelihood: 4, strategy: 'Renew' }, o)

describe('prioritisation engine — wireframe fidelity', () => {
  test('default Assess state reproduces the wireframe numbers exactly', () => {
    const r = p.derivePriority(mk({}), cfg)
    expect(r.criticality).toBe(3)
    expect(r.tier).toBe(3)
    expect(r.residual).toBe(12)
    expect(r.riskN).toBe(48)
    expect(r.critN).toBe(60)
    expect(r.stratN).toBe(80)
    expect(r.priorityScore).toBe(59)
    expect(r.band).toBe('P3')
  })

  test('max inputs -> P1, min inputs -> P5 (band floor, no crash)', () => {
    const hi = p.derivePriority(mk({ dimSafety: 5, dimNetwork: 5, dimFinancial: 5, dimEnvironmental: 5, dimReputational: 5, likelihood: 5 }), cfg)
    expect(hi.tier).toBe(5)
    expect(hi.band).toBe('P1')
    const lo = p.derivePriority(mk({ dimSafety: 1, dimNetwork: 1, dimFinancial: 1, dimEnvironmental: 1, dimReputational: 1, likelihood: 1, strategy: 'Monitor' }), cfg)
    expect(lo.tier).toBe(1)
    expect(lo.band).toBe('P5') // a sub-20 score must floor to P5, never undefined/throw
  })

  test('tier rounds half-up and clamps to 1..5', () => {
    expect(p.tierOf(2.5)).toBe(3)
    expect(p.tierOf(3.5)).toBe(4)
    expect(p.tierOf(0.2)).toBe(1)
    expect(p.tierOf(9)).toBe(5)
  })

  test('band lookup never throws and floors below the lowest threshold', () => {
    expect(p.bandOf(-100, cfg.bandThresholds)).toBe('P5')
    expect(p.bandOf(80, cfg.bandThresholds)).toBe('P1') // boundary inclusive
    expect(p.bandOf(79.9, cfg.bandThresholds)).toBe('P2')
  })

  test('restriction is a FLAG, never in the score — residual = likelihood × tier only', () => {
    const r = p.derivePriority(mk({ likelihood: 4 }), cfg)
    expect(r.residual).toBe(4 * r.tier)
    // derivePriority has no restriction parameter; the score is, by construction, independent of it.
    expect('restrictionFlag' in p.derivePriority(mk({}), cfg)).toBe(false)
  })

  test('reproducible: identical (inputs + config) -> byte-identical run', () => {
    const inp = mk({ dimSafety: 4, dimNetwork: 2, dimFinancial: 3, dimEnvironmental: 1, dimReputational: 5, likelihood: 3, strategy: 'Maintain' })
    expect(JSON.stringify(p.derivePriority(inp, cfg))).toBe(JSON.stringify(p.derivePriority(inp, cfg)))
  })

  test('replaying a STORED param snapshot reproduces the original run after config changes', () => {
    const inp = mk({ dimSafety: 5, likelihood: 4, strategy: 'Renew' })
    const original = p.derivePriority(inp, cfg)
    // Admin later changes live config (heavier safety weight) — a NEW run would differ...
    const newCfg = p.resolveConfig({ wSafety: 0.9, wNetwork: 0.025, wFinancial: 0.025, wEnvironmental: 0.025, wReputational: 0.025 })
    expect(p.derivePriority(inp, newCfg).priorityScore).not.toBe(original.priorityScore)
    // ...but replaying with the ORIGINAL (stored-snapshot) config still yields the original.
    expect(JSON.stringify(p.derivePriority(inp, cfg))).toBe(JSON.stringify(original))
  })

  test('weights normalise to sum 1 (robust to admin edits that do not sum to 1)', () => {
    expect(p.normalise([0.35, 0.25, 0.15, 0.10, 0.15]).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10)
    expect(p.normalise([2, 2, 1]).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10)
    // doubling all weights leaves the normalised result (and the score) unchanged
    const a = p.derivePriority(mk({}), p.resolveConfig({}))
    const b = p.derivePriority(mk({}), p.resolveConfig({ wRisk: 0.8, wCrit: 0.8, wStrat: 0.4 }))
    expect(b.priorityScore).toBe(a.priorityScore)
  })

  test('non-finite / string config values fall back to documented defaults (no NaN fleet)', () => {
    const bad = p.resolveConfig({ wSafety: 'oops', maxResidual: '', maxCriticality: null, urgencyRenew: undefined })
    const r = p.derivePriority(mk({}), bad)
    expect(Number.isFinite(r.priorityScore)).toBe(true)
    expect(Number.isFinite(r.criticality)).toBe(true)
    expect(r.band).toBeTruthy()
  })

  test('deriveLikelihood: worse condition -> higher likelihood; missing -> neutral 3', () => {
    expect(p.deriveLikelihood(2, 2)).toBeGreaterThanOrEqual(4)
    expect(p.deriveLikelihood(10, 10)).toBe(1)
    expect(p.deriveLikelihood(null, null)).toBe(3)
  })
})
