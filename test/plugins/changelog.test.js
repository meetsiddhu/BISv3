const cds = require('@sap/cds')
const { SELECT, DELETE } = cds.ql

// ISOLATION TEST for the reusable `changelog` plugin — exercises it standalone (only the
// plugin module is required; no sibling plugin loaded), proving portability + the two forms.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/../..')

const { auditChange, diffRecords } = require('../../srv/lib/plugins/changelog')

describe('plugin: changelog (isolation)', () => {
  const OID = 'PLUGTEST-CL-1'
  afterAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from('bridge.management.ChangeLog').where({ objectId: OID }))
  })

  test('diffRecords reports only changed, business-meaningful fields', () => {
    const changes = diffRecords(
      { name: 'A', score: 1, modifiedAt: 't1' },
      { name: 'B', score: 1, modifiedAt: 't2' }
    )
    expect(changes).toEqual([{ fieldName: 'name', oldValue: 'A', newValue: 'B' }])
  })

  test('structured form writes one ChangeLog row per field change', async () => {
    const db = await cds.connect.to('db')
    await auditChange(db, {
      objectType: 'PlugTest', objectId: OID, objectName: 'Plugin Test', source: 'API',
      changes: [{ fieldName: 'a', oldValue: '1', newValue: '2' }, { fieldName: 'b', oldValue: 'x', newValue: 'y' }]
    })
    const rows = await db.run(SELECT.from('bridge.management.ChangeLog').where({ objectId: OID, fieldName: 'a' }))
    expect(rows.length).toBe(1)
    expect(rows[0]).toMatchObject({ objectType: 'PlugTest', oldValue: '1', newValue: '2', changeSource: 'API' })
  })

  test('action form writes a single summary row (oldValue null)', async () => {
    const db = await cds.connect.to('db')
    await auditChange(db, {
      objectType: 'PlugTest', objectId: OID, objectName: 'Plugin Test', source: 'OData',
      action: 'DEACTIVATE', description: 'Closed for traffic'
    })
    const rows = await db.run(SELECT.from('bridge.management.ChangeLog').where({ objectId: OID, fieldName: 'DEACTIVATE' }))
    expect(rows.length).toBe(1)
    expect(rows[0].oldValue == null).toBe(true)
    expect(rows[0].newValue).toBe('Closed for traffic')
  })

  test('empty changes array writes nothing', async () => {
    const db = await cds.connect.to('db')
    const before = await db.run(SELECT.from('bridge.management.ChangeLog').where({ objectId: OID }))
    await auditChange(db, { objectType: 'PlugTest', objectId: OID, source: 'API', changes: [] })
    const after = await db.run(SELECT.from('bridge.management.ChangeLog').where({ objectId: OID }))
    expect(after.length).toBe(before.length)
  })
})
