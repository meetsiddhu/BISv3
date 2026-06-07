const cds = require('@sap/cds')
const { INSERT, SELECT, DELETE } = cds.ql

// OPS-T3: integration coverage for the bulk mass-edit path — the class of code (direct
// SELECT/UPDATE + post-update durable audit) where the historical import bug lived.
// Force an in-memory DB so cds.test auto-deploys the schema + seed (the project's default
// db is a file url, which would not auto-deploy). cds.test() runs at describe scope.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

describe('bulk operations integration (OPS-T3)', () => {
  const ID = 990077
  // run the @restrict'd action as a user holding the manage role
  const asManager = async (rows) => {
    const srv = await cds.connect.to('BridgeManagementService')
    return srv.tx({ user: new cds.User({ id: 'mgr', roles: ['manage', 'admin'] }) },
      (tx) => tx.send('massEditBridges', { rows }))
  }

  afterAll(async () => {
    try {
      const db = await cds.connect.to('db')
      await db.run(DELETE.from('bridge.management.Bridges').where({ ID }))
      await db.run(DELETE.from('bridge.management.ChangeLog').where({ objectId: String(ID) }))
    } catch (e) { /* ignore */ }
  })

  test('massEditBridges updates condition AND writes a durable MassEdit audit', async () => {
    const srv = await cds.connect.to('BridgeManagementService')
    const db = await cds.connect.to('db')
    await db.run(INSERT.into('bridge.management.Bridges').entries({
      ID, bridgeId: 'BRG-TEST-OPS', bridgeName: 'Test Bridge', state: 'NSW', conditionRating: 8
    }))

    const res = await asManager([{ ID, conditionRating: 4 }])
    expect(res.updated).toBe(1)
    expect(res.failed).toBe(0)

    const b = await db.run(SELECT.one.from('bridge.management.Bridges').where({ ID }))
    expect(b.conditionRating).toBe(4)
    expect(b.condition).toBe('Very Poor')        // canonical legacy-4 -> TfNSW band
    expect(b.highPriorityAsset).toBe(true)

    const logs = await db.run(SELECT.from('bridge.management.ChangeLog')
      .where({ objectId: String(ID), changeSource: 'MassEdit' }))
    expect(logs.length).toBeGreaterThan(0)
    expect(logs.some(l => l.fieldName === 'conditionRating')).toBe(true)
  })

  test('massEditBridges reports a row failure for an unknown bridge (no silent loss)', async () => {
    const srv = await cds.connect.to('BridgeManagementService')
    const res = await asManager([{ ID: 999999, conditionRating: 3 }])
    expect(res.failed).toBe(1)
    expect(res.updated).toBe(0)
  })

  // Regression note: the riskCriticality calculated element on the draft-enabled Bridges
  // projection must use a SEARCHED case (`case when riskPriority = 'High'`), not a simple
  // `case riskPriority when 'High'`, because the CAP draft engine mis-translates the simple
  // form to invalid `when ? = true` SQL on HANA and 500s draftEdit. Verified live on HANA.

  test('massEditBridges rejects an out-of-range condition rating', async () => {
    const srv = await cds.connect.to('BridgeManagementService')
    const db = await cds.connect.to('db')
    await db.run(INSERT.into('bridge.management.Bridges').entries({ ID: ID + 1, bridgeId: 'BRG-TEST-OPS2', bridgeName: 'T2', state: 'NSW' }))
    const res = await asManager([{ ID: ID + 1, conditionRating: 99 }])
    expect(res.failed).toBe(1)
    await db.run(DELETE.from('bridge.management.Bridges').where({ ID: ID + 1 }))
  })
})
