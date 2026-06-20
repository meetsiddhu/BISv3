const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE } = cds.ql
const { DEMO_BRIDGES } = require('../srv/demo-handler')

// End-to-end template journey — the exact path a new customer walks:
//   Template library → instantiateTemplate (TPL-BRIDGE-INTL-V1 → working model,
//   stamped with a SPECIFIC 'Road Bridge' class) → activate → scoreFleet over the
//   demo portfolio → banded, ranked, audited runs, with the template's safety floor
//   (Critical condition → P1 + review hold) firing on the worst bridge.
// The seeded NSW-PACK-V1 model stays ACTIVE throughout: the instantiated model must
// win resolution on class-specificity + the deterministic newest-modified tie-break,
// not by retiring the incumbent.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const NS = 'bridge.management.'
const BRIDGE_TPL_ID = '00000000-0000-4000-8100-000000000001' // TPL-BRIDGE-INTL-V1

const asAdmin = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'adm', roles: ['view', 'manage', 'admin'] }) }, fn))

describe('Template → working model → fleet scoring (end-to-end)', () => {
  let workingModelID

  test('step 1-2: instantiate with a specific Road Bridge class stamp and activate', async () => {
    const db = await cds.connect.to('db')
    const res = await asAdmin((tx) => tx.send('instantiateTemplate', {
      templateID: BRIDGE_TPL_ID, code: 'BRIDGE-FLEET-V1', name: 'Bridge fleet working model',
      assetClass: 'Road Bridge'
    }))
    workingModelID = res.modelID
    expect(res.status).toBe('Draft')

    // every copied weight row carries the specific class (template ships '*')
    const weights = await db.run(SELECT.from(NS + 'AssetClassCriterionWeight').where({ model_ID: workingModelID }))
    expect(weights.length).toBeGreaterThan(0)
    for (const w of weights) expect(w.assetClass).toBe('Road Bridge')

    // Draft → Active through the service (the governed path); NSW-PACK-V1 stays Active.
    const srv = await cds.connect.to('PrioritisationService')
    await srv.tx({ user: new cds.User({ id: 'adm', roles: ['view', 'manage', 'admin'] }) }, (tx) =>
      tx.run(UPDATE(srv.entities.Models).set({ status: 'Active' }).where({ ID: workingModelID })))
    const m = await db.run(SELECT.one.from(NS + 'PrioritisationModel').where({ ID: workingModelID }))
    expect(m.status).toBe('Active')
    const pack = await db.run(SELECT.one.from(NS + 'PrioritisationModel').where({ code: 'NSW-PACK-V1' }))
    expect(pack.status).toBe('Active') // the incumbent is NOT retired
  })

  test('step 3: load the demo portfolio (subset incl. one Critical-condition bridge)', async () => {
    const db = await cds.connect.to('db')
    const subset = DEMO_BRIDGES.filter(b =>
      ['Harbour Gate Bridge', 'Riverview Arch Bridge', 'Milfield Truss Bridge', 'Saltwater River Bridge', 'Oyster Bay Bridge'].includes(b.bridgeName))
    expect(subset.length).toBe(5)
    const now = new Date().toISOString()
    await db.run(INSERT.into(NS + 'Bridges').entries(subset.map(b => ({
      ...b, title: b.bridgeName, createdAt: now, createdBy: 'e2e', modifiedAt: now, modifiedBy: 'e2e'
    }))))
    const n = await db.run(SELECT.from(NS + 'Bridges').columns('ID'))
    expect(n.length).toBeGreaterThanOrEqual(5)
  })

  test('step 4: scoreFleet resolves the instantiated model for Road Bridges (incumbent still Active)', async () => {
    const res = await asAdmin((tx) => tx.send('scoreFleet', {}))
    expect(res.scored).toBeGreaterThanOrEqual(5)
    expect(res.excluded).toBe(0)

    const db = await cds.connect.to('db')
    const runs = await db.run(SELECT.from(NS + 'PrioritisationAssessment')
      .where({ fleetRunId: res.fleetRunId, active: true }))
    expect(runs.length).toBe(res.scored)
    for (const r of runs) {
      // class-specific weights + newest-modified tie-break beat the still-Active pack model
      expect(r.modelCode).toBe('BRIDGE-FLEET-V1')
      expect(['P1', 'P2', 'P3', 'P4', 'P5']).toContain(r.band)
      expect(r.fleetRank).toBeGreaterThanOrEqual(1)
      expect(r.weightSetHash).toBeTruthy()
      expect(r.paramSnapshot).toBeTruthy()
    }
  })

  test('step 5: the template safety floor fired — Critical bridge lands P1 with review hold', async () => {
    const db = await cds.connect.to('db')
    // Milfield Truss Bridge: legacy conditionRating 2 → band 5 (Critical) → COND_OVERALL
    // score 100 → SafetyFloor {when: ">=90", floorBand: "P1", forceReview: true}.
    const milfield = await db.run(SELECT.one.from(NS + 'Bridges').where({ bridgeName: 'Milfield Truss Bridge' }))
    const run = await db.run(SELECT.one.from(NS + 'PrioritisationAssessment')
      .where({ bridge_ID: milfield.ID, active: true, runType: 'fleet' }))
    expect(run.band).toBe('P1')
    expect(run.reviewStatus).toBe('pending') // held for engineering review
    const breakdown = JSON.parse(run.criterionBreakdown)
    const cond = (breakdown.rows || []).find(r => r.code === 'COND_OVERALL')
    expect(cond.score).toBe(100)

    // A healthy bridge (Harbour Gate, rating 8 → band 2, score 30) ranks in a lower band.
    const harbourGate = await db.run(SELECT.one.from(NS + 'Bridges').where({ bridgeName: 'Harbour Gate Bridge' }))
    const goodRun = await db.run(SELECT.one.from(NS + 'PrioritisationAssessment')
      .where({ bridge_ID: harbourGate.ID, active: true, runType: 'fleet' }))
    expect(goodRun.band).not.toBe('P1')
    expect(goodRun.reviewStatus).toBeFalsy()
  })
})
