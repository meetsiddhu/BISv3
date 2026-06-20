const hv = require('../srv/lib/hv-assessment')

// HV-1 — heavy-vehicle structural assessment against a bridge's stored capacity.
describe('assessVehicle', () => {
  const capacity = {
    ratingFactor: 1.1, grossMassLimit: 68, grossCombined: 68,
    steerAxleLimit: 6.5, tandemGroupLimit: 17, triAxleGroupLimit: 22.5,
    minClearancePosted: 4.6, trafficableWidth: 7.0
  }
  const okVehicle = {
    code: 'HML-BDOUBLE', gvmTonnes: 64, overallHeightM: 4.4, overallWidthM: 2.5,
    axleGroups: [{ type: 'steer', massT: 6.0 }, { type: 'tandem', massT: 16 }, { type: 'tri', massT: 21 }, { type: 'tri', massT: 21 }]
  }

  test('a compliant vehicle passes', () => {
    const r = hv.assessVehicle({ bridge: { bridgeId: 'B1' }, capacity, vehicle: okVehicle })
    expect(r.verdict).toBe('pass')
    expect(r.checks.find(c => c.check === 'Gross mass').verdict).toBe('pass')
  })

  test('exceeding the gross mass limit fails, and gross mass is the governing check', () => {
    const heavy = { ...okVehicle, gvmTonnes: 80 }
    const r = hv.assessVehicle({ bridge: { bridgeId: 'B1' }, capacity, vehicle: heavy })
    expect(r.verdict).toBe('fail')
    expect(r.governingCheck).toBe('Gross mass')
  })

  test('an over-limit axle group fails even if gross mass is fine', () => {
    const v = { ...okVehicle, gvmTonnes: 60, axleGroups: [{ type: 'steer', massT: 6 }, { type: 'tandem', massT: 20 }, { type: 'tri', massT: 18 }] }
    const r = hv.assessVehicle({ bridge: {}, capacity, vehicle: v })
    expect(r.verdict).toBe('fail')
    expect(r.governingCheck).toMatch(/Axle group/)
  })

  test('rating factor below 1.0 (but above refusal) is conditional, not fail', () => {
    const r = hv.assessVehicle({ bridge: {}, capacity: { ...capacity, ratingFactor: 0.9 }, vehicle: okVehicle })
    expect(r.verdict).toBe('conditional')
  })

  test('rating factor below the refusal threshold fails', () => {
    const r = hv.assessVehicle({ bridge: {}, capacity: { ...capacity, ratingFactor: 0.7 }, vehicle: okVehicle })
    expect(r.verdict).toBe('fail')
    expect(r.governingCheck).toBe('Rating factor')
  })

  test('an over-height vehicle fails the clearance check', () => {
    const tall = { ...okVehicle, overallHeightM: 5.0 }
    const r = hv.assessVehicle({ bridge: {}, capacity, vehicle: tall })
    expect(r.verdict).toBe('fail')
    expect(r.checks.find(c => c.check === 'Height clearance').verdict).toBe('fail')
  })

  test('no capacity data on record → not-assessable, never a silent pass', () => {
    const r = hv.assessVehicle({ bridge: {}, capacity: {}, vehicle: okVehicle })
    expect(r.verdict).toBe('not-assessable')
  })

  test('bridge-formula check uses configured base+rate when present', () => {
    const v = { gvmTonnes: 40, axleGroups: [{ type: 'tandem', massT: 17, spacingM: 3 }, { type: 'tri', massT: 23, spacingM: 0 }] }
    const params = { bridgeFormula: { baseT: 15, ratePerM: 2 } } // allowable = 15 + 2*3 = 21 < 40 → fail
    const r = hv.assessVehicle({ bridge: {}, capacity: { grossMassLimit: 100 }, vehicle: v, params })
    expect(r.checks.find(c => c.check === 'Bridge formula (spacing)').verdict).toBe('fail')
  })
})

describe('assessRoute', () => {
  test('route verdict is the worst structure; governing structure is identified', () => {
    const a = [
      { bridgeId: 'B1', verdict: 'pass', minMarginPct: 30 },
      { bridgeId: 'B2', verdict: 'conditional', minMarginPct: -5, governingCheck: 'Rating factor' },
      { bridgeId: 'B3', verdict: 'pass', minMarginPct: 10 }
    ]
    const r = hv.assessRoute(a)
    expect(r.routeVerdict).toBe('conditional')
    expect(r.governingStructure).toBe('B2')
    expect(r.structureCount).toBe(3)
  })

  test('a single failing structure makes the whole route fail', () => {
    const r = hv.assessRoute([{ bridgeId: 'B1', verdict: 'pass' }, { bridgeId: 'B2', verdict: 'fail', minMarginPct: -20 }])
    expect(r.routeVerdict).toBe('fail')
    expect(r.governingStructure).toBe('B2')
  })
})

// RAIL-1 (council fix #3): mode applicability — a road model must never silently "assess" a
// rail structure, and a rail model must never be road-checked.
describe('assessVehicle mode applicability', () => {
  const capacity = { ratingFactor: 1.2, grossMassLimit: 150, grossCombined: 150 }
  const roadVehicle = { code: 'HML-BDOUBLE', applicableModes: 'Road', gvmTonnes: 64,
    axleGroups: [{ type: 'steer', massT: 6 }, { type: 'tandem', massT: 16 }] }
  const railModel = { code: '300LA', applicableModes: 'Rail', gvmTonnes: 122,
    axleGroups: [{ type: 'single', massT: 30.6 }] }

  test('a road model on a RAIL structure is refused (not a misleading pass)', () => {
    const r = hv.assessVehicle({ bridge: { bridgeId: 'R1', transportMode: 'Rail' }, capacity, vehicle: roadVehicle })
    expect(r.verdict).toBe('not-assessable')
    expect(r.governingCheck).toBe('Mode applicability')
    expect(r.checks).toHaveLength(1)
  })

  test('a road model on a ROAD structure assesses normally', () => {
    const r = hv.assessVehicle({ bridge: { bridgeId: 'B1', transportMode: 'Road' }, capacity, vehicle: roadVehicle })
    expect(r.verdict).not.toBe('not-assessable')
    expect(r.governingCheck).not.toBe('Mode applicability')
  })

  test('a rail load model on a RAIL structure is assessed (rating-factor governs)', () => {
    const r = hv.assessVehicle({ bridge: { bridgeId: 'R1', transportMode: 'Rail' }, capacity, vehicle: railModel })
    expect(r.verdict).toBe('pass') // RF 1.2 ≥ 1.0
    expect(r.checks.find(c => c.check === 'Mode applicability')).toBeUndefined()
  })

  test('a Multi (shared road+rail) structure accepts any model', () => {
    const r = hv.assessVehicle({ bridge: { bridgeId: 'M1', transportMode: 'Multi' }, capacity, vehicle: roadVehicle })
    expect(r.verdict).not.toBe('not-assessable')
  })

  test('a vehicle with no declared mode scope is not blocked (legacy/custom)', () => {
    const legacy = { code: 'custom', gvmTonnes: 40 }
    const r = hv.assessVehicle({ bridge: { transportMode: 'Rail' }, capacity, vehicle: legacy })
    expect(r.governingCheck).not.toBe('Mode applicability')
  })
})
