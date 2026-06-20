const cds = require('@sap/cds')
const { INSERT, DELETE, SELECT } = cds.ql

// P3: targeted handler-behaviour coverage. Much handler logic is already exercised
// indirectly (bulk-operations.test.js, riskband-ladder-guard.test.js) or is thin wiring
// over unit-tested srv/lib/* modules. These tests close the meaningful GAPS: the
// soft-delete guard (CLAUDE.md §2.2 locked rule) and the SAVE-time condition derivation.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const asAdmin = (fn) => {
  return cds.connect.to('AdminService').then(srv =>
    srv.tx({ user: new cds.User({ id: 'admin', roles: ['manage', 'admin'] }) }, fn.bind(null, srv)))
}

describe('handler guards — soft-delete (CLAUDE.md §2.2)', () => {
  // Hard DELETE on tunable config must be rejected so the ChangeLog historises superseded
  // values (set active=false instead). It is DOUBLY protected: the server-enforced
  // @Capabilities.DeleteRestrictions fires first (ENTITY_IS_NOT_CRUD), and the custom
  // before('DELETE') guard (admin-service.js) backs it. Either rejection satisfies §2.2.
  const cases = ['AssetClassStrategy', 'RiskConfig', 'RiskBand']
  cases.forEach(entity => {
    test(`hard DELETE on ${entity} is rejected (soft-delete only)`, async () => {
      await expect(
        asAdmin((_srv, tx) => tx.run(DELETE.from(entity).where({ ID: '00000000-0000-0000-0000-000000000000' })))
      ).rejects.toThrow(/soft-delete|active.*false|NOT_CRUD|not be deleted/i)
    })
  })
})

describe('handler derivation — condition from conditionRating (ARCH-2)', () => {
  const ID = 990078
  afterAll(async () => {
    try {
      const db = await cds.connect.to('db')
      await db.run(DELETE.from('bridge.management.Bridges').where({ ID }))
      await db.run(DELETE.from('bridge.management.ChangeLog').where({ objectId: String(ID) }))
    } catch (_e) { /* ignore */ }
  })

  test('massEditBridges derives a low condition band + high-priority flag for a poor rating', async () => {
    const db = await cds.connect.to('db')
    await db.run(INSERT.into('bridge.management.Bridges').entries({
      ID, bridgeId: 'BRG-TEST-HANDLER', bridgeName: 'Handler Test Bridge', state: 'NSW', conditionRating: 9
    }))
    const bms = await cds.connect.to('BridgeManagementService')
    await bms.tx({ user: new cds.User({ id: 'mgr', roles: ['manage', 'admin'] }) },
      tx => tx.send('massEditBridges', { rows: [{ ID, conditionRating: 2 }] }))
    const after = await db.run(SELECT.one.from('bridge.management.Bridges').where({ ID }))
    expect(Number(after.conditionRating)).toBe(2)
    // 1-10 scale, 10=best -> a rating of 2 is a poor band; high-priority asset = band >= 4.
    expect(after.highPriorityAsset).toBe(true)
  })
})
