const cds = require('@sap/cds')
const { SELECT, INSERT, DELETE } = cds.ql

// Council B3a + B3b — review HOLDS and the dual-active double-count guard, asserted through the
// SAME surfaces an end user reads (the service worklist query the UI sends, the analytics
// BandSummary aggregate, and the literal text rendered into the exec PDF):
//   B3a  a fleet run that trips a forceReview rule (seeded Escalate on FRACTURE_CRITICAL) is
//        stamped reviewStatus='pending' and EXCLUDED from the default worklist, BandSummary and
//        the PDF portfolio/coverage; it stays readable via an explicit reviewStatus filter
//        (the worklist 'Pending review' segment); releaseRun (manage scope) clears the hold,
//        is ChangeLogged, restores the run to every default surface, and rejects inactive runs.
//   B3b  a bridge with BOTH an active manual and an active fleet run counts/show ONCE on the
//        default surfaces, with deterministic precedence: manual beats fleet.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const asManager = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'mgr', roles: ['view', 'manage'] }) }, fn))
const asViewer = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'vwr', roles: ['view'] }) }, fn))
const asAnalytics = (fn) => cds.connect.to('PrioritisationAnalyticsService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'sac', roles: ['view'] }) }, fn))

const RUNS = 'bridge.management.PrioritisationAssessment'
const ASSESS = 'PrioritisationService.Assessments'

// assetClass 'Road Bridge' resolves to the seeded NSW-PACK-V1 (WeightedSumWithRules).
// H_FCM carries the FRACTURE_CRITICAL='true' attribute → value band score 100 → the seeded
// Escalate rule (when >=100, raiseBands 1, forceReview true) HOLDS the run.
const bridge = (id, over = {}) => Object.assign({
  ID: id, bridgeId: 'BRG-HOLD-' + id, bridgeName: 'Review Hold Bridge ' + id,
  assetClass: 'Road Bridge', transportMode: 'Road', status: 'Active',
  conditionRating: 5, structuralAdequacyRating: 5, lastInspectionDate: '2026-01-01'
}, over)

const H_NORMAL = 990501 // plain data-only run — never held
const H_FCM = 990502    // fracture-critical → forceReview → HELD
const H_DUAL = 990503   // gets a manual run AND a fleet run — must count ONCE (manual wins)

// the UI's default worklist query (App.controller.js _loadWorklist, 'current' segment)
const defaultWorklist = () => asViewer((tx) => tx.run(SELECT.from(ASSESS).where({ active: true })))
// the UI's 'Pending review' segment query (explicit reviewStatus filter)
const pendingWorklist = () => asViewer((tx) => tx.run(SELECT.from(ASSESS).where({ active: true, reviewStatus: 'pending' })))
const bandSummary = () => asAnalytics((tx) => tx.run(SELECT.from('PrioritisationAnalyticsService.BandSummary')))
const bandTotal = (bands) => bands.reduce((s, b) => s + Number(b.runs), 0)

// Extract the rendered text from the (uncompressed) PDF content streams — same approach as the
// B6a appendix tests: wrapped text re-joins on spaces, so phrases reconstruct exactly.
const pdfText = (doc) => {
  const s = Buffer.from(doc.contentBase64, 'base64').toString('latin1')
  const out = []
  const re = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g
  let m
  while ((m = re.exec(s))) out.push(m[1].replace(/\\([()\\])/g, '$1'))
  return out.join(' ')
}
const report = () => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'v', roles: ['view'] }) }, (tx) => tx.send('reportPdf')))

// Engineer run created the supported way (prefill → derived likelihood → save).
const createManualRun = async (bridgeID) => {
  const f = await asManager((tx) => tx.send('prefill', { bridgeID }))
  const created = await asManager((tx) => tx.run(INSERT.into(ASSESS).entries({
    bridge_ID: bridgeID, dimSafety: 3, dimNetwork: 3, dimFinancial: 3,
    dimEnvironmental: 3, dimReputational: 3, likelihood: f.derivedLikelihood, strategy: 'Renew'
  })))
  return created.ID || (created[0] && created[0].ID)
}

describe('B3a — forceReview HOLDS fleet runs (reviewStatus pending)', () => {
  beforeAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(INSERT.into('bridge.management.Bridges').entries([
      bridge(H_NORMAL), bridge(H_FCM), bridge(H_DUAL, { conditionRating: 4 })
    ]))
    await db.run(INSERT.into('bridge.management.AttributeValues').entries({
      ID: cds.utils.uuid(), objectType: 'bridge', objectId: String(H_FCM),
      attributeKey: 'FRACTURE_CRITICAL', valueText: 'true'
    }))
  })
  beforeEach(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from(RUNS))
  })

  test('scoreFleet stamps reviewStatus=pending ONLY on runs that tripped forceReview, and logs the held count', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const held = await db.run(SELECT.one.from(RUNS).where({ bridge_ID: H_FCM, fleetRunId: res.fleetRunId }))
    expect(held.reviewStatus).toBe('pending')
    expect(JSON.parse(held.criterionBreakdown).forceReview).toBe(true) // the hold mirrors the engine flag
    const normal = await db.run(SELECT.one.from(RUNS).where({ bridge_ID: H_NORMAL, fleetRunId: res.fleetRunId }))
    expect(normal.reviewStatus).toBeNull()
    // the held count is on the fleet audit trail (rule 3)
    const logs = await db.run(SELECT.from('bridge.management.ChangeLog')
      .where({ objectType: 'PrioritisationFleetRun', objectId: res.fleetRunId }))
    expect(logs.some((l) => l.fieldName === 'heldForReview' && l.newValue === '1')).toBe(true)
  })

  test('a HELD run is absent from the default worklist but visible via the explicit pending filter', async () => {
    await asManager((tx) => tx.send('scoreFleet', {}))
    const rows = await defaultWorklist()
    expect(rows.some((r) => r.bridge_ID === H_FCM)).toBe(false)   // held → hidden by default
    expect(rows.some((r) => r.bridge_ID === H_NORMAL)).toBe(true) // un-held runs unaffected
    const pending = await pendingWorklist()
    expect(pending.length).toBe(1)
    expect(pending[0].bridge_ID).toBe(H_FCM)                      // …but reachable on request
    expect(pending[0].reviewStatus).toBe('pending')
  })

  test('a HELD run is excluded from BandSummary and from the PDF portfolio coverage', async () => {
    await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const activeCount = (await db.run(SELECT.from(RUNS).where({ active: true }))).length
    expect(activeCount).toBe(3) // all three bridges scored…
    expect(bandTotal(await bandSummary())).toBe(2) // …but the held one never enters the aggregate
    const text = pdfText(await report())
    expect(text).toContain('of 2 assessed structures')            // coverage counts 2, not 3
    expect(text).toContain('Held for review (excluded)')          // and the exclusion is disclosed
  })

  test('releaseRun clears the hold, is ChangeLogged, and the run RETURNS to worklist + BandSummary + PDF', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const held = await db.run(SELECT.one.from(RUNS).where({ bridge_ID: H_FCM, fleetRunId: res.fleetRunId }))
    const out = await asManager((tx) => tx.send('releaseRun', { ID: held.ID }))
    expect(out.reviewStatus).toBeNull()
    const after = await db.run(SELECT.one.from(RUNS).where({ ID: held.ID }))
    expect(after.reviewStatus).toBeNull()
    expect(after.band).toBe(held.band) // the hold is lifecycle only — frozen figures untouched
    expect(after.priorityScore).toBe(held.priorityScore)
    // ChangeLog on the CUD (rule 3)
    const logs = await db.run(SELECT.from('bridge.management.ChangeLog')
      .where({ objectType: 'PrioritisationAssessment', objectId: String(held.ID) }))
    expect(logs.some((l) => l.fieldName === 'reviewStatus' && l.oldValue === 'pending' && l.newValue === '')).toBe(true)
    // every default surface now includes it
    const rows = await defaultWorklist()
    expect(rows.some((r) => r.ID === held.ID)).toBe(true)
    expect(bandTotal(await bandSummary())).toBe(3)
    expect(pdfText(await report())).toContain('of 3 assessed structures')
  })

  test('releaseRun REJECTS an inactive (superseded) run and a missing run', async () => {
    const r1 = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const held1 = await db.run(SELECT.one.from(RUNS).where({ bridge_ID: H_FCM, fleetRunId: r1.fleetRunId }))
    await asManager((tx) => tx.send('scoreFleet', {})) // supersedes the first fleet run
    await expect(asManager((tx) => tx.send('releaseRun', { ID: held1.ID })))
      .rejects.toThrow(/not active|superseded/i)
    const still = await db.run(SELECT.one.from(RUNS).where({ ID: held1.ID }))
    expect(still.reviewStatus).toBe('pending') // the historical hold is preserved, not rewritten
    await expect(asManager((tx) => tx.send('releaseRun', { ID: cds.utils.uuid() })))
      .rejects.toThrow(/not found/i)
  })

  test('releaseRun is manage-gated — a view-only user is rejected', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const held = await db.run(SELECT.one.from(RUNS).where({ bridge_ID: H_FCM, fleetRunId: res.fleetRunId }))
    await expect(asViewer((tx) => tx.send('releaseRun', { ID: held.ID }))).rejects.toThrow()
    const after = await db.run(SELECT.one.from(RUNS).where({ ID: held.ID }))
    expect(after.reviewStatus).toBe('pending')
  })
})

describe('B3b — dual-active double-count guard (manual beats fleet)', () => {
  beforeEach(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from(RUNS))
  })

  test('a bridge with BOTH an active manual and an active fleet run shows ONCE on the default worklist — the manual run', async () => {
    const manualId = await createManualRun(H_DUAL)
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    // sanity: the dual-active state really exists (fleet never retires engineer judgement)
    const actives = await db.run(SELECT.from(RUNS).where({ bridge_ID: H_DUAL, active: true }))
    expect(actives.length).toBe(2)
    expect(actives.map((a) => a.runType).sort()).toEqual(['fleet', 'manual'])
    // default worklist: ONE row for the bridge, and it is the engineer's
    const rows = await defaultWorklist()
    const dualRows = rows.filter((r) => r.bridge_ID === H_DUAL)
    expect(dualRows.length).toBe(1)
    expect(dualRows[0].ID).toBe(manualId)
    expect(dualRows[0].runType).toBe('manual')
    // the suppressed fleet run is NOT lost — an explicit fleet filter still reaches it
    const fleetRows = await asViewer((tx) => tx.run(
      SELECT.from(ASSESS).where({ bridge_ID: H_DUAL, fleetRunId: res.fleetRunId })))
    expect(fleetRows.length).toBe(1)
  })

  test('BandSummary and the PDF count the dual-active bridge ONCE (manual wins) and never double-count', async () => {
    const manualId = await createManualRun(H_DUAL)
    await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const manual = await db.run(SELECT.one.from(RUNS).where({ ID: manualId }))
    const active = await db.run(SELECT.from(RUNS).where({ active: true }))
    expect(active.length).toBe(4) // manual + 3 fleet (one held, one dual-duplicate)
    // effective set = H_NORMAL fleet + H_DUAL manual (H_FCM held; H_DUAL fleet suppressed)
    const bands = await bandSummary()
    expect(bandTotal(bands)).toBe(2)
    // the manual run's band is the one aggregated for the dual bridge
    const manualBand = bands.find((b) => b.band === manual.band)
    expect(manualBand).toBeTruthy()
    expect(Number(manualBand.runs)).toBeGreaterThanOrEqual(1)
    const text = pdfText(await report())
    expect(text).toContain('of 2 assessed structures')
  })
})
