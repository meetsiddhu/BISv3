const cds = require('@sap/cds')
const { INSERT, DELETE, SELECT } = cds.ql

// ISOLATION TEST for the reusable `classification` plugin — standalone (only this plugin required).
// Exercises class/characteristic resolution (with per-objectType scoping), typed value coercion,
// and the value write+history round-trip against a self-created class on a test object type.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/../..')

const classification = require('../../srv/lib/plugins/classification')

const OT = 'uatobj'
const GID = '11111111-1111-4111-8111-111111111111'
const DID = '22222222-2222-4222-8222-222222222222'

describe('plugin: classification (isolation)', () => {
  beforeAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(INSERT.into('bridge.management.AttributeGroups').entries({ ID: GID, objectType: OT, name: 'UAT Class', internalKey: 'uatclass', status: 'Active', displayOrder: 1 }))
    await db.run(INSERT.into('bridge.management.AttributeDefinitions').entries({ ID: DID, group_ID: GID, objectType: OT, name: 'UAT Char', internalKey: 'uatchar', dataType: 'Integer', status: 'Active', displayOrder: 1 }))
    await db.run(INSERT.into('bridge.management.AttributeObjectTypeConfig').entries({ ID: cds.utils.uuid(), attribute_ID: DID, objectType: OT, enabled: true, required: true }))
  })
  afterAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from('bridge.management.AttributeValues').where({ objectType: OT }))
    await db.run(DELETE.from('bridge.management.AttributeValueHistory').where({ objectType: OT }))
    await db.run(DELETE.from('bridge.management.AttributeObjectTypeConfig').where({ objectType: OT }))
    await db.run(DELETE.from('bridge.management.AttributeDefinitions').where({ objectType: OT }))
    await db.run(DELETE.from('bridge.management.AttributeGroups').where({ objectType: OT }))
  })

  test('typing helpers coerce by data type', () => {
    expect(classification.coerceValue('Integer', '42')).toBe(42)
    expect(classification.coerceValue('Boolean', 'X')).toBe(true)
    expect(classification.typedValueColumn('Decimal')).toBe('valueDecimal')
    expect(() => classification.coerceValue('Integer', 'abc')).toThrow()
  })

  test('resolve() returns enabled characteristics for the object type, marked required', async () => {
    const db = await cds.connect.to('db')
    const groups = await classification.resolve(db, { objectType: OT })
    expect(groups.length).toBe(1)
    expect(groups[0].internalKey).toBe('uatclass')
    const char = groups[0].attributes.find((a) => a.internalKey === 'uatchar')
    expect(char).toBeTruthy()
    expect(char.required).toBe(true)
  })

  test('writeValues() upserts a typed value + loadValues() reads it back', async () => {
    const db = await cds.connect.to('db')
    await classification.writeValues(db, {
      objectType: OT, objectId: 'OBJ1', changedBy: 'tester', changeSource: 'UAT',
      updates: [{ attributeKey: 'uatchar', dataType: 'Integer', coercedValue: 42 }]
    })
    const vals = await classification.loadValues(db, { objectType: OT, objectId: 'OBJ1' })
    expect(vals.length).toBe(1)
    expect(vals[0].valueInteger).toBe(42)
    // history row written
    const hist = await db.run(SELECT.from('bridge.management.AttributeValueHistory').where({ objectType: OT, objectId: 'OBJ1' }))
    expect(hist.length).toBeGreaterThanOrEqual(1)
  })
})
