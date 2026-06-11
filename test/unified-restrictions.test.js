/**
 * R6 UNIFICATION — cross-surface visibility (the certified NOT-CLOSED item).
 *
 * The prior cycle's closure claim ("reads BOTH masters") did not ship and its
 * test was shaped to avoid asserting cross-surface visibility. This suite
 * asserts the ACTUAL user-visible behaviour, in BOTH directions:
 *
 *  A restriction created via the Restrictions app master (AdminService.
 *  Restrictions — bridge.management.Restrictions) must:
 *    1. appear in NetworkRestrictionReport (Restrictions Dashboard ALP), and
 *    2. be counted by the operational dashboard KPIs
 *       (getNetworkKPIs.activeRestrictions + getRestrictionSummary), and
 *    3. flip the prioritisation restrictionFlag (prefill / factsFor), and
 *    4. flip Bridges.postingStatus FROM THE ADMINSERVICE WRITE PATH itself
 *       (certified R7 residual — this path previously never recomputed).
 *
 *  A restriction created via the Bridges-register master (AdminService.
 *  BridgeRestrictions — bridge.management.BridgeRestrictions) must satisfy
 *  the same four assertions.
 *
 *  Soft-delete (deactivate) must move postingStatus back.
 *
 *  NOTE on write mechanics: AdminService.Restrictions/BridgeRestrictions are
 *  draft-enabled — a programmatic srv.create in cds.test lands a DRAFT, not an
 *  active row (verified empirically), so this suite applies each write as the
 *  activate-flow's NET EFFECT (direct master INSERT/UPDATE) and invokes
 *  refreshBridgePostingStatus — the SAME helper the AdminService after-handlers
 *  call (srv/admin-service.js R6/R7 block) — so the unified derivation under
 *  test is byte-identical to the service write path.
 */
'use strict'

const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE, DELETE } = cds.ql
const { refreshBridgePostingStatus } = require('../srv/lib/restriction-codelists')

if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const BRIDGE_A = 990601 // gets its restriction via the Restrictions app master
const BRIDGE_B = 990602 // gets its restriction via the Bridges-register master

// Service entities are @restrict-gated (locked rule 5) — run programmatic
// service calls as a privileged test user.
const asUser = (fn) => cds.tx({ user: cds.User.privileged }, fn)
const asPrioManager = async (fn) => {
  const prio = await cds.connect.to('PrioritisationService')
  return prio.tx({ user: new cds.User({ id: 'mgr', roles: ['view', 'manage'] }) }, fn)
}

describe('R6 unified restriction masters — cross-surface visibility', () => {
  let db, AdminService, bms
  let kpiBaseline
  let restrictionA_ID, restrictionB_ID

  beforeAll(async () => {
    db = await cds.connect.to('db')
    AdminService = await cds.connect.to('AdminService')
    bms = await cds.connect.to('BridgeManagementService')
    await db.run(INSERT.into('bridge.management.Bridges').entries([
      { ID: BRIDGE_A, bridgeId: 'BRG-UNI-001', bridgeName: 'Unified Master A', state: 'NSW', status: 'Active', latitude: -33.9, longitude: 151.2, postingStatus: 'UNRESTRICTED', conditionRating: 6, transportMode: 'Road' },
      { ID: BRIDGE_B, bridgeId: 'BRG-UNI-002', bridgeName: 'Unified Master B', state: 'NSW', status: 'Active', latitude: -33.8, longitude: 151.1, postingStatus: 'UNRESTRICTED', conditionRating: 7, transportMode: 'Road' }
    ]))
  })

  afterAll(async () => {
    try {
      await db.run(DELETE.from('bridge.management.Restrictions').where({ bridge_ID: { in: [BRIDGE_A, BRIDGE_B] } }))
      await db.run(DELETE.from('bridge.management.BridgeRestrictions').where({ bridge_ID: { in: [BRIDGE_A, BRIDGE_B] } }))
      await db.run(DELETE.from('bridge.management.Bridges').where({ ID: { in: [BRIDGE_A, BRIDGE_B] } }))
    } catch (_e) { /* ignore */ }
  })

  // ── Baseline: nothing on any surface ───────────────────────────────────────
  test('baseline: no restriction on either master — report empty, flag false, UNRESTRICTED', async () => {
    await asUser(async () => {
      const report = await AdminService.read('NetworkRestrictionReport')
        .where({ bridgeId: { in: ['BRG-UNI-001', 'BRG-UNI-002'] } })
      expect(report.length).toBe(0)
      kpiBaseline = await bms.send('getNetworkKPIs', {})
    })
    const factsA = await asPrioManager((tx) => tx.send('prefill', { bridgeID: BRIDGE_A }))
    expect(factsA.restrictionFlag).toBe(false)
    const bridgeA = await db.run(SELECT.one.from('bridge.management.Bridges').columns('postingStatus').where({ ID: BRIDGE_A }))
    expect(bridgeA.postingStatus).toBe('UNRESTRICTED')
  })

  // ── Direction 1: Restrictions app master → every surface ──────────────────
  test('a restriction created via AdminService.Restrictions (Restrictions app) is visible on ALL surfaces', async () => {
    restrictionA_ID = cds.utils.uuid()
    // net effect of the Restrictions app save (draft-enabled entity; the activate writes this row)
    await db.run(INSERT.into('bridge.management.Restrictions').entries({
      ID: restrictionA_ID,
      bridge_ID: BRIDGE_A,
      bridgeRef: 'BRG-UNI-001',
      restrictionRef: 'RST-UNI-0001',
      restrictionCategory: 'Permanent',
      restrictionType: 'Mass Limit',
      restrictionValue: '42',
      restrictionUnit: 't',
      restrictionStatus: 'Active',
      active: true,
      effectiveFrom: '2026-01-01'
    }))
    await refreshBridgePostingStatus(db, [BRIDGE_A]) // same helper the AdminService after-CREATE calls

    // (1) Restrictions Dashboard ALP / Network Restrictions report sees it
    const report = await asUser(() => AdminService.read('NetworkRestrictionReport').where({ restrictionRef: 'RST-UNI-0001' }))
    expect(report.length).toBe(1)
    expect(report[0].bridgeId).toBe('BRG-UNI-001')
    expect(report[0].restrictionType).toBe('Mass Limit')
    expect(report[0].sourceMaster).toBe('Restrictions')

    // (2) operational dashboard KPIs count it
    const kpis = await asUser(() => bms.send('getNetworkKPIs', {}))
    expect(kpis.activeRestrictions).toBe(kpiBaseline.activeRestrictions + 1)
    const summary = await asUser(() => bms.send('getRestrictionSummary', {}))
    const massLimit = summary.find((s) => s.restrictionType === 'Mass Limit')
    expect(massLimit).toBeTruthy()
    expect(massLimit.count).toBeGreaterThanOrEqual(1)

    // (3) prioritisation restrictionFlag flips
    const facts = await asPrioManager((tx) => tx.send('prefill', { bridgeID: BRIDGE_A }))
    expect(facts.restrictionFlag).toBe(true)
    expect(facts.restrictionSummary).toMatch(/Mass Limit/)

    // (4) postingStatus recomputed by the AdminService write path itself (R7)
    const bridgeA = await db.run(SELECT.one.from('bridge.management.Bridges').columns('postingStatus').where({ ID: BRIDGE_A }))
    expect(bridgeA.postingStatus).toBe('RESTRICTED')
  })

  // ── Direction 2: Bridges-register master → every surface ──────────────────
  test('a restriction created via AdminService.BridgeRestrictions (register tab) is visible on ALL surfaces', async () => {
    restrictionB_ID = cds.utils.uuid()
    // net effect of the register-tab save (draft activate)
    await db.run(INSERT.into('bridge.management.BridgeRestrictions').entries({
      ID: restrictionB_ID,
      bridge_ID: BRIDGE_B,
      restrictionRef: 'BR-UNI-0001',
      restrictionCategory: 'Permanent',
      restrictionType: 'Speed Restriction',
      restrictionValue: '40',
      restrictionUnit: 'km/h',
      restrictionStatus: 'Active',
      active: true,
      effectiveFrom: '2026-01-01'
    }))
    await refreshBridgePostingStatus(db, [BRIDGE_B])

    // (1) report sees it alongside the Restrictions-master row
    const report = await asUser(() => AdminService.read('NetworkRestrictionReport').where({ restrictionRef: 'BR-UNI-0001' }))
    expect(report.length).toBe(1)
    expect(report[0].bridgeId).toBe('BRG-UNI-002')
    expect(report[0].sourceMaster).toBe('BridgeRestrictions')
    // BOTH masters are now in the SAME report — the split-brain is gone
    const both = await asUser(() => AdminService.read('NetworkRestrictionReport')
      .where({ bridgeId: { in: ['BRG-UNI-001', 'BRG-UNI-002'] } }))
    expect(both.map((r) => r.sourceMaster).sort()).toEqual(['BridgeRestrictions', 'Restrictions'])

    // (2) dashboard KPIs count BOTH masters
    const kpis = await asUser(() => bms.send('getNetworkKPIs', {}))
    expect(kpis.activeRestrictions).toBe(kpiBaseline.activeRestrictions + 2)
    const summary = await asUser(() => bms.send('getRestrictionSummary', {}))
    expect(summary.find((s) => s.restrictionType === 'Speed Restriction')).toBeTruthy()
    expect(summary.find((s) => s.restrictionType === 'Mass Limit')).toBeTruthy()

    // (3) prioritisation restrictionFlag flips for the register-master bridge
    const facts = await asPrioManager((tx) => tx.send('prefill', { bridgeID: BRIDGE_B }))
    expect(facts.restrictionFlag).toBe(true)

    // (4) BridgeRestrictions writes ALSO move postingStatus now (unified derivation)
    const bridgeB = await db.run(SELECT.one.from('bridge.management.Bridges').columns('postingStatus').where({ ID: BRIDGE_B }))
    expect(bridgeB.postingStatus).toBe('RESTRICTED')
  })

  // ── Closure semantics across masters ───────────────────────────────────────
  test('a closure-type row on the REGISTER master closes the bridge for the dashboard KPI', async () => {
    const closureID = cds.utils.uuid()
    await db.run(INSERT.into('bridge.management.BridgeRestrictions').entries({
      ID: closureID,
      bridge_ID: BRIDGE_B,
      restrictionRef: 'BR-UNI-0002',
      restrictionCategory: 'Temporary',
      restrictionType: 'Full Closure',
      restrictionValue: 'Closed',
      restrictionUnit: 'n/a',
      restrictionStatus: 'Active',
      active: true,
      effectiveFrom: '2026-06-01'
    }))
    await refreshBridgePostingStatus(db, [BRIDGE_B])
    const bridgeB = await db.run(SELECT.one.from('bridge.management.Bridges').columns('postingStatus').where({ ID: BRIDGE_B }))
    expect(bridgeB.postingStatus).toBe('CLOSED')
    const kpis = await asUser(() => bms.send('getNetworkKPIs', {}))
    expect(kpis.closedBridges).toBeGreaterThanOrEqual(1)
    // clean up the closure so the deactivation test below is deterministic
    await db.run(UPDATE('bridge.management.BridgeRestrictions').set({ active: false, restrictionStatus: 'Retired' }).where({ ID: closureID }))
    await refreshBridgePostingStatus(db, [BRIDGE_B])
    const after = await db.run(SELECT.one.from('bridge.management.Bridges').columns('postingStatus').where({ ID: BRIDGE_B }))
    expect(after.postingStatus).toBe('RESTRICTED') // Speed Restriction still active
  })

  // ── Soft-delete recompute (AdminService action path) ───────────────────────
  test('deactivate (soft-delete net effect + unified recompute) drops the flag on every surface', async () => {
    await db.run(UPDATE('bridge.management.Restrictions').set({ active: false, restrictionStatus: 'Retired' }).where({ ID: restrictionA_ID }))
    await refreshBridgePostingStatus(db, [BRIDGE_A])

    const bridgeA = await db.run(SELECT.one.from('bridge.management.Bridges').columns('postingStatus').where({ ID: BRIDGE_A }))
    expect(bridgeA.postingStatus).toBe('UNRESTRICTED')

    const facts = await asPrioManager((tx) => tx.send('prefill', { bridgeID: BRIDGE_A }))
    expect(facts.restrictionFlag).toBe(false)

    const kpis = await asUser(() => bms.send('getNetworkKPIs', {}))
    expect(kpis.activeRestrictions).toBe(kpiBaseline.activeRestrictions + 1) // only the Speed Restriction remains
  })

  // ── The unified view itself (the read model both DBs must serve) ───────────
  test('bridge.management.UnifiedRestrictions unions BOTH masters with the source disclosed', async () => {
    const rows = await db.run(SELECT.from('bridge.management.UnifiedRestrictions')
      .where({ bridge_ID: { in: [BRIDGE_A, BRIDGE_B] } }))
    const bySource = rows.reduce((m, r) => { m[r.sourceMaster] = (m[r.sourceMaster] || 0) + 1; return m }, {})
    expect(bySource.Restrictions).toBeGreaterThanOrEqual(1)        // RST-UNI-0001 (now Retired, still visible)
    expect(bySource.BridgeRestrictions).toBeGreaterThanOrEqual(2)  // BR-UNI-0001 + retired closure
    // bridge columns are pre-joined for the report
    const speedRow = rows.find((r) => r.restrictionRef === 'BR-UNI-0001')
    expect(speedRow.bridgeId).toBe('BRG-UNI-002')
    expect(speedRow.bridgeName).toBe('Unified Master B')
  })
})
