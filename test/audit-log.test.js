const { diffRecords, writeChangeLogs } = require('../srv/audit-log')

describe('audit log', () => {
  test('diffRecords captures only business changes', () => {
    const changes = diffRecords(
      { bridgeName: 'Old', state: 'NSW', modifiedAt: '2024-01-01' },
      { bridgeName: 'New', state: 'NSW', modifiedAt: '2024-02-02' }
    )
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ fieldName: 'bridgeName', oldValue: 'Old', newValue: 'New' })
  })

  const okDb = { run: async () => ({}) }
  const failDb = { run: async () => { throw new Error('ChangeLog locked') } }
  const change = { objectType: 'Bridge', objectId: '1', objectName: 'X', batchId: 'b1', changedBy: 'u', changes: [{ fieldName: 'state', oldValue: 'A', newValue: 'B' }] }

  test('OPS-R3: audit failure on a BULK source FAILS the operation (throws)', async () => {
    await expect(writeChangeLogs(failDb, { ...change, source: 'MassUpload' })).rejects.toThrow()
    await expect(writeChangeLogs(failDb, { ...change, source: 'MassEdit' })).rejects.toThrow()
    await expect(writeChangeLogs(failDb, { ...change, source: 'EAMSync' })).rejects.toThrow()
  })

  test('OPS-R3: audit failure on an interactive UI source is tolerated (no throw)', async () => {
    await expect(writeChangeLogs(failDb, { ...change, source: 'OData' })).resolves.toBeUndefined()
  })

  test('happy path writes without throwing', async () => {
    await expect(writeChangeLogs(okDb, { ...change, source: 'MassUpload' })).resolves.toBeUndefined()
  })
})
