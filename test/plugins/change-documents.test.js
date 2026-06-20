const cds = require('@sap/cds')
const { INSERT, DELETE } = cds.ql

// ISOLATION TEST for the reusable `change-documents` plugin — standalone (only this plugin
// required). Verifies filtered/sorted merge + injection-safe CSV. No sibling plugin loaded.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/../..')

const changeDocs = require('../../srv/lib/plugins/change-documents')

describe('plugin: change-documents (isolation)', () => {
  const OT = 'PlugDocTest'
  beforeAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(INSERT.into('bridge.management.ChangeLog').entries([
      { ID: cds.utils.uuid(), changedAt: '2026-06-10T10:00:00Z', changedBy: 'u1', objectType: OT, objectId: '1', objectName: 'One', fieldName: 'a', oldValue: '1', newValue: '2', changeSource: 'OData', batchId: null },
      { ID: cds.utils.uuid(), changedAt: '2026-06-12T10:00:00Z', changedBy: 'u2', objectType: OT, objectId: '2', objectName: 'Two', fieldName: 'b', oldValue: 'x', newValue: 'y', changeSource: 'MassEdit', batchId: 'B1' }
    ]))
  })
  afterAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from('bridge.management.ChangeLog').where({ objectType: OT }))
  })

  test('returns the change-log rows for a filter, newest first', async () => {
    const db = await cds.connect.to('db')
    const rows = await changeDocs.buildChangeDocuments(db, { filters: { objectType: OT } })
    expect(rows.length).toBe(2)
    expect(rows[0].objectId).toBe('2')   // 2026-06-12 sorts before 2026-06-10
    expect(rows[1].objectId).toBe('1')
  })

  test('source filter narrows the result', async () => {
    const db = await cds.connect.to('db')
    const rows = await changeDocs.buildChangeDocuments(db, { filters: { objectType: OT, source: 'MassEdit' } })
    expect(rows.length).toBe(1)
    expect(rows[0].changeSource).toBe('MassEdit')
  })

  test('toCsv produces a header + injection-safe cells', () => {
    const csv = changeDocs.toCsv([
      { changedAt: '2026-06-12T10:00:00Z', changedBy: 'u', objectType: 'X', objectName: 'N', fieldName: 'f', oldValue: '=cmd()', newValue: 'a,b', changeSource: 'OData', batchId: null }
    ])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('changedAt,changedBy,objectType,objectName,fieldName,oldValue,newValue,changeSource,batchId')
    expect(lines[1]).toContain("'=cmd()")     // formula-injection prefixed
    expect(lines[1]).toContain('"a,b"')        // comma-bearing cell quoted
  })
})
