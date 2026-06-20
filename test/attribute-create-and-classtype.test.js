const cds = require('@sap/cds')
const { SELECT, INSERT } = cds.ql

// Council ATTR-2 / ATTR-3 — (1) creating an Attribute Definition / Allowed Value used to
// fail because the not-null objectType was never set by the Fiori Elements form; the
// before-CREATE now inherits it from the parent group. (2) AssetClasses carries an
// objectType "class type" so only relevant classes surface per object.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const NS = 'bridge.management.'

// The attribute entities are draft-enabled (AttributeGroups is the draft root), so a
// definition/allowed-value can only be created via the root — either the FE draft cycle
// or a deep insert through AttributeGroups. We use the deep-insert path, which fires the
// child before('CREATE') exactly as draft activation does.
const asAdminTx = (fn) => cds.connect.to('AdminService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'adm', roles: ['view', 'manage', 'admin'] }) }, (tx) => fn(tx, srv)))

describe('ATTR-2: create Attribute Definitions / Allowed Values (via draft root)', () => {
  const gid = cds.utils.uuid(), did = cds.utils.uuid()

  test('a group with a nested definition (NO objectType) + allowed value is created; objectType is inherited', async () => {
    await asAdminTx((tx, srv) => tx.run(INSERT.into(srv.entities.AttributeGroups).entries({
      ID: gid, name: 'Created Group', internalKey: 'created_grp_1', objectType: 'bridge', displayOrder: 910, status: 'Active',
      definitions: [{
        ID: did, name: 'Created Char', internalKey: 'CREATED_CHAR_1', dataType: 'SingleSelect', displayOrder: 10, status: 'Active',
        // NOTE: no objectType on the child — the before-CREATE must inherit it from the group
        allowedValues: [{ ID: cds.utils.uuid(), value: 'Low', label: 'Low', displayOrder: 10, status: 'Active' }]
      }]
    })))
    const db = await cds.connect.to('db')
    const def = await db.run(SELECT.one.from(NS + 'AttributeDefinitions').where({ ID: did }))
    expect(def).toBeTruthy()                          // create no longer fails on the NOT NULL objectType
    expect(def.objectType).toBeTruthy()              // objectType is populated (inherited at FE activation / defaulted)
    expect(def.objectType).toBe('bridge')
    const av = await db.run(SELECT.one.from(NS + 'AttributeAllowedValues').where({ attribute_ID: did, value: 'Low' }))
    expect(av).toBeTruthy()                          // allowed value created too
  })

  test('a new top-level group WITHOUT objectType defaults to bridge', async () => {
    const id = cds.utils.uuid()
    await asAdminTx((tx, srv) => tx.run(INSERT.into(srv.entities.AttributeGroups).entries({
      ID: id, name: 'Ad-hoc group', internalKey: 'adhoc_grp_1', displayOrder: 900   // no objectType
    })))
    const db = await cds.connect.to('db')
    const row = await db.run(SELECT.one.from(NS + 'AttributeGroups').where({ ID: id }))
    expect(row.objectType).toBe('bridge')
  })
})

describe('ATTR-3: AssetClasses class-type (objectType) scoping', () => {
  test('AssetClasses accepts a class-type objectType and it reads back', async () => {
    const db = await cds.connect.to('db')
    await db.run(INSERT.into(NS + 'AssetClasses').entries([
      { code: 'TST_BRIDGE_ONLY', name: 'Test Bridge Class', objectType: 'bridge', isActive: true },
      { code: 'TST_BOTH', name: 'Test Both', objectType: 'bridge,restriction', isActive: true },
      { code: 'TST_ANY', name: 'Test Any', objectType: null, isActive: true }
    ]))
    const rows = await db.run(SELECT.from(NS + 'AssetClasses').where({ code: { like: 'TST_%' } }))
    const relevantForBridge = rows.filter(r => !r.objectType || r.objectType.split(',').map(s => s.trim()).includes('bridge'))
    const relevantForRestriction = rows.filter(r => !r.objectType || r.objectType.split(',').map(s => s.trim()).includes('restriction'))
    expect(relevantForBridge.map(r => r.code).sort()).toEqual(['TST_ANY', 'TST_BOTH', 'TST_BRIDGE_ONLY'])
    expect(relevantForRestriction.map(r => r.code).sort()).toEqual(['TST_ANY', 'TST_BOTH']) // bridge-only excluded
  })
})
