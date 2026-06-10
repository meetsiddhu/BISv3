const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE } = cds.ql

// Council B8 — service-level coverage for the governed BSI/BHI configuration:
//   • the 'bhiWeights' SystemConfig row is RUNTIME-ENSURED (insert-if-missing, never CSV-seeded)
//     with the documented defaults from srv/lib/bhi.js;
//   • bhiDetail labels every NON-CALIBRATED mode 'road-derived weights (calibrate)' — the
//     calculator's four tabs are NHVR/RMS ROAD methodology, not rail/pedestrian methodology;
//   • an admin edit of the JSON row actually changes the computation (config-driven, rule 4).
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const asViewer = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'vwr', roles: ['view'] }) }, fn))

const B_RAIL = 990601
const B_ROAD = 990602

describe('bhiDetail — governed config + calibration honesty (council B8)', () => {
  beforeAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(INSERT.into('bridge.management.Bridges').entries([
      { ID: B_RAIL, bridgeId: 'BRG-BHI-RAIL', bridgeName: 'BHI Rail Bridge', assetClass: 'Rail Bridge', transportMode: 'Rail', conditionRating: 6, yearBuilt: 1990 },
      { ID: B_ROAD, bridgeId: 'BRG-BHI-ROAD', bridgeName: 'BHI Road Bridge', assetClass: 'Road Bridge', transportMode: 'Road', conditionRating: 6, yearBuilt: 1990 }
    ]))
    await db.run(INSERT.into('bridge.management.BridgeElements').entries([
      { bridge_ID: B_RAIL, elementType: 'Girder', conditionRating: 6 },
      { bridge_ID: B_ROAD, elementType: 'Girder', conditionRating: 6 }
    ]))
  })

  test('the bhiWeights SystemConfig row is runtime-ensured with the documented defaults', async () => {
    const db = await cds.connect.to('db')
    await asViewer((tx) => tx.send('bhiDetail', { bridgeID: B_ROAD })) // touch the service
    const row = await db.run(SELECT.one.from('bridge.management.SystemConfig').where({ configKey: 'bhiWeights' }))
    expect(row).toBeTruthy()
    expect(row.isReadOnly).toBeFalsy() // admin-editable via the config tile
    const dflt = JSON.parse(row.defaultValue)
    expect(dflt.modeWeights.Road.superstructure).toBe(0.3) // the calculator values, documented
    expect(dflt.calibrated).toEqual(['Road', 'RoadOverWater'])
  })

  test("non-road modes are labelled 'road-derived weights (calibrate)' until calibrated", async () => {
    const res = await asViewer((tx) => tx.send('bhiDetail', { bridgeID: B_RAIL }))
    const d = JSON.parse(res.detail)
    expect(d.modeKey).toBe('Rail')
    expect(d.calibrated).toBe(false)
    expect(d.calibration).toBe('road-derived weights (calibrate)') // the bridge's own weight set
    const byModel = Object.fromEntries(d.models.map((m) => [m.model, m]))
    expect(byModel.Road.calibrated).toBe(true)
    expect(byModel.Road.calibration).toBeNull()
    expect(byModel.RoadOverWater.calibrated).toBe(true)
    expect(byModel.Rail.calibration).toBe('road-derived weights (calibrate)')
    expect(byModel.Pedestrian.calibration).toBe('road-derived weights (calibrate)')
    expect(d.weightsSource).toMatch(/bhiWeights/)
  })

  test('a calibrated Road bridge carries NO calibration caveat', async () => {
    const res = await asViewer((tx) => tx.send('bhiDetail', { bridgeID: B_ROAD }))
    const d = JSON.parse(res.detail)
    expect(d.modeKey).toBe('Road')
    expect(d.calibrated).toBe(true)
    expect(d.calibration).toBeNull()
  })

  test('an admin edit of the bhiWeights JSON changes the computation (and the printed formulas)', async () => {
    const db = await cds.connect.to('db')
    const before = JSON.parse((await asViewer((tx) => tx.send('bhiDetail', { bridgeID: B_RAIL }))).detail)
    // age 36 (built 1990): default ageFactor = 1 - (36/120)*0.3 = 0.91; halve the wear knob
    await db.run(UPDATE('bridge.management.SystemConfig')
      .set({ value: JSON.stringify({ env: { ageWearMax: 0.15 } }) }).where({ configKey: 'bhiWeights' }))
    require('../srv/system-config').invalidateCache('bhiWeights')
    const after = JSON.parse((await asViewer((tx) => tx.send('bhiDetail', { bridgeID: B_RAIL }))).detail)
    expect(after.bsi).toBeGreaterThan(before.bsi) // gentler age wear ⇒ higher BSI
    expect(after.formulas.join()).toMatch(/x0\.15/) // the substituted formula shows what RAN
    // restore defaults for any suite that follows
    await db.run(UPDATE('bridge.management.SystemConfig').set({ value: null }).where({ configKey: 'bhiWeights' }))
    require('../srv/system-config').invalidateCache('bhiWeights')
    require('../srv/lib/bhi').configure(null)
  })
})
