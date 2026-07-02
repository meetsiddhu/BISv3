const cds = require('@sap/cds')

// Phase 2 — governed BHI versioning (clone → tune the draft → activate). Integration test over
// the real BhiModel tables + the store, proving the C4 "named, copyable versions" capability and
// that the engine's ACTIVE config only changes when a draft is activated (governance).
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const store = require('../srv/lib/bhi-model-store')

describe('BHI model versioning (clone / edit draft / activate)', () => {
  let db
  beforeAll(async () => { db = await cds.connect.to('db') })

  test('seed → clone → edit draft → activate flips the engine config (v1 retired)', async () => {
    await store.ensureSeed(db, { changedBy: 'test' })
    const activeV1 = await store.loadActiveConfig(db)
    expect(activeV1.model.status).toBe('Active')
    expect(activeV1.model.version).toBe(1)

    // clone the active model → a new Draft v2
    const clone = await store.cloneModel(db, activeV1.model.ID, { name: 'Coastal aggressive', changedBy: 'test' })
    expect(clone.status).toBe('Draft')
    expect(clone.version).toBe(2)

    // tune ONLY the draft — the active (v1) must be untouched
    await store.saveToModel(db, clone.modelID, { classModeWeights: { Culvert: { Road: { substructure: 0.5 } } } }, { changedBy: 'test' })
    const draft = await store.loadConfig(db, clone.modelID)
    expect(draft.config.classModeWeights.Culvert.Road.substructure).toBe(0.5)
    const stillActive = await store.loadActiveConfig(db)
    expect(stillActive.model.version).toBe(1)
    expect(Object.keys(stillActive.config.classModeWeights)).toHaveLength(0) // active unaffected

    // activate the draft → it becomes Active, v1 becomes Retired
    const act = await store.activateModel(db, clone.modelID, { changedBy: 'test' })
    expect(act.retired).toBe(1)
    const nowActive = await store.loadActiveConfig(db)
    expect(nowActive.model.ID).toBe(clone.modelID)
    expect(nowActive.model.version).toBe(2)
    expect(nowActive.config.classModeWeights.Culvert.Road.substructure).toBe(0.5) // engine now sees the override

    // listModels shows both versions, active first
    const list = await store.listModels(db)
    expect(list.length).toBeGreaterThanOrEqual(2)
    expect(list[0].status).toBe('Active')
    expect(list.find(m => m.version === 1).status).toBe('Retired')
  })

  test('a Retired version cannot be edited (governance)', async () => {
    const list = await store.listModels(db)
    const retired = list.find(m => m.status === 'Retired')
    expect(retired).toBeTruthy()
    await expect(store.saveToModel(db, retired.ID, {}, { changedBy: 'test' })).rejects.toThrow(/Retired/)
  })
})
