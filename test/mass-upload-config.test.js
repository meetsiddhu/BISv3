const cds = require('@sap/cds')
const { SELECT, DELETE } = cds.ql

// Integration coverage for the admin-only risk-config mass-upload datasets (pre-mortem
// MUST-FIX 3/12/13): scope gating, weight validation, audit, and AssetClassStrategy
// natural-key upsert. Force in-memory so cds.test auto-deploys schema + seed.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const { importUpload } = require('../srv/mass-upload')
const csvBuf = (s) => Buffer.from(s, 'utf8')

describe('mass-upload risk-config datasets', () => {
  afterAll(async () => {
    try {
      const db = await cds.connect.to('db')
      await db.run(DELETE.from('bridge.management.RiskConfig').where({ factor: 'test_factor' }))
      await db.run(DELETE.from('bridge.management.AssetClassStrategy').where({ assetClass: 'TestClassZZ' }))
    } catch (_e) { /* ignore */ }
  })

  test('REJECTS a RiskFactors import from a non-admin (manage-only) — privilege escalation guard', async () => {
    await expect(importUpload({
      buffer: csvBuf('factor,name,weight,active\ntest_factor,Test Factor,2,true\n'),
      fileName: 'rf.csv', datasetName: 'RiskFactors', uploadedBy: 'mgr', isAdmin: false
    })).rejects.toThrow(/administrator|admin scope/i)
  })

  test('REJECTS a negative / over-cap weight even for an admin', async () => {
    await expect(importUpload({
      buffer: csvBuf('factor,name,weight,active\ntest_factor,Test Factor,-5,true\n'),
      fileName: 'rf.csv', datasetName: 'RiskFactors', uploadedBy: 'adm', isAdmin: true
    })).rejects.toThrow(/weight/i)
  })

  test('admin import upserts a RiskConfig row, writes ChangeLog, and rescores the fleet', async () => {
    const res = await importUpload({
      buffer: csvBuf('factor,name,weight,active\ntest_factor,Test Factor,2,true\n'),
      fileName: 'rf.csv', datasetName: 'RiskFactors', uploadedBy: 'adm', isAdmin: true
    })
    expect(res.message).toMatch(/rescored/i) // recompute ran post-import
    const db = await cds.connect.to('db')
    const row = await db.run(SELECT.one.from('bridge.management.RiskConfig').where({ factor: 'test_factor' }))
    expect(row).toBeTruthy()
    expect(Number(row.weight)).toBe(2)
    const log = await db.run(SELECT.from('bridge.management.ChangeLog').where({ objectId: 'RiskConfig:test_factor' }))
    expect(log.length).toBeGreaterThan(0)
  })

  // Full column header (parseSheetRows requires every declared column to be present).
  var ACS_HDR = 'assetClass,transportMode,name,inspectionIntervalMonths,targetConditionRating,interventionThreshold,reviewCycleMonths,degradationRatePerYear,deteriorationModel,eamMaintenancePlan,description,active'

  test('AssetClassStrategy re-import matches the natural key (no duplicate)', async () => {
    await importUpload({ buffer: csvBuf(ACS_HDR + '\nTestClassZZ,Road,First,24,,,,,,,,true\n'), fileName: 'acs.csv', datasetName: 'AssetClassStrategies', uploadedBy: 'adm', isAdmin: true })
    // Re-import same class/mode with a changed interval — must UPDATE, not INSERT a 2nd row.
    await importUpload({ buffer: csvBuf(ACS_HDR + '\nTestClassZZ,Road,Updated,36,,,,,,,,true\n'), fileName: 'acs.csv', datasetName: 'AssetClassStrategies', uploadedBy: 'adm', isAdmin: true })
    const db = await cds.connect.to('db')
    const rows = await db.run(SELECT.from('bridge.management.AssetClassStrategy').where({ assetClass: 'TestClassZZ', transportMode: 'Road' }))
    expect(rows.length).toBe(1)
    expect(rows[0].name).toBe('Updated')
    expect(Number(rows[0].inspectionIntervalMonths)).toBe(36)
  })

  test('REJECTS an inspection interval outside 1–240 months', async () => {
    await expect(importUpload({
      buffer: csvBuf(ACS_HDR + '\nTestClassZZ,Rail,Bad,999,,,,,,,,true\n'),
      fileName: 'acs.csv', datasetName: 'AssetClassStrategies', uploadedBy: 'adm', isAdmin: true
    })).rejects.toThrow(/interval/i)
  })
})
