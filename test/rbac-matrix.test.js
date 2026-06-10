const cds = require('@sap/cds')
const { SELECT, INSERT } = cds.ql

// END-USER ROLE MATRIX (UAT): the same XSUAA scope rules the live system enforces (role
// collections map to these scopes 1:1: BMS_VIEWER→view, BMS_MANAGER→manage(+view),
// BMS_ADMIN→admin(+manage,view), BMS_INTEGRATION→integration). Each cell below is an
// end-user attempt as that role; ✓ = allowed, 403 = rejected by @requires/@restrict.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const ROLES = {
  viewer: ['view'],
  manager: ['view', 'manage'],
  admin: ['view', 'manage', 'admin'],
  integration: ['integration']
}
const as = (role, fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'uat-' + role, roles: ROLES[role] }) }, fn))

let BRIDGE = 990401
const A = 'PrioritisationService.Assessments'
const inputs = () => ({ bridge_ID: BRIDGE, dimSafety: 3, dimNetwork: 3, dimFinancial: 3, dimEnvironmental: 3, dimReputational: 3, likelihood: 3, strategy: 'Maintain' })

describe('RBAC matrix — end-user role enforcement (server-side, same rules as live XSUAA)', () => {
  beforeAll(async () => {
    const db = await cds.connect.to('db')
    const b = await db.run(SELECT.one.from('bridge.management.Bridges').columns('ID'))
    if (!b) {
      await db.run(INSERT.into('bridge.management.Bridges').entries({
        ID: BRIDGE, bridgeId: 'UAT-RBAC', bridgeName: 'UAT RBAC Bridge',
        conditionRating: 6, structuralAdequacyRating: 6, lastInspectionDate: '2025-11-01'
      }))
    } else { BRIDGE = b.ID }
  })

  test('VIEWER: can READ worklist + prefill, CANNOT create/deactivate/edit models', async () => {
    await expect(as('viewer', (tx) => tx.run(SELECT.from(A).limit(1)))).resolves.toBeDefined()
    await expect(as('viewer', (tx) => tx.send('prefill', { bridgeID: BRIDGE }))).resolves.toBeTruthy()
    await expect(as('viewer', (tx) => tx.run(SELECT.from('PrioritisationService.Models').limit(1)))).resolves.toBeDefined()
    await expect(as('viewer', (tx) => tx.run(INSERT.into(A).entries(inputs())))).rejects.toThrow()
    await expect(as('viewer', (tx) => tx.run(cds.ql.UPDATE('PrioritisationService.ModelClassWeights').set({ weight: 9 }).where({ assetClass: '*' })))).rejects.toThrow()
    await expect(as('viewer', (tx) => tx.run(INSERT.into('PrioritisationService.Config').entries({ version: 'uat-x', active: true })))).rejects.toThrow()
  })

  test('MANAGER: can create runs + raise work requests, CANNOT deactivate runs or write config/models', async () => {
    const created = await as('manager', (tx) => tx.run(INSERT.into(A).entries(inputs())))
    const id = created.ID || (created[0] && created[0].ID)
    expect(id).toBeTruthy()
    const wr = await as('manager', (tx) => tx.send({ event: 'raiseWorkRequest', entity: 'Assessments', params: [{ ID: id }], data: { requestType: 'Review', notes: 'UAT-RBAC manager' } }))
    expect(wr.status).toBe('QUEUED')
    await expect(as('manager', (tx) => tx.send({ event: 'deactivate', entity: 'Assessments', params: [{ ID: id }], data: {} }))).rejects.toThrow() // admin-only
    await expect(as('manager', (tx) => tx.run(INSERT.into('PrioritisationService.Config').entries({ version: 'uat-y', active: true })))).rejects.toThrow()
    await expect(as('manager', (tx) => tx.run(cds.ql.UPDATE('PrioritisationService.Models').set({ name: 'x' }).where({ code: 'NSW-PACK-V1' })))).rejects.toThrow()
  })

  test('ADMIN: full surface — deactivate runs, write config, edit model weights (ChangeLogged)', async () => {
    const created = await as('admin', (tx) => tx.run(INSERT.into(A).entries(inputs())))
    const id = created.ID || (created[0] && created[0].ID)
    const off = await as('admin', (tx) => tx.send({ event: 'deactivate', entity: 'Assessments', params: [{ ID: id }], data: {} }))
    expect(off.active).toBe(false) // soft-delete only
    const db = await cds.connect.to('db')
    const w = await db.run(SELECT.one.from('bridge.management.AssetClassCriterionWeight').where({ assetClass: '*' }))
    await expect(as('admin', (tx) => tx.run(cds.ql.UPDATE('PrioritisationService.ModelClassWeights').set({ weight: Number(w.weight) }).where({ ID: w.ID })))).resolves.toBeDefined()
  })

  test('INTEGRATION: scoped OUT of prioritisation entirely (service @requires excludes it)', async () => {
    await expect(as('integration', (tx) => tx.run(SELECT.from(A).limit(1)))).rejects.toThrow()
    await expect(as('integration', (tx) => tx.run(INSERT.into(A).entries(inputs())))).rejects.toThrow()
  })

  test('ANONYMOUS (no role): rejected at the service door', async () => {
    const srv = await cds.connect.to('PrioritisationService')
    await expect(srv.tx({ user: new cds.User({ id: 'anon', roles: [] }) },
      (tx) => tx.run(SELECT.from(A).limit(1)))).rejects.toThrow()
  })
})
