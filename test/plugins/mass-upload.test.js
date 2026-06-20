const cds = require('@sap/cds')
const { SELECT, DELETE } = cds.ql

// ISOLATION TEST for the reusable `mass-upload` plugin — standalone (only this plugin
// required; audit is an injected hook, not a sibling-plugin import). Exercises true per-row
// create/update/delete with per-row status, source-file retention, and the results CSV.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/../..')

const massUpload = require('../../srv/lib/plugins/mass-upload')

// A descriptor is the app's config — here a simple, soft-deletable config entity.
const descriptor = {
  name: 'TestRiskConfig',
  entity: 'bridge.management.RiskConfig',
  keyFields: ['factor'],
  columns: [{ name: 'name', type: 'string' }, { name: 'weight', type: 'decimal', required: true }, { name: 'active', type: 'boolean' }],
  operationColumn: '_op'
}

describe('plugin: mass-upload (isolation)', () => {
  const F = 'PLUGTEST_MU_A'
  afterAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from('bridge.management.RiskConfig').where({ factor: F }))
    await db.run(DELETE.from('plugins.upload.UploadSourceFile').where({ dataset: 'TestRiskConfig' }))
  })

  test('per-row create / update / delete with per-row status + audit hook + source retention', async () => {
    const db = await cds.connect.to('db')
    const audited = []
    const res = await massUpload.processUpload({
      descriptor, db, user: 'tester',
      fileBuffer: Buffer.from('factor,name,weight,_op\n'), fileName: 't.csv', mimeType: 'text/csv',
      rows: [
        { _op: 'create', factor: F, name: 'Alpha', weight: 5 },
        { _op: 'create', factor: F, name: 'dup', weight: 9 },   // already exists → Error
        { _op: 'update', factor: F, name: 'Alpha2', weight: 6 },
        { _op: 'create', factor: 'PLUGTEST_MU_MISSING' },        // missing required weight → Error
        { _op: 'delete', factor: F }                             // soft-delete
      ],
      hooks: { onAudit: async (_db, o) => { audited.push(o.action) } }
    })

    expect(res.summary).toMatchObject({ processed: 5, created: 1, updated: 1, deleted: 1, failed: 2 })
    expect(res.rows.length).toBe(5)
    expect(res.rows[1].status).toBe('Error')   // duplicate create
    expect(res.rows[3].status).toBe('Error')   // missing required
    expect(res.rows[4].operation).toBe('delete')
    expect(audited).toEqual(['CREATE', 'UPDATE', 'DELETE'])

    const row = await db.run(SELECT.one.from('bridge.management.RiskConfig').where({ factor: F }))
    expect(row.active).toBe(false)             // delete = soft-delete (active=false)

    const sf = await db.run(SELECT.from('plugins.upload.UploadSourceFile').where({ dataset: 'TestRiskConfig' }))
    expect(sf.length).toBe(1)
    expect(sf[0].fileName).toBe('t.csv')       // raw source file retained
    expect(sf[0].rowCount).toBe(5)
  })

  test('resultsToCsv produces a header + one line per result row', () => {
    const csv = massUpload.resultsToCsv([
      { rowNum: 2, operation: 'create', status: 'Success', message: 'Created', key: '{"factor":"X"}' }
    ])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('rowNum,operation,status,message,key')
    expect(lines[1]).toContain('create')
    expect(lines[1]).toContain('Success')
  })
})
