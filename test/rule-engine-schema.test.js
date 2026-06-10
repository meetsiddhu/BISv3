const cds = require('@sap/cds')
const { SELECT } = cds.ql
const engine = require('../srv/lib/prioritisation')

// Phase 1 gate: the rule-engine schema is ADDITIVE and the seeded default model NSW-RISK-V1
// faithfully mirrors the approved design — so existing behaviour cannot change.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const M = 'bridge.management.PrioritisationModel'
const C = 'bridge.management.ModelCriterion'
const B = 'bridge.management.CriterionSourceBinding'
const W = 'bridge.management.AssetClassCriterionWeight'
const V = 'bridge.management.CriterionValueBand'

describe('Rule-engine schema + NSW-RISK-V1 seed (Phase 1)', () => {
  test('NSW-RISK-V1 is seeded Active with the delegation aggregation method', async () => {
    const db = await cds.connect.to('db')
    const m = await db.run(SELECT.one.from(M).where({ code: 'NSW-RISK-V1' }))
    expect(m).toBeTruthy()
    expect(m.status).toBe('Active')
    expect(m.version).toBe(1)
    expect(m.aggregationMethod).toBe('RiskCritBlend-v1') // byte-identical delegation (Phase 0 Q1)
    expect(m.reviewedBy).toBeTruthy() // governance sign-off present
  })

  test('the approved five dimensions + likelihood are catalogue rows with rubrics', async () => {
    const db = await cds.connect.to('db')
    const crits = await db.run(SELECT.from(C).where({ active: true }).orderBy('displayOrder'))
    expect(crits.map(c => c.code)).toEqual(['SAFETY', 'NETWORK', 'FINANCIAL', 'ENVIRONMENTAL', 'REPUTATIONAL', 'LIKELIHOOD'])
    for (const c of crits) {
      const rub = JSON.parse(c.rubric)
      expect(Object.keys(rub).sort()).toEqual(['1', '2', '3', '4', '5'])
      expect(c.standardRef).toBeTruthy()
      expect(c.valueType).toBe('Level1to5')
    }
    // rubric wording mirrors the engine's single source of truth (no fork)
    const safety = crits.find(c => c.code === 'SAFETY')
    expect(JSON.parse(safety.rubric)['5']).toBe(engine.DEFAULT_RUBRICS.dimSafety[5])
  })

  test('class weights mirror the live PrioritisationConfig dimension weights (normalised-equal)', async () => {
    const db = await cds.connect.to('db')
    const cfgRow = await db.run(SELECT.one.from('bridge.management.PrioritisationConfig').where({ active: true }))
    const cfg = engine.resolveConfig(cfgRow || {})
    const weights = await db.run(SELECT.from(W).orderBy('ID'))
    expect(weights).toHaveLength(6)
    expect(weights.every(w => w.assetClass === '*' && w.transportMode === '*')).toBe(true)
    expect(weights.every(w => w.missingDataPolicy === 'flag')).toBe(true) // never silent-zero
    const crits = await db.run(SELECT.from(C))
    const byCode = Object.fromEntries(weights.map(w => [crits.find(c => c.ID === w.criterion_ID).code, Number(w.weight)]))
    // dims normalised must equal the engine's normalised config weights exactly
    const dimCodes = ['SAFETY', 'NETWORK', 'FINANCIAL', 'ENVIRONMENTAL', 'REPUTATIONAL']
    const seeded = engine.normalise(dimCodes.map(c => byCode[c]))
    const live = engine.normalise(cfg.dimWeights)
    seeded.forEach((v, i) => expect(v).toBeCloseTo(live[i], 10))
    expect(byCode.LIKELIHOOD).toBe(0) // enters multiplicatively via residual, not the sum
  })

  test('bindings + value bands seeded; likelihood has derived-default + manual bindings', async () => {
    const db = await cds.connect.to('db')
    const binds = await db.run(SELECT.from(B))
    expect(binds).toHaveLength(7)
    expect(binds.filter(b => b.sourceType === 'Manual')).toHaveLength(6)
    expect(binds.find(b => b.sourceType === 'Derived').sourceRef).toBe('deriveLikelihood')
    const bands = await db.run(SELECT.from(V))
    expect(bands).toHaveLength(30) // 6 criteria x 5 levels
    expect(bands.every(b => Number(b.score) >= 0 && Number(b.score) <= 100)).toBe(true)
  })

  test('ZERO REGRESSION: a legacy run (null modelCode) still computes identically end-to-end', async () => {
    const db = await cds.connect.to('db')
    let bridge = await db.run(SELECT.one.from('bridge.management.Bridges').columns('ID'))
    if (!bridge) {
      await db.run(cds.ql.INSERT.into('bridge.management.Bridges').entries({
        ID: 990301, bridgeId: 'BRG-RE-P1', bridgeName: 'Rule Engine P1 Bridge',
        conditionRating: 4, structuralAdequacyRating: 5, loadRating: 42, lastInspectionDate: '2025-10-01'
      }))
      bridge = { ID: 990301 }
    }
    const srv = await cds.connect.to('PrioritisationService')
    const created = await srv.tx({ user: new cds.User({ id: 'mgr', roles: ['view', 'manage'] }) }, (tx) =>
      tx.run(cds.ql.INSERT.into('PrioritisationService.Assessments').entries({
        bridge_ID: bridge.ID, dimSafety: 5, dimNetwork: 4, dimFinancial: 3,
        dimEnvironmental: 2, dimReputational: 4, likelihood: 4, strategy: 'Renew'
      })))
    const id = created.ID || (created[0] && created[0].ID)
    const row = await db.run(SELECT.one.from('bridge.management.PrioritisationAssessment').where({ ID: id }))
    // the additive columns exist and are simply null for legacy runs — nothing else changed
    expect(row.modelCode).toBeNull()
    expect(row.weightSetHash).toBeNull()
    // and the score equals the engine's direct output for the same inputs (unchanged path)
    const cfg = engine.resolveConfig(await db.run(SELECT.one.from('bridge.management.PrioritisationConfig').where({ active: true })) || {})
    const expected = engine.derivePriority({ dimSafety: 5, dimNetwork: 4, dimFinancial: 3, dimEnvironmental: 2, dimReputational: 4, likelihood: 4, strategy: 'Renew' }, cfg)
    expect(Number(row.priorityScore)).toBe(expected.priorityScore)
    expect(row.band).toBe(expected.band)
  })
})
