const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE } = cds.ql

// Council B6b — Active-model in-place edit governance, through the service layer:
//   • A model that is ACTIVE and referenced by at least one ACTIVE assessment is the stated
//     audit basis of stored runs: MATERIAL edits (weights, value bands, bindings, rules,
//     aggregation method) are REJECTED with 409 directing the admin to clone-to-new-version.
//   • Non-material fields (description / notes-type) stay editable on an Active model.
//   • Draft models — including a fresh cloneModel result — stay freely editable end-to-end.
//   • cloneModel deep-copies the FULL bundle (model + criteria + bindings + value bands +
//     class weights + rules + user-type weights) to version=max(version)+1, status='Draft',
//     with NEW UUIDs and remapped criterion references, and the clone is ChangeLogged.
// NOTE: these Model Builder entities are plain CRUD (NOT draft-enabled), so programmatic
// service-level UPDATE/action calls exercise the real user path.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const asAdmin = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'adm', roles: ['view', 'manage', 'admin'] }) }, fn))
const asManager = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'mgr', roles: ['view', 'manage'] }) }, fn))

const NS = 'bridge.management.'
const PACK_ID = '00000000-0000-4000-9100-000000000002' // seeded NSW-PACK-V1 v1 (Active)
const RISK_ID = '00000000-0000-4000-9100-000000000001' // seeded NSW-RISK-V1 v1 (Active, delegation)
const SRV = {
  Models: 'PrioritisationService.Models',
  ClassWeights: 'PrioritisationService.ModelClassWeights',
  ValueBands: 'PrioritisationService.ModelValueBands'
}

describe('Model governance (council B6b — Active-model edit guard + cloneModel)', () => {
  beforeAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(INSERT.into(NS + 'Bridges').entries({
      ID: 990601, bridgeId: 'BRG-GUARD-1', bridgeName: 'Guard Test Bridge',
      assetClass: 'Road Bridge', transportMode: 'Road', status: 'Active',
      conditionRating: 4, structuralAdequacyRating: 5, lastInspectionDate: '2026-01-01'
    }))
    // Create the guard's trigger condition: an ACTIVE assessment referencing NSW-PACK-V1 v1.
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    expect(res.scored).toBeGreaterThanOrEqual(1)
  })

  test('guard: a weight PATCH on a referenced Active model is REJECTED 409 → clone to a new version', async () => {
    const db = await cds.connect.to('db')
    const weight = await db.run(SELECT.one.from(NS + 'AssetClassCriterionWeight').where({ model_ID: PACK_ID }))
    expect(weight).toBeTruthy()
    let err
    try {
      await asAdmin((tx) => tx.run(UPDATE(SRV.ClassWeights).set({ weight: 9.9 }).where({ ID: weight.ID })))
    } catch (e) { err = e }
    expect(err).toBeTruthy()
    expect(String(err.code || err.status)).toBe('409')
    expect(err.message).toMatch(/cloneModel|new Draft version/i) // directs to the governed path
    const after = await db.run(SELECT.one.from(NS + 'AssetClassCriterionWeight').where({ ID: weight.ID }))
    expect(Number(after.weight)).toBe(Number(weight.weight)) // the stored basis is untouched
  })

  test('guard: a value-band score edit is rejected too (ownership resolved via the criterion)', async () => {
    const db = await cds.connect.to('db')
    const crits = await db.run(SELECT.from(NS + 'ModelCriterion').columns('ID').where({ model_ID: PACK_ID }))
    const band = await db.run(SELECT.one.from(NS + 'CriterionValueBand')
      .where({ criterion_ID: { in: crits.map((c) => c.ID) } }))
    expect(band).toBeTruthy()
    await expect(asAdmin((tx) => tx.run(UPDATE(SRV.ValueBands).set({ score: 1 }).where({ ID: band.ID }))))
      .rejects.toThrow(/cloneModel|new Draft version/i)
    const after = await db.run(SELECT.one.from(NS + 'CriterionValueBand').where({ ID: band.ID }))
    expect(Number(after.score)).toBe(Number(band.score))
  })

  test('non-material fields STAY editable on a referenced Active model (description)', async () => {
    await asAdmin((tx) => tx.run(UPDATE(SRV.Models)
      .set({ description: 'Updated governance narrative only' }).where({ ID: PACK_ID })))
    const db = await cds.connect.to('db')
    const m = await db.run(SELECT.one.from(NS + 'PrioritisationModel').where({ ID: PACK_ID }))
    expect(m.description).toBe('Updated governance narrative only')
    expect(m.status).toBe('Active') // still the active model — only the narrative moved
  })

  test('an ACTIVE model with NO active assessment references stays editable (guard needs BOTH conditions)', async () => {
    const db = await cds.connect.to('db')
    // NSW-RISK-V1 is Active but scoreFleet skips delegation models — no active run references it.
    const refs = await db.run(SELECT.from(NS + 'PrioritisationAssessment')
      .where({ modelCode: 'NSW-RISK-V1', active: true }))
    expect(refs.length).toBe(0)
    const w = await db.run(SELECT.one.from(NS + 'AssetClassCriterionWeight').where({ model_ID: RISK_ID }))
    await asAdmin((tx) => tx.run(UPDATE(SRV.ClassWeights).set({ weight: 3.6 }).where({ ID: w.ID })))
    const after = await db.run(SELECT.one.from(NS + 'AssetClassCriterionWeight').where({ ID: w.ID }))
    expect(Number(after.weight)).toBe(3.6)
    // restore the seed value so this file leaves the shared in-memory db canonical
    await asAdmin((tx) => tx.run(UPDATE(SRV.ClassWeights).set({ weight: w.weight }).where({ ID: w.ID })))
  })

  test('cloneModel: deep-copies the COMPLETE bundle to a new Draft version (counts match source) and the Draft stays editable', async () => {
    const db = await cds.connect.to('db')
    const srcCrits = await db.run(SELECT.from(NS + 'ModelCriterion').where({ model_ID: PACK_ID }))
    const srcCritIds = srcCrits.map((c) => c.ID)
    const src = {
      criteria: srcCrits.length,
      bindings: (await db.run(SELECT.from(NS + 'CriterionSourceBinding').where({ criterion_ID: { in: srcCritIds } }))).length,
      bands: (await db.run(SELECT.from(NS + 'CriterionValueBand').where({ criterion_ID: { in: srcCritIds } }))).length,
      classWeights: (await db.run(SELECT.from(NS + 'AssetClassCriterionWeight').where({ model_ID: PACK_ID }))).length,
      rules: (await db.run(SELECT.from(NS + 'AggregationRule').where({ model_ID: PACK_ID }))).length,
      userTypeWeights: (await db.run(SELECT.from(NS + 'UserTypeCriterionWeight').where({ model_ID: PACK_ID }))).length
    }
    Object.values(src).forEach((n) => expect(n).toBeGreaterThan(0)) // a real bundle, not a trivial copy

    const res = await asAdmin((tx) => tx.send('cloneModel', { modelID: PACK_ID }))
    expect(res.code).toBe('NSW-PACK-V1')
    expect(res.version).toBe(2)        // max(version)+1 for the code
    expect(res.status).toBe('Draft')
    expect(res.modelID).not.toBe(PACK_ID)
    expect(res.criteria).toBe(src.criteria)
    expect(res.bindings).toBe(src.bindings)
    expect(res.bands).toBe(src.bands)
    expect(res.classWeights).toBe(src.classWeights)
    expect(res.rules).toBe(src.rules)
    expect(res.userTypeWeights).toBe(src.userTypeWeights)

    // The clone is a REAL bundle in the database with NEW UUIDs and remapped references.
    const clone = await db.run(SELECT.one.from(NS + 'PrioritisationModel').where({ ID: res.modelID }))
    expect(clone.status).toBe('Draft')
    expect(clone.version).toBe(2)
    expect(clone.reviewedBy).toBeFalsy() // a clone is not signed off
    const cloneCrits = await db.run(SELECT.from(NS + 'ModelCriterion').where({ model_ID: res.modelID }))
    expect(cloneCrits.length).toBe(src.criteria)
    const srcIdSet = new Set(srcCritIds)
    cloneCrits.forEach((c) => expect(srcIdSet.has(c.ID)).toBe(false)) // new UUIDs throughout
    const cloneIdSet = new Set(cloneCrits.map((c) => c.ID))
    const cloneBindings = await db.run(SELECT.from(NS + 'CriterionSourceBinding').where({ criterion_ID: { in: [...cloneIdSet] } }))
    expect(cloneBindings.length).toBe(src.bindings)
    const cloneBands = await db.run(SELECT.from(NS + 'CriterionValueBand').where({ criterion_ID: { in: [...cloneIdSet] } }))
    expect(cloneBands.length).toBe(src.bands)
    const cloneWeights = await db.run(SELECT.from(NS + 'AssetClassCriterionWeight').where({ model_ID: res.modelID }))
    expect(cloneWeights.length).toBe(src.classWeights)
    cloneWeights.forEach((w) => expect(cloneIdSet.has(w.criterion_ID)).toBe(true)) // remapped INTO the clone
    const cloneRules = await db.run(SELECT.from(NS + 'AggregationRule').where({ model_ID: res.modelID }))
    expect(cloneRules.length).toBe(src.rules)
    cloneRules.forEach((r) => { if (r.criterion_ID) expect(cloneIdSet.has(r.criterion_ID)).toBe(true) })
    const cloneUtw = await db.run(SELECT.from(NS + 'UserTypeCriterionWeight').where({ model_ID: res.modelID }))
    expect(cloneUtw.length).toBe(src.userTypeWeights)
    cloneUtw.forEach((u) => { if (u.criterion_ID) expect(cloneIdSet.has(u.criterion_ID)).toBe(true) })

    // ChangeLogged (locked rule 3) with the source linkage.
    const logs = await db.run(SELECT.from(NS + 'ChangeLog')
      .where({ objectType: 'PrioritisationModels', objectId: String(res.modelID) }))
    expect(logs.some((l) => l.fieldName === 'clonedFrom' && String(l.newValue) === PACK_ID)).toBe(true)
    expect(logs.some((l) => l.fieldName === 'status' && l.newValue === 'Draft')).toBe(true)

    // …and the Draft is freely editable: the SAME weight PATCH the Active model rejected.
    const cw = cloneWeights[0]
    await asAdmin((tx) => tx.run(UPDATE(SRV.ClassWeights).set({ weight: 7.5 }).where({ ID: cw.ID })))
    const edited = await db.run(SELECT.one.from(NS + 'AssetClassCriterionWeight').where({ ID: cw.ID }))
    expect(Number(edited.weight)).toBe(7.5)
  })

  test('cloneModel is admin-gated and 404s on an unknown model', async () => {
    await expect(asManager((tx) => tx.send('cloneModel', { modelID: PACK_ID }))).rejects.toThrow()
    await expect(asAdmin((tx) => tx.send('cloneModel', { modelID: cds.utils.uuid() }))).rejects.toThrow(/not found/i)
  })
})
