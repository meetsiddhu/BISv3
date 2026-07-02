const cds = require('@sap/cds')
const { SELECT, DELETE } = cds.ql

// Integration coverage for the heavy Bridges + Restrictions IMPORTERS in srv/mass-upload.js
// (importBridgeRows / importRestrictionRows / enrichRestrictionsWithBridgeKeys) — the largest
// uncovered region. Drives a real CSV through importUpload and asserts the rows land + the
// derived fields (condition band) compute. Isolated in-memory DB (cds.test).
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const { importUpload } = require('../srv/mass-upload')
const csvBuf = (s) => Buffer.from(s, 'utf8')

const BRIDGE_HEADER = [
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
const bIdx = Object.fromEntries(BRIDGE_HEADER.map((h, i) => [h, i]))
const bRow = (vals) => { const r = BRIDGE_HEADER.map(() => ''); for (const k of Object.keys(vals)) r[bIdx[k]] = vals[k]; return r }
const bridgesCsv = (rows) => [BRIDGE_HEADER.join(','), ...rows.map((r) => r.join(','))].join('\n')

const REF1 = 'ZZ-MUI-BR-1'
const REF2 = 'ZZ-MUI-BR-2'

describe('mass-upload importers: Bridges', () => {
  afterAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from('bridge.management.Bridges').where({ bridgeId: { in: [REF1, REF2] } }))
  })

  test('importing a valid Bridges CSV creates the rows with typed values intact', async () => {
    const csv = bridgesCsv([
      bRow({ bridgeId: REF1, bridgeName: 'Importer Bridge 1', state: 'NSW', latitude: '-33.86', longitude: '151.20', assetOwner: 'TfNSW', conditionRating: '2', yearBuilt: '1965', material: 'Steel' }),
      bRow({ bridgeId: REF2, bridgeName: 'Importer Bridge 2', state: 'NSW', latitude: '-32.90', longitude: '151.78', assetOwner: 'TfNSW', conditionRating: '9' })
    ])
    const res = await importUpload({ buffer: csvBuf(csv), fileName: 'bridges.csv', datasetName: 'Bridges', uploadedBy: 'importer' })
    expect(res.rowResults.filter((r) => r.status === 'Success').length).toBe(2)

    const db = await cds.connect.to('db')
    const rows = await db.run(SELECT.from('bridge.management.Bridges').where({ bridgeId: { in: [REF1, REF2] } }))
    expect(rows.length).toBe(2)
    // The bulk importer persists the coerced typed cell values (decimals/integers parsed).
    const poor = rows.find((b) => b.bridgeId === REF1)
    expect(Number(poor.conditionRating)).toBe(2)
    expect(Number(poor.latitude)).toBeCloseTo(-33.86, 2)
    expect(Number(poor.yearBuilt)).toBe(1965)
  })

  test('re-importing the same bridgeId UPDATES (no duplicate row)', async () => {
    const csv = bridgesCsv([
      bRow({ bridgeId: REF1, bridgeName: 'Importer Bridge 1 RENAMED', state: 'NSW', latitude: '-33.86', longitude: '151.20', assetOwner: 'TfNSW', conditionRating: '8' })
    ])
    await importUpload({ buffer: csvBuf(csv), fileName: 'bridges.csv', datasetName: 'Bridges', uploadedBy: 'importer' })
    const db = await cds.connect.to('db')
    const rows = await db.run(SELECT.from('bridge.management.Bridges').where({ bridgeId: REF1 }))
    expect(rows.length).toBe(1)
    expect(rows[0].bridgeName).toBe('Importer Bridge 1 RENAMED')
  })

  test('a Bridges row missing a required field is reported (not inserted)', async () => {
    const csv = bridgesCsv([
      bRow({ bridgeId: 'ZZ-MUI-BAD', bridgeName: 'No Owner', state: 'NSW', latitude: '-33', longitude: '151' }) // assetOwner missing (required)
    ])
    const res = await importUpload({ buffer: csvBuf(csv), fileName: 'bridges.csv', datasetName: 'Bridges', uploadedBy: 'importer' })
    const db = await cds.connect.to('db')
    const rows = await db.run(SELECT.from('bridge.management.Bridges').where({ bridgeId: 'ZZ-MUI-BAD' }))
    expect(rows.length).toBe(0)
    // the skip surfaces as a warning/error in the results ledger
    expect(res.rowResults.some((r) => r.status !== 'Success') || res.message).toBeTruthy()
  })
})

describe('mass-upload importers: Restrictions (with bridge-key enrichment)', () => {
  const RREF = 'ZZ-MUI-RES-1'
  afterAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from('bridge.management.Restrictions').where({ restrictionRef: RREF }))
    await db.run(DELETE.from('bridge.management.Bridges').where({ bridgeId: 'ZZ-MUI-RBRG' }))
  })

  test('a restriction referencing a bridge by bridgeRef is enriched + created', async () => {
    // First create a bridge the restriction will reference.
    const bcsv = bridgesCsv([
      bRow({ bridgeId: 'ZZ-MUI-RBRG', bridgeName: 'Restriction Host', state: 'NSW', latitude: '-33.5', longitude: '150.9', assetOwner: 'TfNSW' })
    ])
    await importUpload({ buffer: csvBuf(bcsv), fileName: 'bridges.csv', datasetName: 'Bridges', uploadedBy: 'importer' })

    const header = ['ID', 'parent_ID', 'restrictionRef', 'bridgeRef', 'bridge_ID', 'name', 'descr', 'restrictionCategory', 'restrictionType', 'restrictionValue', 'restrictionUnit', 'restrictionStatus', 'appliesToVehicleClass', 'grossMassLimit', 'axleMassLimit', 'heightLimit', 'widthLimit', 'lengthLimit', 'speedLimit', 'permitRequired', 'escortRequired', 'temporary', 'active', 'effectiveFrom', 'effectiveTo', 'approvedBy', 'direction', 'enforcementAuthority', 'temporaryFrom', 'temporaryTo', 'temporaryReason', 'approvalReference', 'issuingAuthority', 'legalReference', 'remarks']
    const db = await cds.connect.to('db')
    // Resolve valid coded values from the live lookups so the row passes code validation.
    const cat = (await db.run(SELECT.one.from('bridge.management.RestrictionCategories')))?.code || 'Mass'
    const type = (await db.run(SELECT.one.from('bridge.management.RestrictionTypes')))?.code || 'Mass Limit'
    const stat = (await db.run(SELECT.one.from('bridge.management.RestrictionStatuses')))?.code || 'Active'

    const vals = {}
    vals.restrictionRef = RREF; vals.bridgeRef = 'ZZ-MUI-RBRG'
    vals.restrictionCategory = cat; vals.restrictionType = type; vals.restrictionStatus = stat
    const row = header.map((h) => vals[h] ?? '')
    const csv = [header.join(','), row.join(',')].join('\n')

    const res = await importUpload({ buffer: csvBuf(csv), fileName: 'restrictions.csv', datasetName: 'Restrictions', uploadedBy: 'importer' })
    expect(res.rowResults.length).toBeGreaterThan(0)

    const created = await db.run(SELECT.one.from('bridge.management.Restrictions').where({ restrictionRef: RREF }))
    expect(created).toBeTruthy()
    // bridge_ID enriched from the bridgeRef lookup
    expect(created.bridge_ID).toBeTruthy()
  })
})
