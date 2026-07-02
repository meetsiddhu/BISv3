'use strict'

// ─────────────────────────────────────────────────────────────────────────────
// Canonical NSW / NHVR restriction code lists + per-type rules.
//
// SINGLE SOURCE OF TRUTH (working agreement: one source of truth) consumed by:
//   • srv/admin-service.js          — per-type unit validation + typed-value mapping
//   • srv/handlers/common.js        — bridge posting-status derivation (CLOSED fix)
//   • srv/handlers/upload.js        — massUploadRestrictions codelist validation
//   • srv/mass-upload.js            — xlsx importer validation + FALLBACK_LOOKUP_DATA
//   • srv/server.js                 — runtime insert-if-missing seeding on 'served'
//   • scripts/generate-mass-upload-workbook.js — workbook lookup sheets
//
// Locked rules honoured:
//   1. Additive-only — the four legacy codes (Access Restriction, Dimension Limit,
//      Mass Limit, Speed Restriction) are kept verbatim; new codes only extend.
//   4. Zero hardcoding — these are CONFIG ROWS seeded insert-if-missing into the
//      codelist tables; the admin tile can extend/retire them. Validation reads the
//      TABLES first and only falls back to this catalogue when a table is empty.
//   NEVER seed these via db/data CSVs: the codelist tables are already populated in
//   deployed systems and hdbtabledata TRUNCATES on deploy. Runtime insert-if-missing
//   (seedRestrictionCodelists) is the only safe path.
// ─────────────────────────────────────────────────────────────────────────────

// Per-type catalogue. `units` = allowed restrictionUnit codes; `numeric` = the
// restrictionValue must parse as a number; `valueField` / `valueFieldByUnit` = the
// typed limit column auto-filled from a numeric restrictionValue; `isClosure` feeds
// the bridge postingStatus = CLOSED derivation.
// applicableModes/category/defaultUnit (RESTR-TAX) make the catalog mode-aware + grouped — used
// by the UI value-help, the route-feed, and seeded into the RestrictionTypes lookup columns.
const RESTRICTION_TYPES = [
  // ── legacy seeded set (unchanged codes — rule 1) ──
  { code: 'Access Restriction', name: 'Access Restriction', descr: 'Restriction based on route or vehicle access conditions.', units: ['approval'], numeric: false, applicableModes: 'Road', category: 'Access', defaultUnit: 'approval' },
  { code: 'Dimension Limit', name: 'Dimension Limit', descr: 'Restriction based on height, width, or length.', units: ['m'], numeric: true, applicableModes: 'Road', category: 'Dimension', defaultUnit: 'm' },
  { code: 'Mass Limit', name: 'Mass Limit', descr: 'Restriction based on gross or axle mass.', units: ['t'], numeric: true, valueField: 'grossMassLimit', applicableModes: 'Road', category: 'Mass', defaultUnit: 't' },
  { code: 'Speed Restriction', name: 'Speed Restriction', descr: 'Restriction based on permitted speed.', units: ['km/h'], numeric: true, valueField: 'speedLimit', integer: true, applicableModes: 'Road', category: 'Operational', defaultUnit: 'km/h' },
  // ── NSW / NHVR completion set (additive) ──
  { code: 'Load Limit', name: 'Load Limit', descr: 'Sign-posted load limit (NSW posted-load order) — distinct from a generic mass limit.', units: ['t'], numeric: true, valueField: 'grossMassLimit', applicableModes: 'Road', category: 'Mass', defaultUnit: 't' },
  { code: 'Gross Combination Mass', name: 'Gross Combination Mass', descr: 'Gross combination mass (GCM) limit for multi-unit combinations.', units: ['t'], numeric: true, valueField: 'grossCombinationLimit', applicableModes: 'Road', category: 'Mass', defaultUnit: 't' },
  { code: 'Axle Group Limit', name: 'Axle Group Limit', descr: 'Single / tandem / tri-axle group mass limit.', units: ['t', 't/axle'], numeric: true, valueField: 'axleMassLimit', applicableModes: 'Road', category: 'Mass', defaultUnit: 't' },
  // UAT P3-001 (2026-06-22): a demo restriction carried restrictionType 'Axle Mass Limit',
  // which was absent from the catalog (value-help integrity gap). Added as a proper NHVR
  // single-axle mass code (additive; seeded insert-if-missing) rather than mutating the data.
  { code: 'Axle Mass Limit', name: 'Axle Mass Limit', descr: 'Maximum mass permitted on a single axle.', units: ['t'], numeric: true, valueField: 'axleMassLimit', applicableModes: 'Road', category: 'Mass', defaultUnit: 't' },
  { code: 'Height Limit', name: 'Height Limit', descr: 'Vertical clearance limit.', units: ['m'], numeric: true, valueField: 'heightLimit', applicableModes: 'Road,Rail', category: 'Dimension', defaultUnit: 'm' },
  { code: 'Width Limit', name: 'Width Limit', descr: 'Vehicle width limit.', units: ['m'], numeric: true, valueField: 'widthLimit', applicableModes: 'Road', category: 'Dimension', defaultUnit: 'm' },
  { code: 'Length Limit', name: 'Length Limit', descr: 'Vehicle or combination length limit.', units: ['m'], numeric: true, valueField: 'lengthLimit', applicableModes: 'Road', category: 'Dimension', defaultUnit: 'm' },
  { code: 'Lane Restriction', name: 'Lane Restriction', descr: 'Lane closure, lane width limit or single-lane operation.', units: ['lanes', 'm'], numeric: true, valueFieldByUnit: { lanes: 'lanesOpen', m: 'laneWidthLimit' }, applicableModes: 'Road', category: 'Operational', defaultUnit: 'lanes' },
  { code: 'Vehicle Class Restriction', name: 'Vehicle Class Restriction', descr: 'Network access restriction for a vehicle class or PBS level (B-double, road train, HML, PBS L1–L4).', units: ['class', 'approval'], numeric: false, applicableModes: 'Road', category: 'Access', defaultUnit: 'class' },
  { code: 'One-Way Operation', name: 'One-Way Operation', descr: 'Directional / one-way traffic restriction.', units: ['n/a'], numeric: false, applicableModes: 'Road', category: 'Operational', defaultUnit: 'n/a' },
  { code: 'Temporary Closure', name: 'Temporary Closure', descr: 'Temporary or event-based full closure of the structure.', units: ['n/a'], numeric: false, isClosure: true, applicableModes: 'All', category: 'Closure', defaultUnit: 'n/a' },
  { code: 'Full Closure', name: 'Full Closure', descr: 'Bridge fully closed to traffic.', units: ['n/a'], numeric: false, isClosure: true, applicableModes: 'All', category: 'Closure', defaultUnit: 'n/a' },
  { code: 'Environmental Restriction', name: 'Environmental Restriction', descr: 'Conditional restriction with an environmental trigger (flood level, fire, wind, seasonal).', units: ['n/a', 'm'], numeric: false, applicableModes: 'All', category: 'Environmental', defaultUnit: 'n/a' },
  { code: 'Permit Condition', name: 'Permit Condition', descr: 'Permit-required travel condition (escort, pilot vehicles, notice period).', units: ['approval'], numeric: false, applicableModes: 'Road', category: 'Permit', defaultUnit: 'approval' },
  // ── Multi-modal extension (RESTR-TAX): rail / marine / pedestrian / dangerous goods + finer axle ──
  { code: 'Single Axle Limit', name: 'Single Axle Limit', descr: 'Single (steer) axle mass limit.', units: ['t'], numeric: true, valueField: 'steerAxleLimit', applicableModes: 'Road', category: 'Mass', defaultUnit: 't' },
  { code: 'Tandem Axle Limit', name: 'Tandem Axle Limit', descr: 'Tandem axle group mass limit.', units: ['t'], numeric: true, valueField: 'tandemAxleLimit', applicableModes: 'Road', category: 'Mass', defaultUnit: 't' },
  { code: 'Tri-Axle Limit', name: 'Tri-Axle Limit', descr: 'Tri-axle group mass limit.', units: ['t'], numeric: true, valueField: 'triAxleLimit', applicableModes: 'Road', category: 'Mass', defaultUnit: 't' },
  { code: 'Dangerous Goods Prohibition', name: 'Dangerous Goods Prohibition', descr: 'Hazardous-goods / dangerous-goods vehicles prohibited or restricted over the structure.', units: ['class'], numeric: false, applicableModes: 'Road,Rail,Marine', category: 'Access', defaultUnit: 'class' },
  { code: 'Rail Route Availability', name: 'Rail Route Availability (RA)', descr: 'Permitted rail Route Availability (RA) class for the structure.', units: ['RA'], numeric: false, valueField: 'railRouteAvailability', applicableModes: 'Rail', category: 'Access', defaultUnit: 'RA' },
  { code: 'Rail Tonnage Limit', name: 'Rail Tonnage Limit', descr: 'Gross rail tonnage limit over the structure.', units: ['t'], numeric: true, valueField: 'railTonnageLimit', applicableModes: 'Rail', category: 'Mass', defaultUnit: 't' },
  { code: 'Rail Axle Load Limit', name: 'Rail Axle Load Limit', descr: 'Rail axle load limit (t/axle).', units: ['t'], numeric: true, applicableModes: 'Rail', category: 'Mass', defaultUnit: 't' },
  { code: 'Temporary Speed Restriction', name: 'Temporary Speed Restriction (Rail)', descr: 'Rail temporary speed restriction (TSR) — speed limit with a cause + period.', units: ['km/h'], numeric: true, valueField: 'speedLimit', integer: true, applicableModes: 'Rail', category: 'Operational', defaultUnit: 'km/h' },
  { code: 'Structure Gauge Limit', name: 'Structure Gauge Limit', descr: 'Rail structure-gauge / clearance envelope limit.', units: ['m'], numeric: true, applicableModes: 'Rail', category: 'Dimension', defaultUnit: 'm' },
  { code: 'Air Draft', name: 'Air Draft (Navigation Clearance)', descr: 'MARINE: vertical navigation clearance above water for vessels passing under the bridge.', units: ['m'], numeric: true, valueField: 'airDraftLimit', applicableModes: 'Marine', category: 'Dimension', defaultUnit: 'm' },
  { code: 'Navigation Channel Width', name: 'Navigation Channel Width', descr: 'MARINE: navigable channel width through/under the structure.', units: ['m'], numeric: true, valueField: 'navigationClearanceLimit', applicableModes: 'Marine', category: 'Dimension', defaultUnit: 'm' },
  { code: 'Bridge Opening Schedule', name: 'Bridge Opening Schedule', descr: 'MARINE: movable-span (lift / swing / bascule) opening schedule.', units: ['n/a'], numeric: false, valueField: 'openingSchedule', applicableModes: 'Marine', category: 'Operational', defaultUnit: 'n/a' },
  { code: 'Pedestrian Load Limit', name: 'Pedestrian Load Limit', descr: 'Pedestrian / crowd load limit on a footbridge or shared path.', units: ['kPa', 'persons'], numeric: true, applicableModes: 'Pedestrian,Active', category: 'Mass', defaultUnit: 'kPa' },
  { code: 'Path Width Limit', name: 'Path Width Limit', descr: 'Usable path / deck width limit on a pedestrian or active-transport bridge.', units: ['m'], numeric: true, valueField: 'widthLimit', applicableModes: 'Pedestrian,Active', category: 'Dimension', defaultUnit: 'm' }
]

// Legacy closure code recognised for backwards compatibility — historic rows /
// integrations may carry the bare 'CLOSURE' code (it is NOT seeded).
const LEGACY_CLOSURE_CODES = ['CLOSURE']

const RESTRICTION_UNITS = [
  // legacy
  { code: 'approval', name: 'approval', descr: 'Restriction value is approval based.' },
  { code: 'km/h', name: 'km/h', descr: 'Speed limit in kilometres per hour.' },
  { code: 'm', name: 'metres (m)', descr: 'Dimensional limit in metres.' },
  { code: 't', name: 'tonnes (t)', descr: 'Mass limit in tonnes.' },
  // additive
  { code: 't/axle', name: 'tonnes per axle group (t/axle)', descr: 'Axle-group mass limit in tonnes per axle group.' },
  { code: 'lanes', name: 'lanes', descr: 'Number of trafficable lanes.' },
  { code: 'class', name: 'vehicle class', descr: 'Vehicle class or PBS network level.' },
  { code: 'n/a', name: 'not applicable', descr: 'No unit applies (closures, directional and conditional restrictions).' },
  // RESTR-TAX (multi-modal additive): rail + pedestrian units.
  { code: 'RA', name: 'Route Availability (RA)', descr: 'Rail Route Availability class.' },
  { code: 'kPa', name: 'kilopascals (kPa)', descr: 'Pedestrian / crowd load intensity.' },
  { code: 'persons', name: 'persons', descr: 'Permitted number of persons (crowd load).' }
]

const RESTRICTION_DIRECTIONS = [
  // legacy
  { code: 'Both Directions', name: 'Both Directions', descr: 'Restriction applies in both directions.' },
  { code: 'Eastbound', name: 'Eastbound', descr: 'Restriction applies eastbound only.' },
  { code: 'Northbound', name: 'Northbound', descr: 'Restriction applies northbound only.' },
  { code: 'Southbound', name: 'Southbound', descr: 'Restriction applies southbound only.' },
  { code: 'Westbound', name: 'Westbound', descr: 'Restriction applies westbound only.' },
  // additive
  { code: 'One-way', name: 'One-way', descr: 'Single direction of travel only (see One-Way Operation restriction).' }
]

const VEHICLE_CLASSES = [
  // legacy
  { code: 'All Vehicles', name: 'All Vehicles', descr: 'Applies to all vehicles.' },
  { code: 'B-Double', name: 'B-Double', descr: 'Applies to B-Double vehicles.' },
  { code: 'Heavy Vehicles', name: 'Heavy Vehicles', descr: 'Applies to heavy vehicles.' },
  { code: 'Oversize Overmass', name: 'Oversize Overmass', descr: 'Applies to oversize or overmass vehicles.' },
  { code: 'PBS Vehicles', name: 'PBS Vehicles', descr: 'Applies to PBS-approved vehicles.' },
  // additive
  { code: 'Road Train', name: 'Road Train', descr: 'Applies to road train combinations.' },
  { code: 'HML Vehicles', name: 'HML Vehicles', descr: 'Applies to Higher Mass Limit accredited vehicles.' },
  { code: 'PBS Level 1', name: 'PBS Level 1', descr: 'Applies to PBS Level 1 network vehicles.' },
  { code: 'PBS Level 2', name: 'PBS Level 2', descr: 'Applies to PBS Level 2 network vehicles.' },
  { code: 'PBS Level 3', name: 'PBS Level 3', descr: 'Applies to PBS Level 3 network vehicles.' },
  { code: 'PBS Level 4', name: 'PBS Level 4', descr: 'Applies to PBS Level 4 network vehicles.' }
]

const RESTRICTION_CATEGORIES = [
  // legacy
  { code: 'Permanent', name: 'Permanent', descr: 'Restriction is ongoing until changed or retired.' },
  { code: 'Temporary', name: 'Temporary', descr: 'Restriction applies for a temporary period only.' },
  // additive
  { code: 'Conditional', name: 'Conditional', descr: 'Restriction applies only when a trigger condition is met (e.g. flood level).' },
  { code: 'Seasonal', name: 'Seasonal', descr: 'Restriction applies during a recurring seasonal window.' }
]

const RESTRICTION_STATUSES = [
  // legacy
  { code: 'Active', name: 'Active', descr: 'Restriction is currently active.' },
  { code: 'Draft', name: 'Draft', descr: 'Restriction is being prepared.' },
  { code: 'Retired', name: 'Retired', descr: 'Restriction is no longer in force.' },
  { code: 'Suspended', name: 'Suspended', descr: 'Restriction is temporarily suspended.' },
  // additive — disableRestriction sets 'Inactive'; the codelist must contain it
  { code: 'Inactive', name: 'Inactive', descr: 'Restriction has been disabled.' }
]

// The default direction (must be a code in RESTRICTION_DIRECTIONS — fixes the
// historic 'Both' default that fell outside the codelist).
const DEFAULT_DIRECTION = 'Both Directions'

// Codelist table per list — used by the seeder and by lookup loading.
const CODELIST_ENTITIES = {
  RestrictionTypes: { entity: 'bridge.management.RestrictionTypes', rows: RESTRICTION_TYPES },
  RestrictionUnits: { entity: 'bridge.management.RestrictionUnits', rows: RESTRICTION_UNITS },
  RestrictionDirections: { entity: 'bridge.management.RestrictionDirections', rows: RESTRICTION_DIRECTIONS },
  VehicleClasses: { entity: 'bridge.management.VehicleClasses', rows: VEHICLE_CLASSES },
  RestrictionCategories: { entity: 'bridge.management.RestrictionCategories', rows: RESTRICTION_CATEGORIES },
  RestrictionStatuses: { entity: 'bridge.management.RestrictionStatuses', rows: RESTRICTION_STATUSES }
}

const TYPE_BY_CODE = new Map(RESTRICTION_TYPES.map((t) => [t.code, t]))

// ── Derivations ──────────────────────────────────────────────────────────────

/** Allowed-units map per restriction type: { 'Mass Limit': ['t'], ... } */
function typeUnitMap () {
  return Object.fromEntries(RESTRICTION_TYPES.map((t) => [t.code, [...t.units]]))
}

/** Types whose restrictionValue must be numeric. */
function numericTypes () {
  return RESTRICTION_TYPES.filter((t) => t.numeric).map((t) => t.code)
}

/** Units that imply a numeric restrictionValue. */
function numericUnits () {
  return ['km/h', 'm', 't', 't/axle', 'lanes']
}

/** True when the restriction type code represents a closure (drives postingStatus CLOSED). */
function isClosureType (code) {
  if (!code) return false
  const entry = TYPE_BY_CODE.get(code)
  if (entry && entry.isClosure) return true
  return LEGACY_CLOSURE_CODES.includes(code)
}

/**
 * Derive the bridge postingStatus from its set of ACTIVE restrictions.
 * UNRESTRICTED (none) | CLOSED (any closure-type) | RESTRICTED (anything else).
 */
function derivePostingStatus (activeRestrictions) {
  const rows = activeRestrictions || []
  if (rows.length === 0) return 'UNRESTRICTED'
  if (rows.some((r) => isClosureType(r && r.restrictionType))) return 'CLOSED'
  return 'RESTRICTED'
}

/**
 * Auto-fill the typed limit column from a numeric restrictionValue (only when the
 * target column is not already set). Preserves the legacy behaviour for
 * Mass Limit → grossMassLimit and Speed Restriction → speedLimit, and extends it
 * to the new typed limits. Mutates and returns `data`.
 */
function applyTypedValue (data) {
  if (!data) return data
  const entry = TYPE_BY_CODE.get(data.restrictionType)
  if (!entry) return data
  const raw = data.restrictionValue
  if (raw === null || raw === undefined || String(raw).trim() === '') return data
  const num = parseFloat(raw)
  if (!Number.isFinite(num)) return data
  let field = entry.valueField
  if (!field && entry.valueFieldByUnit) field = entry.valueFieldByUnit[data.restrictionUnit]
  if (!field) return data
  if (data[field] === null || data[field] === undefined) {
    data[field] = entry.integer || field === 'lanesOpen' ? Math.round(num) : num
  }
  return data
}

// ── Insert-if-missing seeding (rule: NEVER CSV-seed already-populated tables) ─

/** Pure helper: which canonical rows are absent from `existingCodes`? */
function missingCodes (listName, existingCodes) {
  const def = CODELIST_ENTITIES[listName]
  if (!def) throw new Error(`Unknown restriction codelist: ${listName}`)
  const have = new Set(existingCodes || [])
  return def.rows
    .filter((row) => !have.has(row.code))
    // Council fix #5p2: the canonical merge now HONOURS the row's own isActive (default true)
    // rather than force-activating — so a canonical list can seed a code as retired, and the
    // resolver stays consistent with the value-help (which filters isActive). Deactivated rows
    // already in the DB are never resurrected (they are present, so excluded by `have`).
    .map((row) => {
      const base = { code: row.code, name: row.name, descr: row.descr || '', isActive: row.isActive !== false }
      // RESTR-TAX: carry the mode-aware taxonomy columns when the row defines them (RestrictionTypes
      // only — other codelists' rows omit these, so their inserts stay {code,name,descr,isActive}).
      if (row.applicableModes !== undefined) base.applicableModes = row.applicableModes
      if (row.category !== undefined) base.category = row.category
      if (row.defaultUnit !== undefined) base.defaultUnit = row.defaultUnit
      return base
    })
}

/**
 * Runtime insert-if-missing seeding of the six restriction codelists. Idempotent:
 * existing rows (including admin-customised ones) are never touched; only canonical
 * codes that are absent get inserted. Every insert is captured in ChangeLog (rule 3).
 * Returns { inserted, perList } counts.
 */
async function seedRestrictionCodelists (db, { changedBy = 'system' } = {}) {
  const cds = require('@sap/cds')
  const { SELECT, INSERT } = cds.ql
  const { writeChangeLogs } = require('../audit-log')
  const batchId = cds.utils.uuid()
  let inserted = 0
  const perList = {}

  for (const [listName, def] of Object.entries(CODELIST_ENTITIES)) {
    const existing = await db.run(SELECT.from(def.entity).columns('code'))
    const toInsert = missingCodes(listName, (existing || []).map((r) => r.code))
    if (!toInsert.length) { perList[listName] = 0; continue }
    await db.run(INSERT.into(def.entity).entries(toInsert))
    // Rule 3: ChangeLog on every CUD — one row per seeded code.
    await writeChangeLogs(db, {
      objectType: 'Lookup',
      objectId: listName,
      objectName: `${listName} (codelist seed)`,
      source: 'Calibration',
      batchId,
      changedBy,
      changes: toInsert.map((row) => ({ fieldName: row.code, oldValue: '', newValue: row.name }))
    })
    perList[listName] = toInsert.length
    inserted += toInsert.length
  }

  // RESTR-TAX backfill: existing RestrictionTypes rows that predate the mode-aware columns get
  // applicableModes/category/defaultUnit from the canonical catalog, only where still NULL (so
  // admin edits are preserved). Idempotent — a no-op once every row is tagged.
  try {
    const { UPDATE } = cds.ql
    for (const row of CODELIST_ENTITIES.RestrictionTypes.rows) {
      if (row.applicableModes === undefined) continue
      await db.run(UPDATE('bridge.management.RestrictionTypes')
        .set({ applicableModes: row.applicableModes, category: row.category || null, defaultUnit: row.defaultUnit || null })
        .where({ code: row.code, applicableModes: null }))
    }
  } catch (e) { (require('@sap/cds').log('restriction-codelists')).warn('RestrictionTypes taxonomy backfill skipped: ' + e.message) }

  return { inserted, perList }
}

// ── Upload-path code validation (config-driven: reads the TABLES first) ──────

/**
 * Load the valid code sets for upload validation from the codelist TABLES
 * (admin-extensible — rule 4). When a table is empty (fresh dev DB before the
 * seeder ran), fall back to the canonical catalogue so validation never
 * rejects everything.
 */
async function loadRestrictionLookups (db) {
  const cds = require('@sap/cds')
  const { SELECT } = cds.ql
  const out = {}
  for (const [listName, def] of Object.entries(CODELIST_ENTITIES)) {
    let codes
    try {
      const rows = await db.run(SELECT.from(def.entity).columns('code').where({ isActive: { '!=': false } }))
      codes = (rows || []).map((r) => r.code)
    } catch (_e) { codes = [] }
    if (!codes.length) codes = def.rows.map((r) => r.code)
    out[listName] = new Set(codes)
  }
  // Legacy closure code stays importable for historic data.
  for (const legacy of LEGACY_CLOSURE_CODES) out.RestrictionTypes.add(legacy)
  return out
}

/**
 * Validate the coded fields of one restriction record against the loaded lookups.
 * Returns an array of error strings (empty = valid). `blocking` fields make the
 * row unusable; soft fields are reported so the caller can clear them instead.
 */
function validateRestrictionCodes (entry, lookups) {
  const errors = []
  const check = (field, listName, { blocking } = {}) => {
    const value = entry[field]
    if (value === null || value === undefined || value === '') return
    if (!lookups[listName].has(value)) {
      errors.push({ field, blocking: !!blocking, message: `${field} "${value}" is not a known ${listName} code` })
    }
  }
  check('restrictionType', 'RestrictionTypes', { blocking: true })
  check('restrictionCategory', 'RestrictionCategories', { blocking: true })
  check('restrictionStatus', 'RestrictionStatuses', { blocking: true })
  check('restrictionUnit', 'RestrictionUnits')
  check('direction', 'RestrictionDirections')
  check('appliesToVehicleClass', 'VehicleClasses')
  return errors
}

/**
 * Recompute Bridges.postingStatus for a set of bridges from their currently
 * ACTIVE restrictions (same derivation as the OData path in handlers/common.js).
 * Used by the bulk paths (mass upload / mass edit) AND by the AdminService
 * restriction write paths (Restrictions app, Bridges-register tab).
 * R6 UNIFICATION: reads the UnifiedRestrictions UNION view, so the derivation
 * considers BOTH masters (Restrictions + BridgeRestrictions).
 */
async function refreshBridgePostingStatus (db, bridgeIds) {
  const cds = require('@sap/cds')
  const { SELECT, UPDATE } = cds.ql
  const ids = [...new Set((bridgeIds || []).filter((id) => id !== null && id !== undefined))]
  for (const bridgeId of ids) {
    const active = await db.run(
      SELECT.from('bridge.management.UnifiedRestrictions')
        .columns('restrictionType')
        .where({ bridge_ID: bridgeId, restrictionStatus: 'Active', active: true })
    )
    const postingStatus = derivePostingStatus(active)
    await db.run(UPDATE('bridge.management.Bridges').set({ postingStatus }).where({ ID: bridgeId }))
  }
  return ids.length
}

/** Catalogue rows as plain { code, name, descr } lists (workbook / fallback data). */
function codelistRows (listName) {
  const def = CODELIST_ENTITIES[listName]
  if (!def) throw new Error(`Unknown restriction codelist: ${listName}`)
  return def.rows.map((row) => ({ code: row.code, name: row.name, descr: row.descr || '' }))
}

module.exports = {
  RESTRICTION_TYPES,
  RESTRICTION_UNITS,
  RESTRICTION_DIRECTIONS,
  VEHICLE_CLASSES,
  RESTRICTION_CATEGORIES,
  RESTRICTION_STATUSES,
  CODELIST_ENTITIES,
  DEFAULT_DIRECTION,
  LEGACY_CLOSURE_CODES,
  typeUnitMap,
  numericTypes,
  numericUnits,
  isClosureType,
  derivePostingStatus,
  applyTypedValue,
  missingCodes,
  seedRestrictionCodelists,
  loadRestrictionLookups,
  validateRestrictionCodes,
  refreshBridgePostingStatus,
  codelistRows
}
