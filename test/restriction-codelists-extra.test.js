// Additional pure-function coverage for srv/lib/restriction-codelists.js — targets the
// exported helpers NOT exercised by test/restriction-codelists.test.js:
//   numericTypes(), numericUnits(), codelistRows(), and the pure validateRestrictionCodes()
//   (which takes pre-loaded lookup Sets, so it runs with no DB).
const lib = require('../srv/lib/restriction-codelists')

describe('restriction-codelists: numericTypes / numericUnits', () => {
  test('numericTypes returns the codes of catalogue types flagged numeric', () => {
    const codes = lib.numericTypes()
    expect(Array.isArray(codes)).toBe(true)
    expect(codes.length).toBeGreaterThan(0)
    // Every returned code must correspond to a numeric catalogue type.
    const byCode = Object.fromEntries(lib.RESTRICTION_TYPES.map((t) => [t.code, t]))
    for (const c of codes) expect(byCode[c].numeric).toBe(true)
    // A non-numeric type (a closure) must NOT appear.
    const aClosure = lib.RESTRICTION_TYPES.find((t) => t.isClosure)
    if (aClosure) expect(codes).not.toContain(aClosure.code)
  })

  test('numericUnits enumerates the units that imply a numeric value', () => {
    const units = lib.numericUnits()
    expect(units).toEqual(expect.arrayContaining(['km/h', 'm', 't', 't/axle', 'lanes']))
  })
})

describe('restriction-codelists: codelistRows', () => {
  test('returns plain { code, name, descr } rows for a known list', () => {
    const rows = lib.codelistRows('RestrictionTypes')
    expect(rows.length).toBe(lib.RESTRICTION_TYPES.length)
    for (const r of rows) {
      expect(r).toHaveProperty('code')
      expect(r).toHaveProperty('name')
      expect(r).toHaveProperty('descr') // always present (defaults to '')
    }
  })

  test('every CODELIST_ENTITIES key resolves to rows', () => {
    for (const listName of Object.keys(lib.CODELIST_ENTITIES)) {
      const rows = lib.codelistRows(listName)
      expect(Array.isArray(rows)).toBe(true)
      expect(rows.length).toBeGreaterThan(0)
    }
  })

  test('throws on an unknown codelist name', () => {
    expect(() => lib.codelistRows('NopeList')).toThrow(/Unknown restriction codelist/i)
  })
})

describe('restriction-codelists: validateRestrictionCodes (pure)', () => {
  // Build lookups directly from the canonical catalogues (mirrors loadRestrictionLookups
  // without a DB), so this stays a pure unit test.
  const lookups = {
    RestrictionTypes: new Set(lib.RESTRICTION_TYPES.map((t) => t.code)),
    RestrictionCategories: new Set(lib.RESTRICTION_CATEGORIES.map((t) => t.code)),
    RestrictionStatuses: new Set(lib.RESTRICTION_STATUSES.map((t) => t.code)),
    RestrictionUnits: new Set(lib.RESTRICTION_UNITS.map((t) => t.code)),
    RestrictionDirections: new Set(lib.RESTRICTION_DIRECTIONS.map((t) => t.code)),
    VehicleClasses: new Set(lib.VEHICLE_CLASSES.map((t) => t.code))
  }

  test('a fully valid record yields no errors', () => {
    const type = lib.RESTRICTION_TYPES[0].code
    const errs = lib.validateRestrictionCodes({ restrictionType: type }, lookups)
    expect(errs).toEqual([])
  })

  test('null / empty coded fields are skipped (not flagged)', () => {
    expect(lib.validateRestrictionCodes({ restrictionType: null, restrictionUnit: '' }, lookups)).toEqual([])
  })

  test('an unknown blocking code is reported as blocking', () => {
    const errs = lib.validateRestrictionCodes({ restrictionType: 'NOPE' }, lookups)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toMatchObject({ field: 'restrictionType', blocking: true })
    expect(errs[0].message).toMatch(/not a known RestrictionTypes code/)
  })

  test('an unknown soft code (unit) is reported as non-blocking', () => {
    const errs = lib.validateRestrictionCodes({ restrictionUnit: 'furlong' }, lookups)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toMatchObject({ field: 'restrictionUnit', blocking: false })
  })

  test('multiple bad coded fields accumulate', () => {
    const errs = lib.validateRestrictionCodes(
      { restrictionType: 'NOPE', restrictionCategory: 'BAD', direction: 'sideways' },
      lookups
    )
    expect(errs.map((e) => e.field).sort()).toEqual(['direction', 'restrictionCategory', 'restrictionType'])
  })
})
