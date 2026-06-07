const { normalizeMassEditValue } = require('../srv/lib/mass-edit')

const TYPES = { name: 'string', age: 'integer', mass: 'decimal', active: 'boolean', due: 'date' }
const REQUIRED = new Set(['name'])

describe('mass-edit normalizeMassEditValue (extracted from server.js, P1-001/P2-001)', () => {
  test('unknown field throws', () => {
    expect(() => normalizeMassEditValue('nope', 'x', TYPES, REQUIRED)).toThrow(/Unsupported/)
  })

  test('undefined passes through (no change); empty string becomes null', () => {
    expect(normalizeMassEditValue('mass', undefined, TYPES, REQUIRED)).toBeUndefined()
    expect(normalizeMassEditValue('mass', '', TYPES, REQUIRED)).toBeNull()
  })

  test('required field cannot be blanked', () => {
    expect(() => normalizeMassEditValue('name', '', TYPES, REQUIRED)).toThrow(/cannot be empty/)
  })

  test('string trims; integer/decimal coerce + validate', () => {
    expect(normalizeMassEditValue('name', '  Anzac ', TYPES, REQUIRED)).toBe('Anzac')
    expect(normalizeMassEditValue('age', '42', TYPES, REQUIRED)).toBe(42)
    expect(() => normalizeMassEditValue('age', '4.5', TYPES, REQUIRED)).toThrow(/whole number/)
    expect(normalizeMassEditValue('mass', '4.5', TYPES, REQUIRED)).toBe(4.5)
    expect(() => normalizeMassEditValue('mass', 'abc', TYPES, REQUIRED)).toThrow(/must be a number/)
  })

  test('boolean accepts X/true/1, rejects junk; date enforces ISO', () => {
    expect(normalizeMassEditValue('active', 'X', TYPES, REQUIRED)).toBe(true)
    expect(normalizeMassEditValue('active', '0', TYPES, REQUIRED)).toBe(false)
    expect(() => normalizeMassEditValue('active', 'maybe', TYPES, REQUIRED)).toThrow(/true or false/)
    expect(normalizeMassEditValue('due', '2026-06-07', TYPES, REQUIRED)).toBe('2026-06-07')
    expect(() => normalizeMassEditValue('due', '07/06/2026', TYPES, REQUIRED)).toThrow(/YYYY-MM-DD/)
  })
})
