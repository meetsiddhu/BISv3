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

  test('run FREEZES the rubric wording for the chosen dimension levels (audit reproducibility)', async () => {
    const created = await asManager((tx) => tx.run(INSERT.into(ASSESS).entries(Object.assign({ bridge_ID: BRIDGE_ID }, baseInputs())))) // dimSafety:5
    const id = created.ID || (created[0] && created[0].ID)
    const db = await cds.connect.to('db')
    const row = await db.run(SELECT.one.from('bridge.management.PrioritisationAssessment').where({ ID: id }))
    const rub = JSON.parse(row.rubricSnapshot)
    expect(rub.dimSafety.level).toBe(5)
    expect(rub.dimSafety.text).toMatch(/fatalities/i) // the frozen "Multiple fatalities credible" anchor
    expect(rub.dimReputational.text).toBeTruthy()
  })

  test('a run WITHOUT a bridge is rejected (cannot bypass federated facts / override gate)', async () => {
    await expect(asManager((tx) => tx.run(INSERT.into(ASSESS).entries(baseInputs())))) // no bridge_ID
      .rejects.toThrow(/must reference a bridge/i)
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

// ── Council B6a: the PDF methodology appendix must document HOW the portfolio's runs were
// ACTUALLY scored — branching on each stored run's formulaVersion. Rule-engine runs get the
// configurable-engine section (model code/version, frozen criteria count, weightSetHash);
// legacy v1-normalised runs keep the approved-formula text; a mixed portfolio prints BOTH
// with per-method run counts. Assertions parse the PDF BYTES for the literal rendered text.
describe('reportPdf methodology appendix (council B6a — formulaVersion-aware)', () => {
  const RUNS = 'bridge.management.PrioritisationAssessment'
  const ROAD_BRIDGE_ID = 990210 // assetClass 'Road Bridge' → resolves to seeded NSW-PACK-V1 in scoreFleet
  const LEGACY_MARKER = 'criticality = sum(dimension x weight)'
  const RULE_MARKER = 'Non-compensatory rules (SafetyFloor / Veto / Escalate / HurdleMin)'

  // Extract every text-show string from the (uncompressed) PDF content streams and re-join with
  // spaces — word-wrap only ever breaks at spaces, so wrapped paragraphs reconstruct exactly.
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

  beforeAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(INSERT.into('bridge.management.Bridges').entries({
      ID: ROAD_BRIDGE_ID, bridgeId: 'BRG-PDF-RULE', bridgeName: 'PDF Rule Engine Bridge',
      assetClass: 'Road Bridge', transportMode: 'Road', status: 'Active',
      conditionRating: 3, structuralAdequacyRating: 4, lastInspectionDate: '2026-01-01'
    }))
  })
  beforeEach(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from(RUNS))
  })

  test('legacy-only portfolio: the approved-formula text appears, NO rule-engine section', async () => {
    await asManager((tx) => tx.run(INSERT.into(ASSESS).entries(Object.assign({ bridge_ID: BRIDGE_ID }, baseInputs()))))
    const db = await cds.connect.to('db')
    const run = await db.run(SELECT.one.from(RUNS).where({ bridge_ID: BRIDGE_ID, active: true }))
    expect(run.formulaVersion).toBe('v1-normalised') // delegated NSW-RISK-V1 → legacy methodology
    const text = pdfText(await report())
    expect(text).toContain(LEGACY_MARKER)
    expect(text).not.toContain(RULE_MARKER)
    expect(text).not.toContain('Mixed-method portfolio')
  })

  test('rule-engine portfolio: model identity, FROZEN criteria count and weightSetHash are printed; no legacy formula', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    expect(res.scored).toBeGreaterThanOrEqual(1)
    const db = await cds.connect.to('db')
    const run = await db.run(SELECT.one.from(RUNS).where({ fleetRunId: res.fleetRunId, bridge_ID: ROAD_BRIDGE_ID }))
    expect(run.formulaVersion).toBe('rule-engine-v1')
    const text = pdfText(await report())
    expect(text).toContain(RULE_MARKER)
    expect(text).toContain('weighted sum') // the aggregation description
    expect(text).toContain('Model ' + run.modelCode + ' v' + run.modelVersion)
    expect(text).toContain(run.weightSetHash) // the FULL stored hash, byte-for-byte
    const frozenCriteria = JSON.parse(run.criterionBreakdown).rows.length
    expect(frozenCriteria).toBeGreaterThan(0)
    expect(text).toContain(frozenCriteria + ' criteria frozen per run') // from the run, not the live model
    expect(text).not.toContain(LEGACY_MARKER)
    expect(text).not.toContain('Mixed-method portfolio')
  })

  test('MIXED portfolio: BOTH methodology sections appear with per-method run counts', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    expect(res.scored).toBeGreaterThanOrEqual(1)
    await asManager((tx) => tx.run(INSERT.into(ASSESS).entries(Object.assign({ bridge_ID: BRIDGE_ID }, baseInputs()))))
    const db = await cds.connect.to('db')
    const active = await db.run(SELECT.from(RUNS).where({ active: true }))
    const ruleCount = active.filter((r) => String(r.formulaVersion).startsWith('rule-engine')).length
    const legacyCount = active.length - ruleCount
    expect(ruleCount).toBeGreaterThanOrEqual(1)
    expect(legacyCount).toBeGreaterThanOrEqual(1)
    const text = pdfText(await report())
    expect(text).toContain('Mixed-method portfolio: ' + ruleCount + ' rule-engine run(s) and ' + legacyCount + ' approved-formula run(s)')
    expect(text).toContain(LEGACY_MARKER) // legacy section present…
    expect(text).toContain(RULE_MARKER)   // …AND the rule-engine section
  })
})
