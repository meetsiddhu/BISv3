const cds = require('@sap/cds')
const { SELECT, DELETE } = cds.ql

// Integration test for the LIVE mass-upload flow after plugin wiring: importUpload must now
// return a per-row results ledger, retain the raw source file, write the enriched load-log,
// and emit a results CSV (the reusable mass-upload plugin's capabilities, surfaced live).
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const { importUpload } = require('../srv/mass-upload')
const CODE = 'ZZ_MU_RESULT'

function csv (rows) { return Buffer.from(rows.join('\n'), 'utf8') }

describe('mass-upload live results ledger + source-file retention', () => {
  const MODE = 'ZZ_MU_MODE'
  afterAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from('bridge.management.AssetClasses').where({ code: { in: [CODE, MODE] } }))
    await db.run(DELETE.from('plugins.upload.UploadSourceFile').where({ dataset: 'AssetClasses' }))
  })

  test('create then update reports per-row status, retains source, writes load-log + CSV', async () => {
    const db = await cds.connect.to('db')

    // First upload — creates a new lookup row.
    const created = await importUpload({
      buffer: csv(['code,name,descr', `${CODE},Result Test,first`]),
      fileName: 'classes.csv', datasetName: 'AssetClasses', uploadedBy: 'tester'
    })
    expect(Array.isArray(created.rowResults)).toBe(true)
    const cRow = created.rowResults.find((r) => r.key === CODE)
    expect(cRow).toMatchObject({ operation: 'create', status: 'Success', dataset: 'AssetClasses' })
    expect(created.sourceFileId).toBeTruthy()
    expect(created.resultsCsv.split('\n')[0]).toBe('rowNum,dataset,operation,status,message,key')

    // Source file retained + downloadable
    const sf = await db.run(SELECT.one.from('plugins.upload.UploadSourceFile').where({ ID: created.sourceFileId }))
    expect(sf).toBeTruthy()
    expect(sf.fileName).toBe('classes.csv')

    // Load-log row carries the source-file ref + status
    const log = await db.run(SELECT.one.from('bridge.management.MassUploadLog')
      .where({ sourceFileId: created.sourceFileId }))
    expect(log).toBeTruthy()
    expect(log.dataset).toBe('AssetClasses')

    // Second upload — same code, different name => update path.
    const updated = await importUpload({
      buffer: csv(['code,name,descr', `${CODE},Result Test 2,second`]),
      fileName: 'classes.csv', datasetName: 'AssetClasses', uploadedBy: 'tester'
    })
    const uRow = updated.rowResults.find((r) => r.key === CODE)
    expect(uRow).toMatchObject({ operation: 'update', status: 'Success' })
  })

  test('Create/Update mode: create-only rejects existing, update-only rejects missing', async () => {
    const up = (name, mode) => importUpload({
      buffer: csv(['code,name,descr', `${MODE},${name},x`]), fileName: 'm.csv', datasetName: 'AssetClasses', uploadedBy: 'tester', mode
    })
    // create-only: brand-new row → created
    const r1 = await up('Mode A', 'create')
    expect(r1.rowResults.find((r) => r.key === MODE)).toMatchObject({ operation: 'create', status: 'Success' })
    // create-only: same key again → Error (already exists), no overwrite
    const r2 = await up('Mode A2', 'create')
    expect(r2.rowResults.find((r) => r.key === MODE)).toMatchObject({ status: 'Error' })
    // update-only: existing key → updated
    const r3 = await up('Mode A3', 'update')
    expect(r3.rowResults.find((r) => r.key === MODE)).toMatchObject({ operation: 'update', status: 'Success' })
    // update-only: missing key → Error (not found)
    const r4 = await importUpload({
      buffer: csv(['code,name,descr', 'ZZ_MU_MISSING,Nope,x']), fileName: 'm.csv', datasetName: 'AssetClasses', uploadedBy: 'tester', mode: 'update'
    })
    expect(r4.rowResults.find((r) => r.key === 'ZZ_MU_MISSING')).toMatchObject({ status: 'Error' })
  })
})
