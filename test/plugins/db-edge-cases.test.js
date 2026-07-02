const cds = require('@sap/cds')
const { INSERT, DELETE, SELECT } = cds.ql

// DB-backed edge-case coverage for the reusable plugins — the branches the isolation
// tests don't reach:
//   • change-documents: the OPTIONAL typed attribute-history merge (attrHistEntity +
//     attrDefEntity label join + typed-value coalesce + objectType cap()).
//   • mass-upload: delete-on-missing, the optional logEntity write, and an audit-hook
//     failure being swallowed (must not fail the row).
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/../..')

const changeDocs = require('../../srv/lib/plugins/change-documents')
const massUpload = require('../../srv/lib/plugins/mass-upload')

describe('plugin/change-documents: typed attribute-history merge', () => {
  const OBJ = 'ZZ_CD_OBJ_1'
  const HIST_ENTITY = 'bridge.management.AttributeValueHistory'
  const DEF_ENTITY = 'bridge.management.AttributeDefinitions'
  const GRP_ENTITY = 'bridge.management.AttributeGroups'
  const groupId = cds.utils.uuid()

  afterAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from(HIST_ENTITY).where({ objectId: OBJ }))
    await db.run(DELETE.from(DEF_ENTITY).where({ internalKey: 'ZZ_LOAD_RF' }))
    await db.run(DELETE.from(GRP_ENTITY).where({ ID: groupId }))
  })

  test('merges typed attribute history rows, resolving the definition label + typed values', async () => {
    const db = await cds.connect.to('db')
    // A parent group + definition supply the human label for the internalKey.
    await db.run(INSERT.into(GRP_ENTITY).entries({
      ID: groupId, objectType: 'bridge', name: 'ZZ Engineering', internalKey: 'ZZ_ENG', status: 'Active'
    }))
    await db.run(INSERT.into(DEF_ENTITY).entries({
      ID: cds.utils.uuid(), group_ID: groupId, objectType: 'bridge', internalKey: 'ZZ_LOAD_RF',
      name: 'Load Rating Factor', dataType: 'Decimal', status: 'Active'
    }))
    // A history row carrying a typed (decimal) old→new change.
    await db.run(INSERT.into(HIST_ENTITY).entries({
      historyId: cds.utils.uuid(), objectType: 'bridge', objectId: OBJ, attributeKey: 'ZZ_LOAD_RF',
      oldValueDecimal: 1.10, newValueDecimal: 1.25, changedBy: 'tester',
      changedAt: new Date().toISOString(), changeSource: 'manual'
    }))

    const rows = await changeDocs.buildChangeDocuments(db, {
      attrHistEntity: HIST_ENTITY,
      attrDefEntity: DEF_ENTITY,
      objectTypeMap: { Bridge: 'bridge' },
      filters: { objectId: OBJ }
    })

    const attrRow = rows.find((r) => r.objectId === OBJ)
    expect(attrRow).toBeTruthy()
    expect(attrRow.fieldName).toMatch(/Load Rating Factor/)   // label resolved from the definition
    expect(attrRow.fieldName).toMatch(/\(attribute\)/)        // tagged as an attribute change
    expect(attrRow.objectType).toBe('Bridge')                 // cap() applied
    expect(attrRow.oldValue).toBe('1.1')                      // typed decimal coalesced to string
    expect(attrRow.newValue).toBe('1.25')
  })

  test('source="attribute" returns ONLY attribute history (no standard log rows)', async () => {
    const db = await cds.connect.to('db')
    const rows = await changeDocs.buildChangeDocuments(db, {
      attrHistEntity: HIST_ENTITY, attrDefEntity: DEF_ENTITY,
      objectTypeMap: { Bridge: 'bridge' }, filters: { source: 'attribute', objectId: OBJ }
    })
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(r.fieldName).toMatch(/\(attribute\)/)
  })
})

describe('plugin/mass-upload: processUpload edge branches', () => {
  const descriptor = {
    name: 'ZZ_MU_EDGE',
    entity: 'bridge.management.RiskConfig',
    keyFields: ['factor'],
    columns: [{ name: 'name', type: 'string' }, { name: 'weight', type: 'decimal' }],
    operationColumn: '_op',
    logEntity: 'bridge.management.MassUploadLog'
  }
  const F = 'ZZ_MU_EDGE_A'

  afterAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from('bridge.management.RiskConfig').where({ factor: F }))
    await db.run(DELETE.from('plugins.upload.UploadSourceFile').where({ dataset: 'ZZ_MU_EDGE' }))
    await db.run(DELETE.from('bridge.management.MassUploadLog').where({ dataset: 'ZZ_MU_EDGE' }))
  })

  test('delete on a non-existent key is an Error (Not found); a failing audit hook is swallowed', async () => {
    const db = await cds.connect.to('db')
    const res = await massUpload.processUpload({
      descriptor, db, user: 'tester',
      fileBuffer: Buffer.from('factor,_op\n'), fileName: 'edge.csv', mimeType: 'text/csv',
      rows: [
        { _op: 'delete', factor: 'ZZ_DOES_NOT_EXIST' }, // Not found → Error
        { _op: 'create', factor: F, name: 'Edge', weight: 3 } // success; audit hook throws but row stays Success
      ],
      hooks: { onAudit: async () => { throw new Error('audit boom') } }
    })

    expect(res.summary).toMatchObject({ processed: 2, created: 1, failed: 1 })
    const notFound = res.rows.find((r) => r.operation === 'delete')
    expect(notFound).toMatchObject({ status: 'Error', message: 'Not found' })
    const ok = res.rows.find((r) => r.operation === 'create')
    expect(ok.status).toBe('Success') // audit-hook failure did NOT fail the row

    // The optional logEntity row was written.
    const log = await db.run(SELECT.one.from('bridge.management.MassUploadLog').where({ dataset: 'ZZ_MU_EDGE' }))
    expect(log).toBeTruthy()
    expect(Number(log.failed)).toBe(1)
  })

  test('a descriptor without { entity, keyFields[] } is rejected', async () => {
    await expect(massUpload.processUpload({ descriptor: { name: 'bad' }, rows: [] }))
      .rejects.toThrow(/descriptor with .* is required/i)
  })
})
