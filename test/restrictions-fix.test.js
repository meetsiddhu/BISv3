/**
 * Restrictions tile fix — integration coverage.
 *
 *  1. LIST PARITY: the Restrictions app bridge value help (AdminService.
 *     BridgeValueHelp) shows exactly the bridges the live register can show —
 *     Active by default PLUS Inactive via the register's status filter.
 *  2. CODELIST COMPLETENESS: a fresh deploy gets the full NSW/NHVR restriction
 *     codelists via runtime insert-if-missing (no CSV — tables may be populated).
 *  3. NEW-TYPE UPLOAD: massUploadRestrictions accepts a 'Full Closure' row with
 *     the new gazette/severity attributes, generates an RST-NNNN ref, audits to
 *     ChangeLog and flips the bridge postingStatus to CLOSED.
 *  4. REPORT INCLUSION: the new type/attributes surface in ActiveRestrictions,
 *     NetworkRestrictionReport and the dashboard KPIs.
 */
'use strict'

const cds = require('@sap/cds')
const { SELECT, INSERT, DELETE } = cds.ql

if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const ACTIVE_ID = 990401
const INACTIVE_ID = 990402

// Service entities are @restrict-gated (locked rule 5) — run programmatic
// service calls as a privileged test user.
const asUser = (fn) => cds.tx({ user: cds.User.privileged }, fn)

describe('Restrictions tile fix (integration)', () => {
  let db, AdminService, bms

  beforeAll(async () => {
    db = await cds.connect.to('db')
    AdminService = await cds.connect.to('AdminService')
    bms = await cds.connect.to('BridgeManagementService')
    // Seeding also runs on 'served'; calling again proves idempotency.
    const { seedRestrictionCodelists } = require('../srv/lib/restriction-codelists')
    await seedRestrictionCodelists(db, { changedBy: 'test' })

    await db.run(INSERT.into('bridge.management.Bridges').entries([
      { ID: ACTIVE_ID, bridgeId: 'BRG-TST-901', bridgeName: 'Parity Active Bridge', state: 'NSW', status: 'Active', latitude: -33.9, longitude: 151.2, postingStatus: 'Unrestricted' },
      { ID: INACTIVE_ID, bridgeId: 'BRG-TST-902', bridgeName: 'Parity Inactive Bridge', state: 'NSW', status: 'Inactive', latitude: -33.8, longitude: 151.1, postingStatus: 'Unrestricted' }
    ]))
  })

  afterAll(async () => {
    try {
      await db.run(DELETE.from('bridge.management.Restrictions').where({ bridge_ID: { in: [ACTIVE_ID, INACTIVE_ID] } }))
      await db.run(DELETE.from('bridge.management.BridgeRestrictions').where({ bridge_ID: { in: [ACTIVE_ID, INACTIVE_ID] } }))
      await db.run(DELETE.from('bridge.management.Bridges').where({ ID: { in: [ACTIVE_ID, INACTIVE_ID] } }))
    } catch (_e) { /* ignore */ }
  })

  // ── 1. List parity ─────────────────────────────────────────────────────────
  test('value help shows BOTH bridges; the register shows Active by default and Inactive via its status filter', async () => {
    await asUser(async () => {
      const vh = await AdminService.read('BridgeValueHelp').where({ ID: { in: [ACTIVE_ID, INACTIVE_ID] } })
      expect(vh.map((b) => b.ID).sort()).toEqual([ACTIVE_ID, INACTIVE_ID])
      // VH exposes the register columns the dialog displays
      expect(vh[0]).toHaveProperty('bridgeId')
      expect(vh[0]).toHaveProperty('bridgeName')
      expect(vh[0]).toHaveProperty('state')
      expect(vh[0]).toHaveProperty('status')

      // Register default (no status filter): Active-only injector applies
      const registerDefault = await AdminService.read('Bridges').where({ ID: { in: [ACTIVE_ID, INACTIVE_ID] } })
      expect(registerDefault.map((b) => b.ID)).toEqual([ACTIVE_ID])

      // Register with its explicit status filter reaches the Inactive bridge
      const registerInactive = await AdminService.read('Bridges').where({ ID: { in: [ACTIVE_ID, INACTIVE_ID] }, status: 'Inactive' })
      expect(registerInactive.map((b) => b.ID)).toEqual([INACTIVE_ID])

      // PARITY: VH set == register(default) ∪ register(Inactive filter)
      const registerUnion = [...registerDefault, ...registerInactive].map((b) => b.ID).sort()
      const vhIds = vh.map((b) => b.ID).sort()
      expect(vhIds).toEqual(registerUnion)
    })
  })

  test('the Restrictions app bridgeRef value list points at BridgeValueHelp (same source as the register)', () => {
    const restr = cds.model.definitions['AdminService.Restrictions']
    const vlAnnotation = JSON.stringify(restr.elements.bridgeRef['@Common.ValueList'] ||
      { CollectionPath: restr.elements.bridgeRef['@Common.ValueList.CollectionPath'] })
    expect(vlAnnotation).toContain('BridgeValueHelp')
    const vhDef = cds.model.definitions['AdminService.BridgeValueHelp']
    expect(JSON.stringify(vhDef.projection || vhDef.query)).toContain('bridge.management.Bridges')
  })

  // ── 2. Codelist completeness on a fresh deploy ─────────────────────────────
  test('runtime seeding completed the six codelists (insert-if-missing, idempotent)', async () => {
    const types = (await db.run(SELECT.from('bridge.management.RestrictionTypes').columns('code'))).map((r) => r.code)
    for (const t of ['Mass Limit', 'Full Closure', 'Temporary Closure', 'Gross Combination Mass', 'Axle Group Limit', 'Lane Restriction', 'Environmental Restriction']) {
      expect(types).toContain(t)
    }
    // Idempotency: re-running inserts nothing
    const { seedRestrictionCodelists } = require('../srv/lib/restriction-codelists')
    const second = await seedRestrictionCodelists(db, { changedBy: 'test' })
    expect(second.inserted).toBe(0)

    const units = (await db.run(SELECT.from('bridge.management.RestrictionUnits').columns('code'))).map((r) => r.code)
    for (const u of ['t', 't/axle', 'lanes', 'n/a']) expect(units).toContain(u)
    const dirs = (await db.run(SELECT.from('bridge.management.RestrictionDirections').columns('code'))).map((r) => r.code)
    expect(dirs).toContain('One-way')
    const statuses = (await db.run(SELECT.from('bridge.management.RestrictionStatuses').columns('code'))).map((r) => r.code)
    expect(statuses).toContain('Inactive')
  })

  // ── 3. New-type upload ─────────────────────────────────────────────────────
  test('massUploadRestrictions imports a Full Closure with new attributes, audits it and CLOSES the bridge', async () => {
    const csvData = [
      'bridgeRef,restrictionType,restrictionValue,restrictionUnit,restrictionCategory,direction,appliesToVehicleClass,gazetteNumber,gazetteExpiryDate,reviewDueDate,restrictionSeverity,laneAvailability,detourRoute,signageRequired',
      'BRG-TST-901,Full Closure,Closed,n/a,Temporary,Both Directions,All Vehicles,NSW Gazette 2026/77,2026-12-31,2026-09-30,Critical,CLOSED,Detour via Old Hwy,true'
    ].join('\n')

    const result = await asUser(() => bms.send('massUploadRestrictions', { csvData }))
    expect(result.succeeded).toBe(1)
    expect(result.failed).toBe(0)

    const row = await db.run(SELECT.one.from('bridge.management.Restrictions').where({ bridge_ID: ACTIVE_ID }))
    expect(row).toBeTruthy()
    expect(row.restrictionType).toBe('Full Closure')
    expect(row.restrictionRef).toMatch(/^RST-\d{4,}$/)            // auto-generated
    expect(row.gazetteNumber).toBe('NSW Gazette 2026/77')          // new attribute persisted
    expect(String(row.reviewDueDate)).toContain('2026-09-30')
    expect(row.restrictionSeverity).toBe('Critical')
    expect(row.detourRoute).toBe('Detour via Old Hwy')
    expect(!!row.signageRequired).toBe(true)

    // Rule 3: ChangeLog written for the upload (bulk source MassUpload)
    const logs = await db.run(SELECT.from('bridge.management.ChangeLog').where({ objectId: row.ID, changeSource: 'MassUpload' }))
    expect(logs.length).toBeGreaterThan(0)

    // Closure derivation: bridge postingStatus flipped to CLOSED
    const bridge = await db.run(SELECT.one.from('bridge.management.Bridges').columns('postingStatus').where({ ID: ACTIVE_ID }))
    expect(bridge.postingStatus).toBe('CLOSED')
  })

  test('massUploadRestrictions REJECTS an unknown restriction type with a row-level error', async () => {
    const csvData = [
      'bridgeRef,restrictionType,restrictionValue,restrictionUnit',
      'BRG-TST-901,Made Up Type,10,t'
    ].join('\n')
    const result = await asUser(() => bms.send('massUploadRestrictions', { csvData }))
    expect(result.succeeded).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.errors).toMatch(/not a known RestrictionTypes code/)
  })

  // ── 4. Report inclusion ────────────────────────────────────────────────────
  test('the uploaded new-type restriction surfaces in ActiveRestrictions with the new columns', async () => {
    const active = await asUser(() => bms.read('ActiveRestrictions').where({ bridgeId: 'BRG-TST-901' }))
    expect(active.length).toBe(1)
    expect(active[0].restrictionType).toBe('Full Closure')
    expect(active[0].restrictionSeverity).toBe('Critical')
    expect(active[0].restrictionCategory).toBe('Temporary')
    expect(String(active[0].gazetteExpiryDate)).toContain('2026-12-31')
  })

  test('NetworkRestrictionReport surfaces a new-type BridgeRestriction with its new attributes', async () => {
    await db.run(INSERT.into('bridge.management.BridgeRestrictions').entries({
      ID: cds.utils.uuid(), bridge_ID: ACTIVE_ID, restrictionRef: 'BR-TST-9001',
      restrictionType: 'Gross Combination Mass', restrictionValue: '62.5', restrictionUnit: 't',
      restrictionCategory: 'Permanent', restrictionStatus: 'Active', active: true,
      grossCombinationLimit: 62.5, restrictionSeverity: 'Major',
      gazetteNumber: 'NSW Gazette 2026/78', reviewDueDate: '2027-06-30',
      appliesToVehicleClass: 'Road Train'
    }))
    const report = await asUser(() => AdminService.read('NetworkRestrictionReport').where({ restrictionRef: 'BR-TST-9001' }))
    expect(report.length).toBe(1)
    expect(report[0].restrictionType).toBe('Gross Combination Mass')
    expect(Number(report[0].grossCombinationLimit)).toBe(62.5)
    expect(report[0].gazetteNumber).toBe('NSW Gazette 2026/78')
    expect(report[0].appliesToVehicleClass).toBe('Road Train')
    expect(String(report[0].reviewDueDate)).toContain('2027-06-30')
  })

  test('dashboard KPIs count the closed bridge (closure derivation now reaches the dashboard)', async () => {
    const kpis = await asUser(() => bms.send('getNetworkKPIs', {}))
    expect(kpis.closedBridges).toBeGreaterThanOrEqual(1)
    expect(kpis.activeRestrictions).toBeGreaterThanOrEqual(1)
  })
})
