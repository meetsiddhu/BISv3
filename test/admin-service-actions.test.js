const cds = require('@sap/cds')
const { SELECT, INSERT, DELETE } = cds.ql

// Service-level coverage for AdminService action handlers in srv/admin-service.js:
//   • the unbound recalcRisk() admin action (fleet risk recompute summary)
//   • the bound Bridges deactivate()/reactivate() soft-delete lifecycle, incl. the
//     ChangeLog rows the locked rule §2.2/§3 require on every status flip.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const admin = new cds.User({ id: 'adm', roles: ['admin', 'manage', 'view'] })
const onAdmin = (fn) => cds.connect.to('AdminService').then((srv) => srv.tx({ user: admin }, (tx) => fn(tx, srv)))

const BID = 990701

describe('AdminService: recalcRisk action', () => {
  test('returns a fleet-wide recompute summary string', async () => {
    const msg = await onAdmin((tx) => tx.send('recalcRisk'))
    expect(typeof msg).toBe('string')
    expect(String(msg)).toMatch(/Recalculated risk .* for \d+ bridges/i)
  })
})

describe('AdminService: Bridges deactivate / reactivate (soft-delete + audit)', () => {
  beforeAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(INSERT.into('bridge.management.Bridges').entries({
      ID: BID, bridgeId: 'BRG-ADM-ACT', bridgeName: 'Admin Action Bridge', state: 'NSW', status: 'Active'
    }))
  })
  afterAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from('bridge.management.Bridges').where({ ID: BID }))
    await db.run(DELETE.from('bridge.management.ChangeLog').where({ objectId: String(BID) }))
  })

  test('deactivate flips status to Inactive and writes a ChangeLog row', async () => {
    const result = await onAdmin((tx) => tx.send({ event: 'deactivate', entity: 'Bridges', params: [{ ID: BID }] }))
    expect(result.status).toBe('Inactive')

    const db = await cds.connect.to('db')
    const log = await db.run(SELECT.from('bridge.management.ChangeLog')
      .where({ objectId: String(BID), fieldName: 'status', newValue: 'Inactive' }))
    expect(log.length).toBeGreaterThan(0)
  })

  test('reactivate flips status back to Active and writes a ChangeLog row', async () => {
    const result = await onAdmin((tx) => tx.send({ event: 'reactivate', entity: 'Bridges', params: [{ ID: BID }] }))
    expect(result.status).toBe('Active')

    const db = await cds.connect.to('db')
    const log = await db.run(SELECT.from('bridge.management.ChangeLog')
      .where({ objectId: String(BID), fieldName: 'status', newValue: 'Active' }))
    expect(log.length).toBeGreaterThan(0)
  })
})
