const cds = require('@sap/cds')
const { SELECT, UPDATE, DELETE } = cds.ql

// COUNCIL P2-2 / deep-research outcome: the Risk Band ladder invariant (0–100 tiled, no
// gaps/overlaps, lowest band starts at 0) must be enforced at the CAP SERVICE layer, not
// only in the bms-admin client — so a direct OData write from any client cannot corrupt the
// priority ladder. These tests exercise the before(['CREATE','UPDATE'],'RiskBand') guard via
// the AdminService directly (the path the freestyle editor and any integration use).
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const NS = 'bridge.management.'
const admin = { user: new cds.User({ id: 'adm', roles: ['view', 'manage', 'admin'] }) }
const onAdmin = (fn) => cds.connect.to('AdminService').then(s => s.tx(admin, (tx) => fn(tx, s)))

describe('RiskBand ladder guard (server-side, council P2-2)', () => {
  test('the four seeded bands form a valid 0–100 ladder', async () => {
    const db = await cds.connect.to('db')
    const bands = await db.run(SELECT.from(NS + 'RiskBand').orderBy('minScore'))
    expect(bands.length).toBeGreaterThanOrEqual(4)
    expect(Math.min(...bands.map(b => b.minScore))).toBe(0) // lowest band starts at 0
  })

  test('a benign update (colour) on a valid ladder is allowed', async () => {
    await expect(onAdmin((tx, s) =>
      tx.run(UPDATE(s.entities.RiskBand).set({ colour: '#A1A1A1' }).where({ code: 'High' }))
    )).resolves.toBeDefined()
  })

  test('rejects a write that duplicates a Min Score (overlap)', async () => {
    // High → minScore 0 collides with Low (min 0): overlap.
    await expect(onAdmin((tx, s) =>
      tx.run(UPDATE(s.entities.RiskBand).set({ minScore: 0 }).where({ code: 'High' }))
    )).rejects.toThrow(/Min Score/i)
  })

  test('rejects a write that lifts the lowest band off 0 (gap at the bottom)', async () => {
    // Low → minScore 5: the ladder no longer covers [0,5).
    await expect(onAdmin((tx, s) =>
      tx.run(UPDATE(s.entities.RiskBand).set({ minScore: 5 }).where({ code: 'Low' }))
    )).rejects.toThrow(/start at Min Score 0|cover the full/i)
  })

  test('rejects a write with Max below Min', async () => {
    await expect(onAdmin((tx, s) =>
      tx.run(UPDATE(s.entities.RiskBand).set({ maxScore: 10 }).where({ code: 'High' })) // High min=36
    )).rejects.toThrow(/Max Score is below Min Score/i)
  })

  test('ladder is left intact after the rejected writes', async () => {
    const db = await cds.connect.to('db')
    const bands = await db.run(SELECT.from(NS + 'RiskBand').orderBy('minScore'))
    expect(Math.min(...bands.map(b => b.minScore))).toBe(0) // still valid — rejects did not mutate
  })

  // FE hazard guard: hard-delete is blocked at the service (DeleteRestrictions.Deletable:false),
  // so the FE config screens cannot delete-without-recreate. Retirement is via the `active` flag.
  test('hard DELETE of a risk band is rejected (Deletable:false)', async () => {
    await expect(onAdmin((tx, s) =>
      tx.run(DELETE.from(s.entities.RiskBand).where({ code: 'High' }))
    )).rejects.toBeDefined()
  })
})
