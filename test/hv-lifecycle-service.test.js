const cds = require('@sap/cds')
const { SELECT, INSERT } = cds.ql

// End-to-end service tests for the lifecycle/HV additions: assessment-vehicle seed,
// assessHeavyVehicle / assessRoute / forecastCondition / optimiseCapitalProgram actions,
// the treatment log, and the new additive schema fields (scour, element CS, defect extent).
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const NS = 'bridge.management.'
const admin = { user: new cds.User({ id: 'adm', roles: ['view', 'manage', 'admin'] }) }
const onPrio = (fn) => cds.connect.to('PrioritisationService').then(s => s.tx(admin, fn))
const onAdmin = (fn) => cds.connect.to('AdminService').then(s => s.tx(admin, (tx) => fn(tx, s)))

const BID = 70501

beforeAll(async () => {
  const db = await cds.connect.to('db')
  const now = new Date().toISOString()
  await db.run(INSERT.into(NS + 'Bridges').entries([{
    ID: BID, bridgeId: 'HV-001', bridgeName: 'Assessment Test Bridge', title: 'Assessment Test Bridge',
    assetClass: 'Road Bridge', transportMode: 'Road', state: 'NSW', status: 'Active',
    conditionRating: 6, yearBuilt: 1985, clearanceHeight: 4.6,
    mitigationCostAud: 120000, expectedValueAud: 400000, benefitCostRatio: 2.5,
    createdAt: now, createdBy: 'e2e', modifiedAt: now, modifiedBy: 'e2e'
  }]))
  await db.run(INSERT.into(NS + 'BridgeCapacities').entries([{
    ID: cds.utils.uuid(), bridge_ID: BID, capacityType: 'LoadRating', capacityStatus: 'Current',
    ratingFactor: 1.05, grossMassLimit: 68, grossCombined: 68,
    steerAxleLimit: 6.5, tandemGroupLimit: 17, triAxleGroupLimit: 22.5,
    minClearancePosted: 4.6, trafficableWidth: 7.0, ratingStandard: 'AS 5100.7', ratingDate: '2025-01-01'
  }]))
})

describe('assessment-vehicle library seed', () => {
  test('reference vehicles seeded with parseable axle groups', async () => {
    const db = await cds.connect.to('db')
    const vehicles = await db.run(SELECT.from(NS + 'AssessmentVehicles'))
    expect(vehicles.length).toBeGreaterThanOrEqual(5)
    const bdouble = vehicles.find(v => v.code === 'HML-BDOUBLE')
    expect(bdouble).toBeTruthy()
    expect(() => JSON.parse(bdouble.axleGroups)).not.toThrow()
    expect(JSON.parse(bdouble.axleGroups).length).toBeGreaterThan(0)
  })
})

describe('assessHeavyVehicle action', () => {
  test('assesses a seeded vehicle against the bridge and returns a verdict', async () => {
    const res = await onPrio(tx => tx.send('assessHeavyVehicle', { bridgeID: BID, vehicleCode: 'HML-SEMI' }))
    const r = JSON.parse(res.result)
    expect(['pass', 'conditional', 'fail', 'not-assessable']).toContain(r.verdict)
    expect(Array.isArray(r.checks)).toBe(true)
    expect(r.checks.find(c => c.check === 'Gross mass')).toBeTruthy()
  })

  test('an overloaded custom vehicle fails on gross mass', async () => {
    const custom = JSON.stringify([{ type: 'steer', massT: 7 }, { type: 'tandem', massT: 18 }, { type: 'tri', massT: 24 }])
    const res = await onPrio(tx => tx.send('assessHeavyVehicle', { bridgeID: BID, axleGroupsJson: custom }))
    // custom vehicle has no GVM/dimensions, but the over-limit axle groups should fail
    const r = JSON.parse(res.result)
    expect(r.verdict).toBe('fail')
  })

  test('route assessment returns a governing structure', async () => {
    const res = await onPrio(tx => tx.send('assessRoute', { bridgeIds: String(BID), vehicleCode: 'HML-SEMI' }))
    const r = JSON.parse(res.result)
    expect(r.structureCount).toBe(1)
    expect(['pass', 'conditional', 'fail', 'not-assessable']).toContain(r.routeVerdict)
  })
})

describe('forecastCondition action', () => {
  test('returns a declining condition curve + RUL', async () => {
    const res = await onPrio(tx => tx.send('forecastCondition', { bridgeID: BID, years: 5 }))
    const r = JSON.parse(res.result)
    expect(r.curve.length).toBe(6) // year 0..5
    expect(r.currentCondition).toBe(6)
    expect(r.model).toBeTruthy()
  })
})

describe('optimiseCapitalProgram action', () => {
  test('selects within budget over the scored fleet', async () => {
    // ensure there is at least one active scored run for our bridge
    const db = await cds.connect.to('db')
    const now = new Date().toISOString()
    await db.run(INSERT.into(NS + 'PrioritisationAssessment').entries([{
      ID: cds.utils.uuid(), bridge_ID: BID, band: 'P1', priorityScore: 85, active: true,
      runType: 'fleet', createdAt: now, createdBy: 'e2e', modifiedAt: now, modifiedBy: 'e2e'
    }]))
    const res = await onPrio(tx => tx.send('optimiseCapitalProgram', { budgetAud: 200000, strategy: 'greedy-bcr', fundingYear: '2026/27' }))
    const r = JSON.parse(res.result)
    expect(r.spentAud).toBeLessThanOrEqual(200000)
    expect(r.fundingYear).toBe('2026/27')
    expect(r.candidatesConsidered).toBeGreaterThanOrEqual(1)
  })
})

describe('treatment log + new schema fields', () => {
  test('a treatment can be created and soft-deleted (active flag)', async () => {
    const tid = cds.utils.uuid()
    await onAdmin((tx, s) => tx.run(INSERT.into(s.entities.BridgeTreatments).entries({
      ID: tid, bridge_ID: BID, treatmentType: 'Joint replace', status: 'Proposed',
      proposedCostAud: 50000, fundingYear: '2026/27', priorityBand: 'P1'
    })))
    const db = await cds.connect.to('db')
    const t = await db.run(SELECT.one.from(NS + 'BridgeTreatments').where({ ID: tid }))
    expect(t.status).toBe('Proposed')
    expect(Number(t.proposedCostAud)).toBe(50000)
    expect(t.active).toBe(true)
  })

  test('scour/register fields, element CS quantities, and defect extent accept values', async () => {
    const db = await cds.connect.to('db')
    await db.run(`UPDATE ${NS.replace(/\./g, '_')}Bridges SET scourRating='Monitored', waterwayAdequacy='B', skewAngleDeg=15.5, deckType='RC slab' WHERE ID=${BID}`)
    const b = await db.run(SELECT.one.from(NS + 'Bridges').columns('scourRating', 'waterwayAdequacy', 'skewAngleDeg', 'deckType').where({ ID: BID }))
    expect(b.scourRating).toBe('Monitored')
    expect(b.deckType).toBe('RC slab')

    const eid = cds.utils.uuid()
    await db.run(INSERT.into(NS + 'BridgeElements').entries([{
      ID: eid, bridge_ID: BID, elementCode: 'DECK_1', elementType: 'DECK', conditionRating: 6,
      totalQuantity: 100, quantityUnit: 'm2', conditionState1Qty: 60, conditionState2Qty: 30, conditionState3Qty: 8, conditionState4Qty: 2, active: true
    }]))
    const el = await db.run(SELECT.one.from(NS + 'BridgeElements').where({ ID: eid }))
    expect(Number(el.conditionState3Qty)).toBe(8)
    expect(el.quantityUnit).toBe('m2')

    const did = cds.utils.uuid()
    await db.run(INSERT.into(NS + 'BridgeDefects').entries([{
      ID: did, bridge_ID: BID, defectType: 'Cracking', severity: 3, urgency: 2,
      extentValue: 2.5, extentUnit: 'm', conditionState: 3, status: 'Open', active: true
    }]))
    const d = await db.run(SELECT.one.from(NS + 'BridgeDefects').where({ ID: did }))
    expect(Number(d.extentValue)).toBe(2.5)
    expect(d.extentUnit).toBe('m')
    expect(d.conditionState).toBe(3)
  })
})
