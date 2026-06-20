const cds = require('@sap/cds')
const { INSERT, DELETE } = cds.ql

// ISOLATION TEST for the reusable `mapping` plugin — exercises resolve() standalone (only the
// plugin module required). Verifies the seeded EAM domains, reverse lookup, fallback, the
// convenience helpers, and cache invalidation. No sibling plugin loaded.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/../..')

const mapping = require('../../srv/lib/plugins/mapping')

describe('plugin: mapping (isolation)', () => {
  beforeEach(() => mapping.invalidate())

  test('resolves a seeded EAM_CODE mapping (forward)', async () => {
    const db = await cds.connect.to('db')
    expect(await mapping.resolve('EAM_CODE', 'BridgeInspections:inspectionType:Routine', 'TO_TARGET', { db })).toBe('ILART:PM01')
  })

  test('resolves a seeded EAM_FIELD mapping + the eamField helper', async () => {
    const db = await cds.connect.to('db')
    expect(await mapping.resolve('EAM_FIELD', 'Bridges:bridgeName', 'TO_TARGET', { db })).toBe('FunctionalLocation:PLTXT')
    expect(await mapping.eamField('Bridges', 'bridgeName', { db })).toBe('FunctionalLocation:PLTXT')
  })

  test('reverse (FROM_TARGET) lookup works', async () => {
    const db = await cds.connect.to('db')
    expect(await mapping.resolve('EAM_CODE', 'ILART:PM01', 'FROM_TARGET', { db })).toBe('BridgeInspections:inspectionType:Routine')
  })

  test('unknown domain/key returns the fallback', async () => {
    const db = await cds.connect.to('db')
    expect(await mapping.resolve('NOPE', 'x', 'TO_TARGET', { db })).toBeNull()
    expect(await mapping.resolve('EAM_CODE', 'no:such:key', 'TO_TARGET', { db, fallback: '?' })).toBe('?')
  })

  test('works for an arbitrary (non-EAM) domain + invalidate() picks up edits', async () => {
    const db = await cds.connect.to('db')
    const dID = 'd9999999-0000-4000-8000-000000000099'
    await db.run(INSERT.into('plugins.mapping.MappingDomain').entries({ ID: dID, domainCode: 'VENDOR_X', direction: 'TO_TARGET', active: true }))
    await db.run(INSERT.into('plugins.mapping.MappingValue').entries({ ID: 'e9999999-0000-4000-8000-000000000099', domain_ID: dID, sourceKey: 'src1', targetKey: 'tgt1', active: true }))
    mapping.invalidate()
    expect(await mapping.resolve('VENDOR_X', 'src1', 'TO_TARGET', { db })).toBe('tgt1')
    await db.run(DELETE.from('plugins.mapping.MappingValue').where({ ID: 'e9999999-0000-4000-8000-000000000099' }))
    await db.run(DELETE.from('plugins.mapping.MappingDomain').where({ ID: dID }))
  })
})
