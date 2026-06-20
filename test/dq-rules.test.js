/**
 * Unit tests for Data Quality rule evaluation logic
 * Tests: required_field, non_zero, not_older_than_days,
 *        condition_requires_restriction, freight_requires_nhvr,
 *        completeness scoring (static + dynamic)
 *
 * Run: npm test
 */
'use strict'

// ─── Inline the pure functions from server.js so they can be unit tested ─────
// (These are extracted as pure functions here; the server wires them at startup)

function execRule(rule, bridge, ctx) {
  const { ruleType, field, _cfg } = rule
  switch (ruleType) {
    case 'required_field': {
      const v = bridge[field]
      return v == null || (typeof v === 'string' && v.trim() === '')
    }
    case 'non_zero': {
      const v = Number(bridge[field])
      return bridge[field] == null || !Number.isFinite(v) || v === 0
    }
    case 'not_older_than_days': {
      if (!bridge[field]) return false
      const ms = ((_cfg && _cfg.days) || 730) * 24 * 60 * 60 * 1000
      return Date.now() - new Date(bridge[field]).getTime() > ms
    }
    case 'condition_requires_restriction': {
      const conditions = (_cfg && _cfg.conditions) || ['Poor', 'Critical']
      if (!conditions.includes(bridge.condition)) return false
      return !ctx.activeRestrictionBridgeIds.has(bridge.ID)
    }
    case 'freight_requires_nhvr': {
      return !!(bridge.freightRoute && !bridge.nhvrAssessed)
    }
    default:
      return false
  }
}

const QUALITY_COMPLETENESS_FIELDS_DEFAULT = [
  'bridgeName', 'bridgeId', 'state', 'region', 'assetOwner',
  'latitude', 'longitude', 'structureType', 'condition',
  'conditionRating', 'postingStatus', 'lastInspectionDate', 'geoJson'
]

function getCompletenessFields(rules) {
  const fromRules = rules
    .filter(r => r.ruleType === 'required_field' && r.field)
    .map(r => r.field)
  return fromRules.length > 0 ? fromRules : QUALITY_COMPLETENESS_FIELDS_DEFAULT
}

function calcCompletenessScore(bridge, completenessFields) {
  const fields = completenessFields || QUALITY_COMPLETENESS_FIELDS_DEFAULT
  const populated = fields.filter(f => {
    const v = bridge[f]
    if (v == null) return false
    if (typeof v === 'string' && v.trim() === '') return false
    if (f === 'latitude' || f === 'longitude') return Number(v) !== 0 && Number.isFinite(Number(v))
    return true
  })
  return fields.length > 0 ? Math.round((populated.length / fields.length) * 100) : 100
}

// ─── required_field ───────────────────────────────────────────────────────────

describe('execRule — required_field', () => {
  const rule = { ruleType: 'required_field', field: 'bridgeName', _cfg: {} }
  const ctx = { activeRestrictionBridgeIds: new Set() }

  test('fires when field is null', () => {
    expect(execRule(rule, { bridgeName: null }, ctx)).toBe(true)
  })

  test('fires when field is empty string', () => {
    expect(execRule(rule, { bridgeName: '  ' }, ctx)).toBe(true)
  })

  test('does not fire when field has a value', () => {
    expect(execRule(rule, { bridgeName: 'Sydney Bridge' }, ctx)).toBe(false)
  })
})

// ─── non_zero ─────────────────────────────────────────────────────────────────

describe('execRule — non_zero', () => {
  const rule = { ruleType: 'non_zero', field: 'conditionRating', _cfg: {} }
  const ctx = { activeRestrictionBridgeIds: new Set() }

  test('fires when field is 0', () => {
    expect(execRule(rule, { conditionRating: 0 }, ctx)).toBe(true)
  })

  test('fires when field is null', () => {
    expect(execRule(rule, { conditionRating: null }, ctx)).toBe(true)
  })

  test('does not fire when field is a positive number', () => {
    expect(execRule(rule, { conditionRating: 3 }, ctx)).toBe(false)
  })
})

// ─── not_older_than_days ─────────────────────────────────────────────────────

describe('execRule — not_older_than_days', () => {
  const ctx = { activeRestrictionBridgeIds: new Set() }

  test('fires when date is older than configured days', () => {
    const rule = { ruleType: 'not_older_than_days', field: 'lastInspectionDate', _cfg: { days: 730 } }
    const oldDate = new Date(Date.now() - 800 * 24 * 60 * 60 * 1000).toISOString()
    expect(execRule(rule, { lastInspectionDate: oldDate }, ctx)).toBe(true)
  })

  test('does not fire when date is within the window', () => {
    const rule = { ruleType: 'not_older_than_days', field: 'lastInspectionDate', _cfg: { days: 730 } }
    const recentDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
    expect(execRule(rule, { lastInspectionDate: recentDate }, ctx)).toBe(false)
  })

  test('does not fire when field is null (required_field handles that)', () => {
    const rule = { ruleType: 'not_older_than_days', field: 'lastInspectionDate', _cfg: { days: 730 } }
    expect(execRule(rule, { lastInspectionDate: null }, ctx)).toBe(false)
  })
})

// ─── condition_requires_restriction ──────────────────────────────────────────

describe('execRule — condition_requires_restriction', () => {
  test('fires for Poor bridge with no active restriction', () => {
    const rule = { ruleType: 'condition_requires_restriction', field: null, _cfg: { conditions: ['Poor', 'Critical'] } }
    const ctx = { activeRestrictionBridgeIds: new Set() }
    expect(execRule(rule, { ID: 'bridge-1', condition: 'Poor' }, ctx)).toBe(true)
  })

  test('does not fire for Poor bridge that has an active restriction', () => {
    const rule = { ruleType: 'condition_requires_restriction', field: null, _cfg: { conditions: ['Poor', 'Critical'] } }
    const ctx = { activeRestrictionBridgeIds: new Set(['bridge-1']) }
    expect(execRule(rule, { ID: 'bridge-1', condition: 'Poor' }, ctx)).toBe(false)
  })

  test('does not fire for Good bridge', () => {
    const rule = { ruleType: 'condition_requires_restriction', field: null, _cfg: { conditions: ['Poor', 'Critical'] } }
    const ctx = { activeRestrictionBridgeIds: new Set() }
    expect(execRule(rule, { ID: 'bridge-1', condition: 'Good' }, ctx)).toBe(false)
  })
})

// ─── freight_requires_nhvr ────────────────────────────────────────────────────

describe('execRule — freight_requires_nhvr', () => {
  const rule = { ruleType: 'freight_requires_nhvr', field: null, _cfg: {} }
  const ctx = { activeRestrictionBridgeIds: new Set() }

  test('fires when freight route but not NHVR assessed', () => {
    expect(execRule(rule, { freightRoute: true, nhvrAssessed: false }, ctx)).toBe(true)
  })

  test('does not fire when NHVR assessed', () => {
    expect(execRule(rule, { freightRoute: true, nhvrAssessed: true }, ctx)).toBe(false)
  })

  test('does not fire when not a freight route', () => {
    expect(execRule(rule, { freightRoute: false, nhvrAssessed: false }, ctx)).toBe(false)
  })
})

// ─── Completeness scoring ─────────────────────────────────────────────────────

describe('calcCompletenessScore', () => {
  test('100% when all 13 default fields are populated', () => {
    const bridge = {
      bridgeName: 'Test', bridgeId: 'B-001', state: 'NSW', region: 'Metro',
      assetOwner: 'State Roads Authority', latitude: -33.8, longitude: 151.2,
      structureType: 'Concrete', condition: 'Good', conditionRating: 4,
      postingStatus: 'Open', lastInspectionDate: '2024-01-01', geoJson: '{}'
    }
    expect(calcCompletenessScore(bridge)).toBe(100)
  })

  test('0% when all fields are null', () => {
    expect(calcCompletenessScore({})).toBe(0)
  })

  test('latitude/longitude of 0 counts as missing', () => {
    const bridge = {
      bridgeName: 'Test', bridgeId: 'B-001', state: 'NSW', region: 'Metro',
      assetOwner: 'State Roads Authority', latitude: 0, longitude: 0,
      structureType: 'Concrete', condition: 'Good', conditionRating: 4,
      postingStatus: 'Open', lastInspectionDate: '2024-01-01', geoJson: '{}'
    }
    // 11 of 13 fields populated (lat/lon = 0 counts as missing)
    expect(calcCompletenessScore(bridge)).toBe(Math.round(11 / 13 * 100))
  })
})

// ─── Dynamic completeness fields ─────────────────────────────────────────────

describe('getCompletenessFields', () => {
  test('falls back to 13 defaults when no required_field rules', () => {
    const rules = [
      { ruleType: 'non_zero', field: 'conditionRating', _cfg: {} },
      { ruleType: 'freight_requires_nhvr', field: null, _cfg: {} }
    ]
    const fields = getCompletenessFields(rules)
    expect(fields).toEqual(QUALITY_COMPLETENESS_FIELDS_DEFAULT)
  })

  test('uses rule fields when required_field rules exist', () => {
    const rules = [
      { ruleType: 'required_field', field: 'bridgeName', _cfg: {} },
      { ruleType: 'required_field', field: 'state', _cfg: {} },
      { ruleType: 'non_zero', field: 'conditionRating', _cfg: {} }
    ]
    const fields = getCompletenessFields(rules)
    expect(fields).toEqual(['bridgeName', 'state'])
  })

  test('dynamic fields are used by calcCompletenessScore', () => {
    const rules = [
      { ruleType: 'required_field', field: 'bridgeName', _cfg: {} },
      { ruleType: 'required_field', field: 'state', _cfg: {} }
    ]
    const fields = getCompletenessFields(rules)
    // Bridge with only bridgeName populated → 50%
    expect(calcCompletenessScore({ bridgeName: 'X' }, fields)).toBe(50)
    // Bridge with both populated → 100%
    expect(calcCompletenessScore({ bridgeName: 'X', state: 'NSW' }, fields)).toBe(100)
  })
})
