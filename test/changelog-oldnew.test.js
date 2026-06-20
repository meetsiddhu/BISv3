const cds = require('@sap/cds')
const { SELECT } = cds.ql

// Council CD-1 — the Change Documents tile must show what a value changed FROM, not
// just TO. The schema, diff logic and UI binding were already correct; the gap was
// the model-builder edit path logging oldValue:'' instead of fetching the before-image.
// This proves an editable model field now logs a real old→new transition.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const NS = 'bridge.management.'

const asAdmin = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'editor1', roles: ['view', 'manage', 'admin'] }) }, fn))

describe('ChangeLog captures old→new on model-builder edits (CD-1)', () => {
  let weightID, oldWeight

  test('setup: clone an Active model to a Draft we can freely edit', async () => {
    const res = await asAdmin((tx) => tx.send('cloneModel', { modelID: '00000000-0000-4000-9100-000000000002' })) // NSW-PACK-V1
    expect(res.status).toBe('Draft')
    const db = await cds.connect.to('db')
    const w = await db.run(SELECT.one.from(NS + 'AssetClassCriterionWeight').where({ model_ID: res.modelID }))
    weightID = w.ID
    oldWeight = Number(w.weight)
    expect(weightID).toBeTruthy()
  })

  test('editing a class weight logs the REAL previous value (not empty)', async () => {
    const newWeight = oldWeight === 7 ? 3 : 7
    const srv = await cds.connect.to('PrioritisationService')
    await srv.tx({ user: new cds.User({ id: 'editor1', roles: ['view', 'manage', 'admin'] }) }, (tx) =>
      tx.run(cds.ql.UPDATE(srv.entities.ModelClassWeights).set({ weight: newWeight }).where({ ID: weightID })))

    const db = await cds.connect.to('db')
    const logs = await db.run(SELECT.from(NS + 'ChangeLog')
      .where({ objectId: weightID, fieldName: 'weight' }).orderBy({ changedAt: 'desc' }))
    expect(logs.length).toBeGreaterThanOrEqual(1)
    const log = logs[0]
    expect(Number(log.newValue)).toBe(newWeight)
    expect(log.oldValue).not.toBe('')          // the bug was an empty old value
    expect(Number(log.oldValue)).toBe(oldWeight) // it is the genuine prior weight
    expect(log.changedBy).toBe('editor1')
    expect(log.objectType).toBe('PrioritisationModelClassWeights')
  })

  test('a CREATE still logs an empty old value (genuinely no prior value)', async () => {
    // create a brand-new criterion on a draft → oldValue legitimately empty
    const cloneRes = await asAdmin((tx) => tx.send('cloneModel', { modelID: '00000000-0000-4000-9100-000000000002' }))
    const srv = await cds.connect.to('PrioritisationService')
    await srv.tx({ user: new cds.User({ id: 'editor1', roles: ['view', 'manage', 'admin'] }) }, (tx) =>
      tx.run(cds.ql.INSERT.into(srv.entities.ModelCriteria).entries({
        ID: cds.utils.uuid(), model_ID: cloneRes.modelID, code: 'NEWCRIT', name: 'New criterion',
        category: 'Consequence', valueType: 'Level1to5', displayOrder: 99, active: true
      })))
    const db = await cds.connect.to('db')
    const logs = await db.run(SELECT.from(NS + 'ChangeLog')
      .where({ objectType: 'PrioritisationModelCriteria', fieldName: 'code' }).orderBy({ changedAt: 'desc' }))
    const mine = logs.find(l => l.newValue === 'NEWCRIT')
    expect(mine).toBeTruthy()
    expect(mine.oldValue).toBe('') // correct: a create has no "from" value
  })
})
