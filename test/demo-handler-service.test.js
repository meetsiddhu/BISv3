const cds = require('@sap/cds')
const { SELECT } = cds.ql

// Service-level coverage for srv/demo-handler.js — the AdminService loadDemoData /
// clearDemoData actions (admin-gated) and the derived demo-attribute generator.
// NOTE: loadDemoData/clearDemoData DELETE all Bridges by design; this suite runs against
// the isolated in-memory DB cds.test provisions per file, so it never touches a real register.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const { DEMO_BRIDGES } = require('../srv/demo-handler')

const admin = new cds.User({ id: 'adm', roles: ['admin', 'manage', 'view'] })
const viewer = new cds.User({ id: 'vwr', roles: ['view'] })

const onAdmin = (user, fn) => cds.connect.to('AdminService').then((srv) => srv.tx({ user }, (tx) => fn(tx, srv)))

describe('demo-handler: exported demo dataset', () => {
  test('DEMO_BRIDGES is a non-trivial, well-formed fictional register', () => {
    expect(Array.isArray(DEMO_BRIDGES)).toBe(true)
    expect(DEMO_BRIDGES.length).toBeGreaterThan(5)
    for (const b of DEMO_BRIDGES) {
      expect(b.ID).toBeDefined()
      expect(typeof b.bridgeName).toBe('string')
      expect(b.state).toBeTruthy()
    }
    // IDs are unique
    expect(new Set(DEMO_BRIDGES.map((b) => b.ID)).size).toBe(DEMO_BRIDGES.length)
  })
})

describe('demo-handler: action authorisation', () => {
  const is403 = (err) => String(err && (err.code ?? err.statusCode ?? err.status)) === '403' ||
    /403|admin|forbidden|not allowed/i.test(String(err && err.message))

  const expectRejected403 = (promise) => promise.then(
    () => { throw new Error('expected a 403 rejection but the action resolved') },
    (err) => expect(is403(err)).toBe(true)
  )

  test('a non-admin (view-only) user is rejected (403) on loadDemoData', async () => {
    await expectRejected403(onAdmin(viewer, (tx) => tx.send('loadDemoData')))
  })

  test('a non-admin (view-only) user is rejected (403) on clearDemoData', async () => {
    await expectRejected403(onAdmin(viewer, (tx) => tx.send('clearDemoData')))
  })
})

describe('demo-handler: loadDemoData / clearDemoData lifecycle (admin)', () => {
  test('loadDemoData replaces the register with the demo bridges + derived attributes', async () => {
    const msg = await onAdmin(admin, (tx) => tx.send('loadDemoData'))
    expect(String(msg)).toMatch(/Demo data loaded/i)

    const db = await cds.connect.to('db')
    const bridges = await db.run(SELECT.from('bridge.management.Bridges'))
    expect(bridges.length).toBe(DEMO_BRIDGES.length)

    // Derived demo attribute values were written by the demo-loader (5 keys per bridge).
    const attrs = await db.run(SELECT.from('bridge.management.AttributeValues').where({ createdBy: 'demo-loader' }))
    expect(attrs.length).toBe(DEMO_BRIDGES.length * 5)
    const keys = new Set(attrs.map((a) => a.attributeKey))
    expect(keys).toEqual(new Set(['LOAD_RATING_FACTOR', 'DESIGN_LIFE_CONSUMED_PCT', 'DETOUR_LENGTH_KM', 'FATIGUE_CLASS', 'SCOUR_STATUS']))

    // demoModeActive flag flipped on.
    const flag = await db.run(SELECT.one.from('bridge.management.SystemConfig').where({ configKey: 'demoModeActive' }))
    if (flag) expect(String(flag.value)).toBe('true')
  })

  test('clearDemoData empties the register + demo attributes and flips the flag off', async () => {
    await onAdmin(admin, (tx) => tx.send('loadDemoData')) // ensure something to clear
    const msg = await onAdmin(admin, (tx) => tx.send('clearDemoData'))
    expect(String(msg)).toMatch(/cleared/i)

    const db = await cds.connect.to('db')
    const bridges = await db.run(SELECT.from('bridge.management.Bridges'))
    expect(bridges.length).toBe(0)
    const attrs = await db.run(SELECT.from('bridge.management.AttributeValues').where({ createdBy: 'demo-loader' }))
    expect(attrs.length).toBe(0)

    const flag = await db.run(SELECT.one.from('bridge.management.SystemConfig').where({ configKey: 'demoModeActive' }))
    if (flag) expect(String(flag.value)).toBe('false')
  })
})
