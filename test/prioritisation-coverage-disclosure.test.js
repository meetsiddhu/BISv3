const cds = require('@sap/cds')
const { SELECT, INSERT, DELETE } = cds.ql

// Council B4 — coverage disclosure. The engine already EXCLUDES missing-data criteria from the
// scoring denominator; a run scored on 12 of 40 weight previously read exactly like a
// full-evidence run. This suite asserts the disclosure end to end:
//   • the pure engine returns the includedWeight/totalWeight pair (missing 'flag'/'exclude'
//     criteria widen the gap; 'neutral'/'penalise' policies DO score and close it);
//   • scoreFleet and manual CREATEs stamp the pair onto the run (columns + the
//     criterionBreakdown summary JSON), with honest NULLs on delegated approved-formula runs;
//   • the analytics Runs fact view exposes the pair (and reviewStatus) to every consumer.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const re = require('../srv/lib/prioritisation-rule-engine')

const asManager = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'mgr', roles: ['view', 'manage'] }) }, fn))
const asAnalytics = (fn) => cds.connect.to('PrioritisationAnalyticsService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'sac', roles: ['view'] }) }, fn))

const RUNS = 'bridge.management.PrioritisationAssessment'
const ASSESS = 'PrioritisationService.Assessments'

// ── pure engine (no DB): the pair is returned and reacts to data availability ────────────────
describe('rule engine returns includedWeight/totalWeight (council B4)', () => {
  const crit = (code, bindings) => ({
    ID: 'c-' + code, code, name: code, category: 'Consequence', valueType: 'Numeric', active: true,
    bindings,
    bands: [1, 2, 3, 4, 5].map((l) => ({ lowerBound: l, upperBound: l, score: l * 20, label: 'L' + l, displayOrder: l }))
  })
  const model = (policyB = 'flag') => ({
    code: 'T-COV', version: 1, aggregationMethod: 'WeightedSum',
    criteria: [
      crit('A', [{ sourceType: 'Manual', sourceRef: 'a' }]),
      crit('B', [{ sourceType: 'Attribute', sourceRef: 'B_KEY' }])
    ],
    rules: [],
    classWeights: [
      { criterion_ID: 'c-A', assetClass: '*', transportMode: '*', included: true, weight: 2, missingDataPolicy: 'flag' },
      { criterion_ID: 'c-B', assetClass: '*', transportMode: '*', included: true, weight: 3, missingDataPolicy: policyB }
    ]
  })

  test('a missing "flag" criterion is excluded from includedWeight but stays in totalWeight', () => {
    const ev = re.evaluate({ model: model('flag'), context: { manual: { a: 4 }, attributes: {} }, cfg: {} })
    expect(ev.includedWeight).toBe(2)  // only A scored
    expect(ev.totalWeight).toBe(5)     // the model resolves A(2) + B(3) for this class
    expect(ev.priorityScore).toBe(80)  // A: 4 → 80, sole denominator entry
  })

  test('full data closes the gap: includedWeight equals totalWeight', () => {
    const ev = re.evaluate({ model: model('flag'), context: { manual: { a: 4 }, attributes: { B_KEY: 2 } }, cfg: {} })
    expect(ev.includedWeight).toBe(5)
    expect(ev.totalWeight).toBe(5)
  })

  test('a "neutral" missing policy SCORES the criterion (midpoint), so it counts as included', () => {
    const ev = re.evaluate({ model: model('neutral'), context: { manual: { a: 4 }, attributes: {} }, cfg: {} })
    expect(ev.includedWeight).toBe(5) // neutral(50) enters the denominator — and is flagged
    expect(ev.totalWeight).toBe(5)
    expect(ev.flags.some((f) => f.startsWith('B:'))).toBe(true)
  })

  test('the delegated approved formula returns honest NULLs (no configurable denominator)', () => {
    const m = { code: 'NSW-RISK-V1', version: 1, aggregationMethod: 'RiskCritBlend-v1', criteria: [], classWeights: [], rules: [] }
    const ev = re.evaluate({
      model: m, context: { manual: { dimSafety: 3, dimNetwork: 3, dimFinancial: 3, dimEnvironmental: 3, dimReputational: 3, likelihood: 3, strategy: 'Renew' } }, cfg: {}
    })
    expect(ev.delegated).toBe(true)
    expect(ev.includedWeight).toBeNull()
    expect(ev.totalWeight).toBeNull()
  })
})

// ── service: runs STAMP the pair; the analytics view EXPOSES it ──────────────────────────────
describe('runs stamp includedWeight/totalWeight; analytics view exposes them (council B4)', () => {
  const COV_FLEET = 990601  // Road Bridge, register condition only → partial coverage
  const COV_MANUAL = 990602 // no asset class → delegated NSW-RISK-V1 → NULL pair

  beforeAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(INSERT.into('bridge.management.Bridges').entries([
      { ID: COV_FLEET, bridgeId: 'BRG-COV-' + COV_FLEET, bridgeName: 'Coverage Fleet Bridge', assetClass: 'Road Bridge', transportMode: 'Road', status: 'Active', conditionRating: 5, structuralAdequacyRating: 5, lastInspectionDate: '2026-01-01' },
      { ID: COV_MANUAL, bridgeId: 'BRG-COV-' + COV_MANUAL, bridgeName: 'Coverage Manual Bridge', status: 'Active', conditionRating: 6, structuralAdequacyRating: 6, lastInspectionDate: '2026-01-01' }
    ]))
  })
  beforeEach(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from(RUNS))
  })

  test('scoreFleet stamps the pair on the run columns AND in the criterionBreakdown summary JSON', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const run = await db.run(SELECT.one.from(RUNS).where({ bridge_ID: COV_FLEET, fleetRunId: res.fleetRunId }))
    // a register-condition-only bridge scores on a strict SUBSET of the pack's weight
    expect(Number(run.includedWeight)).toBeGreaterThan(0)
    expect(Number(run.totalWeight)).toBeGreaterThan(Number(run.includedWeight))
    const bd = JSON.parse(run.criterionBreakdown)
    expect(Number(bd.includedWeight)).toBeCloseTo(Number(run.includedWeight), 3)
    expect(Number(bd.totalWeight)).toBeCloseTo(Number(run.totalWeight), 3)
    // the pair reconciles to the per-criterion rows the run froze (same disclosure, two views)
    const includedFromRows = bd.rows.filter((r) => r.included).reduce((s, r) => s + r.weight, 0)
    expect(Number(run.includedWeight)).toBeCloseTo(includedFromRows, 3)
  })

  test('a delegated manual run stamps honest NULLs (approved formula has no configurable denominator)', async () => {
    const f = await asManager((tx) => tx.send('prefill', { bridgeID: COV_MANUAL }))
    const created = await asManager((tx) => tx.run(INSERT.into(ASSESS).entries({
      bridge_ID: COV_MANUAL, dimSafety: 4, dimNetwork: 3, dimFinancial: 3,
      dimEnvironmental: 2, dimReputational: 3, likelihood: f.derivedLikelihood, strategy: 'Maintain'
    })))
    const id = created.ID || (created[0] && created[0].ID)
    const db = await cds.connect.to('db')
    const run = await db.run(SELECT.one.from(RUNS).where({ ID: id }))
    expect(JSON.parse(run.criterionBreakdown).delegated).toBe(true)
    expect(run.includedWeight).toBeNull()
    expect(run.totalWeight).toBeNull()
  })

  test('the analytics Runs fact view exposes includedWeight/totalWeight (and reviewStatus) per run', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const stored = await db.run(SELECT.one.from(RUNS).where({ bridge_ID: COV_FLEET, fleetRunId: res.fleetRunId }))
    const rows = await asAnalytics((tx) => tx.run(
      SELECT.from('PrioritisationAnalyticsService.Runs')
        .columns('ID', 'includedWeight', 'totalWeight', 'reviewStatus', 'runType')
        .where({ active: true })))
    const row = rows.find((r) => r.ID === stored.ID)
    expect(row).toBeTruthy()
    expect(Number(row.includedWeight)).toBeCloseTo(Number(stored.includedWeight), 3)
    expect(Number(row.totalWeight)).toBeCloseTo(Number(stored.totalWeight), 3)
    expect(row.reviewStatus).toBe(stored.reviewStatus) // B3a status disclosed to consumers too
  })
})
