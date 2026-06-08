const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE, DELETE } = cds.ql

// Integration coverage for the bounded PrioritisationService: server-side compute, append-only
// immutability, scope gating, ChangeLog, and reproducibility (config edit doesn't mutate a run).
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const asManager = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'mgr', roles: ['view', 'manage'] }) }, fn))
const asViewer = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'vwr', roles: ['view'] }) }, fn))
const asAdmin = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'adm', roles: ['view', 'manage', 'admin'] }) }, fn))

let BRIDGE_ID
const ASSESS = 'PrioritisationService.Assessments'
const baseInputs = () => ({ dimSafety: 5, dimNetwork: 4, dimFinancial: 3, dimEnvironmental: 2, dimReputational: 4, likelihood: 4, strategy: 'Renew' })

describe('PrioritisationService', () => {
  beforeAll(async () => {
    const db = await cds.connect.to('db')
    let b = await db.run(SELECT.one.from('bridge.management.Bridges').columns('ID'))
    if (!b) {
      // The in-memory test DB has no Bridges seed — create one so prefill has federated facts.
      BRIDGE_ID = 990201
      await db.run(INSERT.into('bridge.management.Bridges').entries({
        ID: BRIDGE_ID, bridgeId: 'BRG-TEST-PRIO', bridgeName: 'Prioritisation Test Bridge',
        conditionRating: 4, structuralAdequacyRating: 5, loadRating: 42, lastInspectionDate: '2025-10-01',
        likelyFailureCostAud: 1200000, mitigationCostAud: 350000
      }))
    } else { BRIDGE_ID = b.ID }
  })
  afterAll(async () => {
    try {
      const db = await cds.connect.to('db')
      await db.run(DELETE.from('bridge.management.PrioritisationAssessment'))
    } catch (_e) { /* ignore */ }
  })

  test('CREATE computes the score SERVER-SIDE (ignoring client-supplied outputs) + writes ChangeLog', async () => {
    const created = await asManager((tx) => tx.run(INSERT.into(ASSESS).entries(
      // client tries to inject a bogus score/band — must be overwritten by the engine
      Object.assign({ bridge_ID: BRIDGE_ID, priorityScore: 999, band: 'P9' }, baseInputs())
    )))
    const id = created.ID || (created[0] && created[0].ID)
    const db = await cds.connect.to('db')
    const row = await db.run(SELECT.one.from('bridge.management.PrioritisationAssessment').where({ ID: id }))
    expect(row.priorityScore).not.toBe(999)
    expect(row.band).not.toBe('P9')
    expect(['P1', 'P2', 'P3', 'P4', 'P5']).toContain(row.band)
    expect(row.tier).toBeGreaterThanOrEqual(1)
    expect(row.paramSnapshot).toBeTruthy() // immutable reproducibility stamp
    expect(row.configVersion).toBeTruthy()
    const logs = await db.run(SELECT.from('bridge.management.ChangeLog').where({ objectId: String(id) }))
    expect(logs.length).toBeGreaterThan(0)
  })

  test('runs are APPEND-ONLY — UPDATE/PATCH is rejected (no UPDATE grant + immutability guard)', async () => {
    const created = await asManager((tx) => tx.run(INSERT.into(ASSESS).entries(Object.assign({ bridge_ID: BRIDGE_ID }, baseInputs()))))
    const id = created.ID || (created[0] && created[0].ID)
    await expect(asManager((tx) => tx.run(UPDATE(ASSESS).set({ dimSafety: 1 }).where({ ID: id }))))
      .rejects.toThrow() // blocked (no UPDATE granted to anyone; + before-UPDATE immutability reject)
  })

  test('a view-only user cannot CREATE a run (403 — scope gating enforced)', async () => {
    await expect(asViewer((tx) => tx.run(INSERT.into(ASSESS).entries(Object.assign({ bridge_ID: BRIDGE_ID }, baseInputs())))))
      .rejects.toThrow()
  })

  test('prefill returns read-only federated facts + a derived likelihood', async () => {
    const facts = await asManager((tx) => tx.send('prefill', { bridgeID: BRIDGE_ID }))
    expect(facts).toBeTruthy()
    expect(facts.inputsTotal).toBe(5)
    expect(facts.derivedLikelihood).toBeGreaterThanOrEqual(1)
    expect(facts.derivedLikelihood).toBeLessThanOrEqual(5)
    expect(typeof facts.restrictionFlag).toBe('boolean')
  })

  test('a new run SUPERSEDES the prior active run for the same bridge (no double-count)', async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from('bridge.management.PrioritisationAssessment').where({ bridge_ID: BRIDGE_ID }))
    const r1 = await asManager((tx) => tx.run(INSERT.into(ASSESS).entries(Object.assign({ bridge_ID: BRIDGE_ID }, baseInputs()))))
    const id1 = r1.ID || (r1[0] && r1[0].ID)
    const r2 = await asManager((tx) => tx.run(INSERT.into(ASSESS).entries(Object.assign({ bridge_ID: BRIDGE_ID }, baseInputs(), { dimSafety: 5 }))))
    const id2 = r2.ID || (r2[0] && r2[0].ID)
    const active = await db.run(SELECT.from('bridge.management.PrioritisationAssessment').where({ bridge_ID: BRIDGE_ID, active: true }))
    expect(active.length).toBe(1) // exactly one current run per bridge
    expect(active[0].ID).toBe(id2)
    const old = await db.run(SELECT.one.from('bridge.management.PrioritisationAssessment').where({ ID: id1 }))
    expect(old.active).toBe(false)
    expect(old.supersededBy_ID).toBe(id2) // prior run preserved + linked, not deleted
  })

  test('likelihood override WITHOUT a reason is rejected; WITH a reason it is accepted + logged', async () => {
    // derived likelihood for the test bridge is 4; choosing 1 is an override.
    await expect(asManager((tx) => tx.run(INSERT.into(ASSESS).entries(Object.assign({ bridge_ID: BRIDGE_ID }, baseInputs(), { likelihood: 1 })))))
      .rejects.toThrow(/justification|override/i)
    const ok = await asManager((tx) => tx.run(INSERT.into(ASSESS).entries(Object.assign({ bridge_ID: BRIDGE_ID }, baseInputs(), { likelihood: 1, likelihoodOverrideReason: 'recent engineer inspection' }))))
    const id = ok.ID || (ok[0] && ok[0].ID)
    const db = await cds.connect.to('db')
    const row = await db.run(SELECT.one.from('bridge.management.PrioritisationAssessment').where({ ID: id }))
    expect(row.likelihoodOverridden).toBe(true)
    expect(row.likelihoodOverrideReason).toMatch(/inspection/)
  })

  test('run captures the bridge $ cost snapshot (reproducible exec exposure)', async () => {
    const created = await asManager((tx) => tx.run(INSERT.into(ASSESS).entries(Object.assign({ bridge_ID: BRIDGE_ID }, baseInputs()))))
    const id = created.ID || (created[0] && created[0].ID)
    const db = await cds.connect.to('db')
    const row = await db.run(SELECT.one.from('bridge.management.PrioritisationAssessment').where({ ID: id }))
    expect(Number(row.likelyFailureCostAud)).toBe(1200000)
    expect(Number(row.mitigationCostAud)).toBe(350000)
  })

  test('raiseWorkRequest creates a QUEUED outbound record + ChangeLog, and never writes EAM', async () => {
    const created = await asManager((tx) => tx.run(INSERT.into(ASSESS).entries(Object.assign({ bridge_ID: BRIDGE_ID }, baseInputs()))))
    const id = created.ID || (created[0] && created[0].ID)
    const srv = await cds.connect.to('PrioritisationService')
    const wr = await srv.tx({ user: new cds.User({ id: 'mgr', roles: ['view', 'manage'] }) },
      (tx) => tx.send({ event: 'raiseWorkRequest', entity: 'Assessments', params: [{ ID: id }], data: { requestType: 'Inspection', notes: 'urgent' } }))
    expect(wr).toBeTruthy()
    expect(wr.status).toBe('QUEUED') // never auto-sent; EAM untouched in standalone
    expect(wr.requestType).toBe('Inspection')
    expect(wr.payload).toMatch(/BIS-Prioritisation/)
    const db = await cds.connect.to('db')
    const logs = await db.run(SELECT.from('bridge.management.ChangeLog').where({ objectType: 'EamWorkRequest' }))
    expect(logs.length).toBeGreaterThan(0)
  })

  test('reportPdf returns a server-rendered, valid PDF (figures from the immutable runs)', async () => {
    await asManager((tx) => tx.run(INSERT.into(ASSESS).entries(Object.assign({ bridge_ID: BRIDGE_ID }, baseInputs()))))
    const srv = await cds.connect.to('PrioritisationService')
    const doc = await srv.tx({ user: new cds.User({ id: 'v', roles: ['view'] }) }, (tx) => tx.send('reportPdf'))
    expect(doc).toBeTruthy()
    expect(doc.contentType).toBe('application/pdf')
    expect(doc.filename).toMatch(/\.pdf$/)
    expect(doc.docId).toMatch(/^BIS-PRI-/)
    const buf = Buffer.from(doc.contentBase64, 'base64')
    expect(buf.slice(0, 5).toString('latin1')).toBe('%PDF-')
    expect(buf.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true)
  })

  test('a stored run is reproducible — editing config later does NOT change its frozen outputs', async () => {
    const created = await asManager((tx) => tx.run(INSERT.into(ASSESS).entries(Object.assign({ bridge_ID: BRIDGE_ID }, baseInputs()))))
    const id = created.ID || (created[0] && created[0].ID)
    const db = await cds.connect.to('db')
    const before = await db.run(SELECT.one.from('bridge.management.PrioritisationAssessment').where({ ID: id }))
    // Admin publishes a new config version with very different weights.
    await asAdmin((tx) => tx.run(INSERT.into('PrioritisationService.Config').entries({
      version: 'v2-test', active: true, wSafety: 0.9, wNetwork: 0.025, wFinancial: 0.025, wEnvironmental: 0.025, wReputational: 0.025
    })))
    const after = await db.run(SELECT.one.from('bridge.management.PrioritisationAssessment').where({ ID: id }))
    expect(after.priorityScore).toBe(before.priorityScore) // the old run is frozen
    expect(after.band).toBe(before.band)
    expect(after.criticality).toBe(before.criticality)
  })
})
