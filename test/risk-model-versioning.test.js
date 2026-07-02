const cds = require('@sap/cds')

// Governed Risk versioning (clone → tune draft → activate), mirroring BHI. Integration test over
// the real RiskModel tables + the store: proves the engine's ACTIVE factor weights + band ladder
// only change when a draft is activated, and that per-class resolution + engine shape hold.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const store = require('../srv/lib/risk-model-store')
const riskLib = require('../srv/lib/risk')

describe('Risk model versioning + engine integration', () => {
  let db
  beforeAll(async () => { db = await cds.connect.to('db') })

  test('seed produces a default Active model whose rows feed the engine', async () => {
    await store.ensureSeed(db, { changedBy: 'test' })
    const active = await store.loadActiveModel(db)
    expect(active.model.status).toBe('Active')
    // factorRows are RiskConfig-shaped → weightsFromConfig yields the expected weight map
    const weights = riskLib.weightsFromConfig(active.factorRows)
    expect(Object.keys(weights).length).toBeGreaterThan(0)
    // bandRows are RiskBand-shaped → bandsFromConfig yields a valid ladder (or null)
    const bands = riskLib.bandsFromConfig(active.bandRows)
    expect(bands).not.toBeNull()
    expect(bands[bands.length - 1].min).toBe(0) // lowest band covers 0
  })

  test('clone → tune draft → activate flips the engine config (v1 retired)', async () => {
    const v1 = await store.loadActiveModel(db)
    const clone = await store.cloneModel(db, v1.model.ID, { name: 'Coastal risk', changedBy: 'test' })
    expect(clone.status).toBe('Draft')
    expect(clone.version).toBe(2)

    // tune ONLY the draft: bump a factor weight + keep a valid band ladder
    const draftRaw = await store.loadModel(db, clone.modelID)
    const factors = draftRaw.factors.map(f => ({ assetClass: f.assetClass, factorKey: f.factorKey, name: f.name, weight: f.factorKey === 'consequence_importance' ? 9 : f.weight }))
    const bands = draftRaw.bands.map(b => ({ assetClass: b.assetClass, code: b.code, name: b.name, minScore: b.minScore, maxScore: b.maxScore, colour: b.colour, sortOrder: b.sortOrder }))
    await store.saveToModel(db, clone.modelID, { factors, bands }, { changedBy: 'test' })

    // active (v1) still has the original weight; draft has 9
    const activeStill = await store.loadActiveModel(db)
    expect(riskLib.weightsFromConfig(activeStill.factorRows).consequence_importance).not.toBe(9)
    const draftLoaded = await store.loadActiveModel(db) // still v1
    expect(draftLoaded.model.version).toBe(1)

    // activate the draft
    const act = await store.activateModel(db, clone.modelID, { changedBy: 'test' })
    expect(act.retired).toBe(1)
    const nowActive = await store.loadActiveModel(db)
    expect(nowActive.model.version).toBe(2)
    expect(riskLib.weightsFromConfig(nowActive.factorRows).consequence_importance).toBe(9) // engine now sees it

    const list = await store.listModels(db)
    expect(list.find(m => m.version === 1).status).toBe('Retired')
    expect(list.find(m => m.version === 2).status).toBe('Active')
  })

  test('per-class factor override resolves over the global default', async () => {
    const active = await store.loadActiveModel(db)
    // add a Culvert-specific override for one factor, keep the rest global
    const factors = active.factors.map(f => ({ assetClass: f.assetClass, factorKey: f.factorKey, name: f.name, weight: f.weight }))
    factors.push({ assetClass: 'Culvert', factorKey: 'likelihood_condition', name: 'Condition', weight: 5 })
    const bands = active.bands.map(b => ({ assetClass: b.assetClass, code: b.code, name: b.name, minScore: b.minScore, maxScore: b.maxScore, colour: b.colour, sortOrder: b.sortOrder }))
    await store.saveToModel(db, active.model.ID, { factors, bands }, { changedBy: 'test' })

    const forCulvert = await store.loadActiveModel(db, 'Culvert')
    const forOther = await store.loadActiveModel(db, 'Road Bridge')
    expect(riskLib.weightsFromConfig(forCulvert.factorRows).likelihood_condition).toBe(5)   // class override
    expect(riskLib.weightsFromConfig(forOther.factorRows).likelihood_condition).not.toBe(5) // global default
  })

  test('a Retired version cannot be edited', async () => {
    const list = await store.listModels(db)
    const retired = list.find(m => m.status === 'Retired')
    await expect(store.saveToModel(db, retired.ID, { factors: [], bands: [] }, {})).rejects.toThrow(/Retired/)
  })
})
