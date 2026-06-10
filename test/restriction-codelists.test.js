/**
 * Restriction codelist catalogue — completeness, closure derivation, per-type
 * unit rules, typed-value mapping, insert-if-missing helpers and upload-path
 * code validation (pure functions — no CDS runtime or DB required).
 *
 * Guards the Restrictions-tile fix:
 *  - the full NSW/NHVR type set exists (closures, axle-group, lane, PBS, env)
 *  - postingStatus 'CLOSED' is derivable (the legacy 'CLOSURE' literal never
 *    existed in the seeds, so closure could never fire before this fix)
 *  - the canonical lists are internally consistent (every type's units exist)
 *  - the CSV export carries the new attributes (report inclusion)
 */
'use strict'

const lib = require('../srv/lib/restriction-codelists')
const { RESTRICTION_EXPORT_FIELDS } = require('../srv/lib/csv-export')

describe('restriction type catalogue completeness', () => {
  const codes = lib.RESTRICTION_TYPES.map((t) => t.code)

  test('legacy seeded set is preserved verbatim (rule 1 — additive only)', () => {
    for (const legacy of ['Access Restriction', 'Dimension Limit', 'Mass Limit', 'Speed Restriction']) {
      expect(codes).toContain(legacy)
    }
  })

  test('NSW/NHVR completion set is present', () => {
    for (const required of [
      'Load Limit', 'Gross Combination Mass', 'Axle Group Limit',
      'Height Limit', 'Width Limit', 'Length Limit',
      'Lane Restriction', 'Vehicle Class Restriction', 'One-Way Operation',
      'Temporary Closure', 'Full Closure', 'Environmental Restriction', 'Permit Condition'
    ]) {
      expect(codes).toContain(required)
    }
  })

  test('every type declares at least one unit, and every unit exists in RestrictionUnits', () => {
    const unitCodes = new Set(lib.RESTRICTION_UNITS.map((u) => u.code))
    for (const type of lib.RESTRICTION_TYPES) {
      expect(type.units.length).toBeGreaterThan(0)
      for (const unit of type.units) expect(unitCodes.has(unit)).toBe(true)
    }
  })

  test('units list gained the axle-group / lanes / class / n-a codes', () => {
    const unitCodes = lib.RESTRICTION_UNITS.map((u) => u.code)
    for (const u of ['t/axle', 'lanes', 'class', 'n/a']) expect(unitCodes).toContain(u)
  })

  test('directions include One-way and the codelist default', () => {
    const dirs = lib.RESTRICTION_DIRECTIONS.map((d) => d.code)
    expect(dirs).toContain('One-way')
    expect(dirs).toContain(lib.DEFAULT_DIRECTION)
    expect(lib.DEFAULT_DIRECTION).toBe('Both Directions') // 'Both' was never a code
  })

  test('vehicle classes include Road Train, HML and PBS levels 1-4', () => {
    const vcs = lib.VEHICLE_CLASSES.map((v) => v.code)
    for (const vc of ['Road Train', 'HML Vehicles', 'PBS Level 1', 'PBS Level 2', 'PBS Level 3', 'PBS Level 4']) {
      expect(vcs).toContain(vc)
    }
  })

  test('statuses include Inactive (disableRestriction writes it)', () => {
    expect(lib.RESTRICTION_STATUSES.map((s) => s.code)).toContain('Inactive')
  })

  test('typeUnitMap covers every catalogue type and keeps the legacy rules', () => {
    const map = lib.typeUnitMap()
    expect(Object.keys(map).length).toBe(lib.RESTRICTION_TYPES.length)
    expect(map['Mass Limit']).toEqual(['t'])
    expect(map['Speed Restriction']).toEqual(['km/h'])
    expect(map['Dimension Limit']).toEqual(['m'])
    expect(map['Access Restriction']).toEqual(['approval'])
    expect(map['Axle Group Limit']).toContain('t/axle')
    expect(map['Lane Restriction']).toContain('lanes')
  })
})

describe('closure derivation (postingStatus CLOSED fix)', () => {
  test('isClosureType recognises the seeded closure types + legacy CLOSURE', () => {
    expect(lib.isClosureType('Full Closure')).toBe(true)
    expect(lib.isClosureType('Temporary Closure')).toBe(true)
    expect(lib.isClosureType('CLOSURE')).toBe(true) // legacy code kept working
    expect(lib.isClosureType('Mass Limit')).toBe(false)
    expect(lib.isClosureType(null)).toBe(false)
  })

  test('derivePostingStatus: none → UNRESTRICTED, closure → CLOSED, other → RESTRICTED', () => {
    expect(lib.derivePostingStatus([])).toBe('UNRESTRICTED')
    expect(lib.derivePostingStatus(null)).toBe('UNRESTRICTED')
    expect(lib.derivePostingStatus([{ restrictionType: 'Mass Limit' }])).toBe('RESTRICTED')
    expect(lib.derivePostingStatus([
      { restrictionType: 'Speed Restriction' },
      { restrictionType: 'Full Closure' }
    ])).toBe('CLOSED')
    expect(lib.derivePostingStatus([{ restrictionType: 'CLOSURE' }])).toBe('CLOSED')
  })
})

describe('typed-value mapping (applyTypedValue)', () => {
  test('legacy behaviour preserved: Mass Limit → grossMassLimit, Speed → speedLimit (rounded)', () => {
    expect(lib.applyTypedValue({ restrictionType: 'Mass Limit', restrictionValue: '42.5' }).grossMassLimit).toBe(42.5)
    expect(lib.applyTypedValue({ restrictionType: 'Speed Restriction', restrictionValue: '39.6' }).speedLimit).toBe(40)
  })

  test('new types map to their typed limit columns', () => {
    expect(lib.applyTypedValue({ restrictionType: 'Gross Combination Mass', restrictionValue: '62.5' }).grossCombinationLimit).toBe(62.5)
    expect(lib.applyTypedValue({ restrictionType: 'Axle Group Limit', restrictionValue: '8.5' }).axleMassLimit).toBe(8.5)
    expect(lib.applyTypedValue({ restrictionType: 'Height Limit', restrictionValue: '4.6' }).heightLimit).toBe(4.6)
    expect(lib.applyTypedValue({ restrictionType: 'Load Limit', restrictionValue: '15' }).grossMassLimit).toBe(15)
  })

  test('Lane Restriction maps by unit (lanes → lanesOpen rounded, m → laneWidthLimit)', () => {
    expect(lib.applyTypedValue({ restrictionType: 'Lane Restriction', restrictionValue: '1', restrictionUnit: 'lanes' }).lanesOpen).toBe(1)
    expect(lib.applyTypedValue({ restrictionType: 'Lane Restriction', restrictionValue: '3.2', restrictionUnit: 'm' }).laneWidthLimit).toBe(3.2)
  })

  test('never overrides an explicitly provided limit; ignores non-numeric values', () => {
    expect(lib.applyTypedValue({ restrictionType: 'Mass Limit', restrictionValue: '42.5', grossMassLimit: 40 }).grossMassLimit).toBe(40)
    expect(lib.applyTypedValue({ restrictionType: 'Full Closure', restrictionValue: 'Closed' }).grossMassLimit).toBeUndefined()
  })
})

describe('insert-if-missing seeding helpers (NEVER CSV for populated tables)', () => {
  test('missingCodes returns only the absent canonical rows', () => {
    const existing = ['Mass Limit', 'Speed Restriction']
    const missing = lib.missingCodes('RestrictionTypes', existing)
    const missingCodesList = missing.map((m) => m.code)
    expect(missingCodesList).not.toContain('Mass Limit')
    expect(missingCodesList).toContain('Full Closure')
    expect(missing.every((m) => m.isActive === true)).toBe(true)
  })

  test('missingCodes is idempotent: complete table → nothing to insert', () => {
    const all = lib.RESTRICTION_TYPES.map((t) => t.code)
    expect(lib.missingCodes('RestrictionTypes', all)).toHaveLength(0)
  })

  test('admin-added custom codes are never touched (only canonical gaps are returned)', () => {
    const withCustom = [...lib.RESTRICTION_TYPES.map((t) => t.code), 'Council Custom Type']
    expect(lib.missingCodes('RestrictionTypes', withCustom)).toHaveLength(0)
  })

  test('unknown list name fails loudly', () => {
    expect(() => lib.missingCodes('NopeList', [])).toThrow(/Unknown restriction codelist/)
  })
})

describe('upload-path code validation (validateRestrictionCodes)', () => {
  const lookups = Object.fromEntries(
    Object.entries(lib.CODELIST_ENTITIES).map(([name, def]) => [name, new Set(def.rows.map((r) => r.code))])
  )

  test('a valid new-type entry passes', () => {
    const errors = lib.validateRestrictionCodes({
      restrictionType: 'Full Closure', restrictionCategory: 'Temporary',
      restrictionStatus: 'Active', restrictionUnit: 'n/a',
      direction: 'Both Directions', appliesToVehicleClass: 'All Vehicles'
    }, lookups)
    expect(errors).toHaveLength(0)
  })

  test('unknown type/category/status are BLOCKING; unknown unit/direction/class are soft', () => {
    const errors = lib.validateRestrictionCodes({
      restrictionType: 'Made Up', restrictionCategory: 'Sometimes',
      restrictionStatus: 'Maybe', restrictionUnit: 'furlongs',
      direction: 'Up', appliesToVehicleClass: 'Hovercraft'
    }, lookups)
    expect(errors.filter((e) => e.blocking).map((e) => e.field).sort())
      .toEqual(['restrictionCategory', 'restrictionStatus', 'restrictionType'])
    expect(errors.filter((e) => !e.blocking).map((e) => e.field).sort())
      .toEqual(['appliesToVehicleClass', 'direction', 'restrictionUnit'])
  })

  test('empty / absent coded fields are not errors', () => {
    expect(lib.validateRestrictionCodes({ restrictionType: 'Mass Limit' }, lookups)).toHaveLength(0)
  })
})

describe('report inclusion — CSV export field set', () => {
  test('export carries the previously-missing legal/authority columns', () => {
    for (const f of ['issuingAuthority', 'legalReference', 'approvalReference', 'enforcementAuthority', 'remarks']) {
      expect(RESTRICTION_EXPORT_FIELDS).toContain(f)
    }
  })

  test('export carries the new NSW/NHVR + lane/severity attributes', () => {
    for (const f of [
      'gazetteNumber', 'gazetteExpiryDate', 'reviewDueDate', 'detourRoute', 'restrictionReason',
      'restrictionSeverity', 'laneAvailability', 'lanesOpen', 'laneWidthLimit',
      'grossCombinationLimit', 'tandemAxleLimit', 'triAxleLimit', 'steerAxleLimit',
      'pilotVehicleCount', 'signageRequired', 'pbsClassApplicable'
    ]) {
      expect(RESTRICTION_EXPORT_FIELDS).toContain(f)
    }
  })

  test('legacy export columns are untouched and in their original order (rule 1)', () => {
    expect(RESTRICTION_EXPORT_FIELDS.slice(0, 22)).toEqual([
      'ID', 'restrictionRef', 'bridgeRef', 'bridgeName', 'state', 'restrictionType',
      'restrictionCategory', 'restrictionValue', 'restrictionUnit', 'restrictionStatus',
      'grossMassLimit', 'axleMassLimit', 'heightLimit', 'widthLimit', 'lengthLimit', 'speedLimit',
      'permitRequired', 'escortRequired', 'effectiveFrom', 'effectiveTo', 'approvedBy', 'direction'
    ])
  })
})
