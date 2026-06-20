const cds = require('@sap/cds')
const { SELECT, INSERT } = cds.ql

// Council ATTR-1 — attribute configuration is class-aware: AttributeObjectTypeConfig
// carries a nullable assetClass so an admin can configure which characteristics apply
// per asset class. assetClass = null means "all classes" (backward compatible). A
// class-specific row and an all-classes row coexist for the same (attribute, objectType).
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const NS = 'bridge.management.'

describe('Class-aware attribute configuration (ATTR-1)', () => {
  let attrId

  test('an attribute definition exists to scope (seeded by the template catalogue)', async () => {
    const db = await cds.connect.to('db')
    const def = await db.run(SELECT.one.from(NS + 'AttributeDefinitions').where({ internalKey: 'IRI_MKM' }))
    expect(def).toBeTruthy()
    attrId = def.ID
  })

  test('AttributeObjectTypeConfig accepts a nullable assetClass; all-classes and class-specific rows coexist', async () => {
    const db = await cds.connect.to('db')
    const now = new Date().toISOString()
    await db.run(INSERT.into(NS + 'AttributeObjectTypeConfig').entries([
      { ID: cds.utils.uuid(), attribute_ID: attrId, objectType: 'bridge', assetClass: null, enabled: true, required: false, displayOrder: 1, createdAt: now, modifiedAt: now },
      { ID: cds.utils.uuid(), attribute_ID: attrId, objectType: 'bridge', assetClass: 'Sealed Pavement', enabled: true, required: true, displayOrder: 1, createdAt: now, modifiedAt: now }
    ]))
    const rows = await db.run(SELECT.from(NS + 'AttributeObjectTypeConfig').where({ attribute_ID: attrId, objectType: 'bridge' }))
    const allClasses = rows.find(r => !r.assetClass)
    const pavement = rows.find(r => r.assetClass === 'Sealed Pavement')
    expect(allClasses).toBeTruthy()
    expect(pavement).toBeTruthy()
    // class-specific scope can differ from the all-classes default (here: required on pavement only)
    expect(pavement.required).toBe(true)
    expect(allClasses.required).toBe(false)
  })

  test('resolution precedence: a class-specific row overrides the all-classes row for that class', async () => {
    const db = await cds.connect.to('db')
    const rows = await db.run(SELECT.from(NS + 'AttributeObjectTypeConfig').where({ attribute_ID: attrId, objectType: 'bridge' }))
    // emulate the resolver: pick class-specific when present, else fall back to all-classes
    const resolveFor = (assetClass) => {
      const specific = rows.find(r => r.assetClass === assetClass)
      return specific || rows.find(r => !r.assetClass) || null
    }
    expect(resolveFor('Sealed Pavement').required).toBe(true)   // class-specific wins
    expect(resolveFor('Road Bridge').required).toBe(false)      // falls back to all-classes
  })
})

// SAP EAM explicit classification: classification.resolve(...groupIds) restricts the resolved
// config to the object's ASSIGNED classes. Empty/omitted groupIds = all classes (back-compat).
describe('Explicit class assignment filters the resolved config', () => {
  const classification = require('../srv/lib/plugins/classification')
  const gA = cds.utils.uuid(); const gB = cds.utils.uuid()
  const dA = cds.utils.uuid(); const dB = cds.utils.uuid()

  test('seed two classes, each with one enabled characteristic', async () => {
    const db = await cds.connect.to('db')
    const now = new Date().toISOString()
    await db.run(INSERT.into(NS + 'AttributeGroups').entries([
      { ID: gA, objectType: 'bridge', name: 'CLS A', internalKey: 'cls_a_t', displayOrder: 90, status: 'Active', createdAt: now, modifiedAt: now },
      { ID: gB, objectType: 'bridge', name: 'CLS B', internalKey: 'cls_b_t', displayOrder: 91, status: 'Active', createdAt: now, modifiedAt: now }
    ]))
    await db.run(INSERT.into(NS + 'AttributeDefinitions').entries([
      { ID: dA, group_ID: gA, objectType: 'bridge', name: 'CA', internalKey: 'cls_char_a', dataType: 'Text', displayOrder: 1, status: 'Active', createdAt: now, modifiedAt: now },
      { ID: dB, group_ID: gB, objectType: 'bridge', name: 'CB', internalKey: 'cls_char_b', dataType: 'Text', displayOrder: 1, status: 'Active', createdAt: now, modifiedAt: now }
    ]))
    await db.run(INSERT.into(NS + 'AttributeObjectTypeConfig').entries([
      { ID: cds.utils.uuid(), attribute_ID: dA, objectType: 'bridge', enabled: true, required: false, displayOrder: 1, createdAt: now, modifiedAt: now },
      { ID: cds.utils.uuid(), attribute_ID: dB, objectType: 'bridge', enabled: true, required: false, displayOrder: 1, createdAt: now, modifiedAt: now }
    ]))
  })

  test('no groupIds -> both classes resolve (backward compatible)', async () => {
    const db = await cds.connect.to('db')
    const names = (await classification.resolve(db, { objectType: 'bridge' })).map(g => g.name)
    expect(names).toEqual(expect.arrayContaining(['CLS A', 'CLS B']))
  })

  test('groupIds=[A] -> only the assigned Class A resolves', async () => {
    const db = await cds.connect.to('db')
    const names = (await classification.resolve(db, { objectType: 'bridge', groupIds: [gA] })).map(g => g.name)
    expect(names).toContain('CLS A')
    expect(names).not.toContain('CLS B')
  })
})
