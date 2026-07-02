const cds = require('@sap/cds')
const { SELECT, DELETE, INSERT } = cds.ql

// Integration coverage for the mass-upload PARSE / VALIDATE / TEMPLATE pipeline in
// srv/mass-upload.js — the large region driven by validateUpload()/buildWorkbookTemplate()
// (parseSheetRows → normalizeRow → convertCellValue → parseBoolean/parseDate → preview).
// These paths are exercised end-to-end without going through the Express router.
// Force in-memory so cds.test auto-deploys schema + seed.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const {
  getDatasets, validateUpload, importUpload, buildCsvTemplate, buildWorkbookTemplate, getUploadHistory
} = require('../srv/mass-upload')
const XLSX = require('xlsx')

const csvBuf = (s) => Buffer.from(s, 'utf8')

describe('mass-upload: getDatasets (pure catalogue)', () => {
  test('lists every importable dataset with a csvFileName', () => {
    const ds = getDatasets()
    const names = ds.map((d) => d.name)
    expect(names).toEqual(expect.arrayContaining(['Bridges', 'Restrictions', 'AssetClasses', 'RiskBands']))
    for (const d of ds) {
      expect(d.csvFileName).toBe(`${d.name}.csv`)
      expect(typeof d.label).toBe('string')
    }
  })
})

describe('mass-upload: validateUpload — input guards', () => {
  test('empty buffer is rejected', async () => {
    await expect(validateUpload({ buffer: Buffer.alloc(0), fileName: 'x.csv', datasetName: 'AssetClasses' }))
      .rejects.toThrow(/empty/i)
  })

  test('unsupported file type is rejected', async () => {
    await expect(validateUpload({ buffer: csvBuf('code\nA'), fileName: 'x.txt', datasetName: 'AssetClasses' }))
      .rejects.toThrow(/Unsupported file type/i)
  })

  test('CSV without a specific dataset is rejected', async () => {
    await expect(validateUpload({ buffer: csvBuf('code\nA'), fileName: 'x.csv', datasetName: 'All' }))
      .rejects.toThrow(/specific dataset/i)
  })

  test('a header-only file (no data rows) is rejected', async () => {
    await expect(validateUpload({ buffer: csvBuf('code,name,descr'), fileName: 'x.csv', datasetName: 'AssetClasses' }))
      .rejects.toThrow(/only header rows/i)
  })

  test('a missing required column header throws (parseSheetRows guard)', async () => {
    // AssetClasses requires a "code" column; omit it.
    await expect(validateUpload({ buffer: csvBuf('name,descr\nFoo,bar'), fileName: 'x.csv', datasetName: 'AssetClasses' }))
      .rejects.toThrow(/must contain a "code" column/i)
  })
})

describe('mass-upload: validateUpload — lookup dataset preview', () => {
  test('valid rows report a Valid preview + success counts', async () => {
    const res = await validateUpload({
      buffer: csvBuf('code,name,descr\nZZA,Class A,first\nZZB,Class B,second'),
      fileName: 'classes.csv', datasetName: 'AssetClasses'
    })
    expect(res.totalCount).toBe(2)
    expect(res.validCount).toBe(2)
    expect(res.errorCount).toBe(0)
    expect(res.previewRows).toHaveLength(2)
    expect(res.previewRows[0].validText).toBe('Valid')
    expect(res.previewColumns.length).toBeGreaterThan(0)
    expect(res.message).toMatch(/2 row/i)
  })

  test('a row missing the required key is flagged as an Error in the preview', async () => {
    // code is required; the 2nd row leaves it blank → normalizeRow returns null → Error.
    const res = await validateUpload({
      buffer: csvBuf('code,name,descr\nZZOK,Ok,x\n,NoCode,y'),
      fileName: 'classes.csv', datasetName: 'AssetClasses'
    })
    expect(res.errorCount).toBe(1)
    const bad = res.previewRows.find((r) => r.statusState === 'Error')
    expect(bad).toBeTruthy()
  })
})

describe('mass-upload: validateUpload — numeric/boolean coercion warnings (Bridges)', () => {
  // Build a minimal Bridges CSV header covering every REQUIRED (non-optional) column so
  // parseSheetRows accepts it, then drive a bad-numeric + a bad-boolean cell to hit the
  // warning paths in convertCellValue/parseBoolean.
  const HEADER = [
    'ID', 'descr', 'bridgeId', 'bridgeName', 'assetClass', 'route', 'routeNumber', 'state', 'region', 'lga',
    'latitude', 'longitude', 'location', 'assetOwner', 'managingAuthority', 'structureType', 'yearBuilt',
    'designLoad', 'designStandard', 'clearanceHeight', 'spanLength', 'material', 'spanCount', 'totalLength',
    'deckWidth', 'numberOfLanes', 'condition', 'conditionRating', 'structuralAdequacyRating', 'postingStatus',
    'conditionStandard', 'seismicZone', 'asBuiltDrawingReference', 'floodImmunityAriYears', 'floodImpacted',
    'highPriorityAsset', 'remarks', 'status', 'lastInspectionDate', 'nhvrAssessed', 'nhvrAssessmentDate',
    'loadRating', 'pbsApprovalClass', 'importanceLevel', 'averageDailyTraffic', 'heavyVehiclePercent',
    'gazetteReference', 'nhvrReferenceUrl', 'freightRoute', 'overMassRoute', 'hmlApproved', 'bDoubleApproved',
    'dataSource', 'sourceReferenceUrl', 'openDataReference', 'sourceRecordId', 'restriction_ID', 'geoJson'
  ]
  const idx = Object.fromEntries(HEADER.map((h, i) => [h, i]))
  const blankRow = () => HEADER.map(() => '')
  const toCsv = (rows) => [HEADER.join(','), ...rows.map((r) => r.join(','))].join('\n')

  test('valid Bridges row passes; a bad optional-numeric cell produces a Warning', async () => {
    const good = blankRow()
    good[idx.bridgeId] = 'ZZ-VAL-1'; good[idx.bridgeName] = 'Valid Bridge'; good[idx.state] = 'NSW'
    good[idx.latitude] = '-33.8'; good[idx.longitude] = '151.2'; good[idx.assetOwner] = 'TfNSW'

    const warn = blankRow()
    warn[idx.bridgeId] = 'ZZ-WARN-1'; warn[idx.bridgeName] = 'Warn Bridge'; warn[idx.state] = 'NSW'
    warn[idx.latitude] = '-33.9'; warn[idx.longitude] = '151.3'; warn[idx.assetOwner] = 'TfNSW'
    warn[idx.yearBuilt] = 'notayear' // optional integer → cleared with a warning

    const res = await validateUpload({ buffer: csvBuf(toCsv([good, warn])), fileName: 'b.csv', datasetName: 'Bridges' })
    expect(res.totalCount).toBe(2)
    expect(res.warningCount).toBeGreaterThanOrEqual(1)
    const warnRow = res.previewRows.find((r) => r.statusState === 'Warning')
    expect(warnRow).toBeTruthy()
  })

  test('a Bridges row missing a required field (state) is an Error', async () => {
    const bad = blankRow()
    bad[idx.bridgeId] = 'ZZ-ERR-1'; bad[idx.bridgeName] = 'No State Bridge'
    bad[idx.latitude] = '-34'; bad[idx.longitude] = '150'; bad[idx.assetOwner] = 'TfNSW'
    // state intentionally blank
    const res = await validateUpload({ buffer: csvBuf(toCsv([bad])), fileName: 'b.csv', datasetName: 'Bridges' })
    expect(res.errorCount).toBe(1)
  })
})

describe('mass-upload: buildCsvTemplate + buildWorkbookTemplate', () => {
  test('buildCsvTemplate returns a CSV buffer with the dataset header', async () => {
    const buf = await buildCsvTemplate('AssetClasses')
    expect(Buffer.isBuffer(buf)).toBe(true)
    const firstLine = buf.toString('utf8').split('\n')[0].toLowerCase()
    expect(firstLine).toContain('code')
  })

  test('buildCsvTemplate rejects an unknown dataset', async () => {
    await expect(buildCsvTemplate('Nope')).rejects.toThrow(/Unknown dataset/i)
  })

  test('buildWorkbookTemplate produces a multi-sheet xlsx including Bridges + Instructions', async () => {
    const buf = await buildWorkbookTemplate()
    expect(Buffer.isBuffer(buf)).toBe(true)
    const wb = XLSX.read(buf, { type: 'buffer' })
    expect(wb.SheetNames).toEqual(expect.arrayContaining(['Instructions', 'Bridges', 'Restrictions', 'AssetClasses']))
  })

  test('the generated workbook validates against itself (All) with no fatal parse error', async () => {
    const buf = await buildWorkbookTemplate()
    const res = await validateUpload({ buffer: buf, fileName: 'template.xlsx', datasetName: 'All' })
    expect(res.multiSheet).toBe(true)
    expect(res.totalCount).toBeGreaterThan(0)
    // every previewed row carries a status state
    for (const r of res.previewRows) expect(['Success', 'Warning', 'Error']).toContain(r.statusState)
  })
})

describe('mass-upload: importUpload (lookup create/update) + getUploadHistory', () => {
  const CODES = ['ZZ_MUP_1', 'ZZ_MUP_2']
  afterAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from('bridge.management.AssetClasses').where({ code: { in: CODES } }))
  })

  test('CSV import creates rows, records a results ledger + a history log entry', async () => {
    const res = await importUpload({
      buffer: csvBuf(`code,name,descr\n${CODES[0]},First,a\n${CODES[1]},Second,b`),
      fileName: 'classes.csv', datasetName: 'AssetClasses', uploadedBy: 'tester'
    })
    expect(Array.isArray(res.rowResults)).toBe(true)
    expect(res.rowResults.some((r) => r.status === 'Success')).toBe(true)

    const db = await cds.connect.to('db')
    const rows = await db.run(SELECT.from('bridge.management.AssetClasses').where({ code: { in: CODES } }))
    expect(rows.length).toBe(2)

    const history = await getUploadHistory()
    expect(Array.isArray(history)).toBe(true)
    expect(history.some((h) => h.dataset === 'AssetClasses')).toBe(true)
  })

  test('rejects an unsupported file type at import time', async () => {
    await expect(importUpload({
      buffer: csvBuf('code\nA'), fileName: 'x.txt', datasetName: 'AssetClasses', uploadedBy: 'tester'
    })).rejects.toThrow(/Unsupported file type/i)
  })

  test('rejects an empty buffer at import time', async () => {
    await expect(importUpload({
      buffer: Buffer.alloc(0), fileName: 'x.csv', datasetName: 'AssetClasses', uploadedBy: 'tester'
    })).rejects.toThrow(/empty/i)
  })
})
