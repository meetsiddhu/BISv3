'use strict'

// ─────────────────────────────────────────────────────────────────────────────
// Template Attribute Catalogue — derives the configurable AttributeDefinitions
// that the prioritisation TEMPLATES bind to, so instantiating any template yields
// a model whose criteria resolve against real, fillable register attributes
// (not all-missing-data). Single source of truth: the attribute set is computed
// from the template library itself — change a template binding and the catalogue
// follows.
//
// Only 'Attribute'/'External' bindings become catalogue attributes (these are
// register facts entered per asset / via mass-upload). 'Manual' bindings are
// per-asset engineering judgement entered on the Assess screen and are NOT
// catalogue attributes. 'BridgeField' bindings already exist on the core entity.
//
// Seeding contract (mirrors model-builder-seed / template-library-seed):
// insert-if-missing keyed on deterministic UUIDs (a pure hash of the key), so
// existing/admin-edited rows are never touched and every insert is ChangeLogged.
// Attributes are registered for objectType 'bridge' (the asset register), grouped
// by sector, and enabled by default.
// ─────────────────────────────────────────────────────────────────────────────

const cds = require('@sap/cds')
const { SELECT, INSERT } = cds.ql
const { writeChangeLogs } = require('../audit-log')
const { TEMPLATES } = require('./template-library-seed')

const NS = 'bridge.management.'
const OBJECT_TYPE = 'bridge'

const TABLES = ['AttributeGroups', 'AttributeDefinitions', 'AttributeAllowedValues', 'AttributeObjectTypeConfig']

// Deterministic 48-bit FNV-1a hash → 12 hex digits (no Date/Math.random — resume-safe).
function hash12 (str) {
  let h = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = (1n << 64n) - 1n
  for (let i = 0; i < str.length; i++) {
    h ^= BigInt(str.charCodeAt(i))
    h = (h * prime) & mask
  }
  return (h & ((1n << 48n) - 1n)).toString(16).padStart(12, '0')
}
// UUID form 8-4-4-4-12 with a kind tag in the 4th group ('7' namespace, distinct
// from model-builder '9' and template-library '8'). 4th group = 7<kind>00 (4 hex).
const uid = (kind, key) => `00000000-0000-4000-7${kind}00-${hash12(kind + ':' + key)}`

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// ── Derive the catalogue from the templates ─────────────────────────────────
function buildCatalogue () {
  const sectors = new Map()   // sector -> { keys: Map<key, def> }
  for (const t of TEMPLATES) {
    if (!sectors.has(t.sector)) sectors.set(t.sector, new Map())
    const keyMap = sectors.get(t.sector)
    for (const c of t.criteria) {
      const b = c.binding
      if (b.sourceType !== 'Attribute' && b.sourceType !== 'External') continue
      if (keyMap.has(b.sourceRef)) continue
      let dataType, allowed = null, minValue = null, maxValue = null
      if (c.levels) {
        dataType = 'Integer'; minValue = 1; maxValue = 5
      } else if (Array.isArray(c.bands) && typeof c.bands[0][0] === 'string') {
        dataType = 'SingleSelect'; allowed = c.bands.map(x => x[0])
      } else {
        dataType = 'Decimal'
      }
      keyMap.set(b.sourceRef, {
        key: b.sourceRef, name: c.name, dataType, unit: b.unit || null,
        helpText: `${c.standardRef} — ${c.name}`.slice(0, 255), allowed, minValue, maxValue
      })
    }
  }
  return sectors
}

function expand () {
  const SEED = { AttributeGroups: [], AttributeDefinitions: [], AttributeAllowedValues: [], AttributeObjectTypeConfig: [] }
  const sectors = buildCatalogue()
  let order = 0
  for (const [sector, keyMap] of sectors) {
    const groupKey = `tpl_${slug(sector)}`
    const groupID = uid('a', groupKey)
    SEED.AttributeGroups.push({
      ID: groupID, objectType: OBJECT_TYPE,
      name: `${sector} prioritisation attributes`, internalKey: groupKey,
      displayOrder: (order += 10), status: 'Active'
    })
    let dOrder = 0
    for (const def of keyMap.values()) {
      const defID = uid('b', def.key)
      SEED.AttributeDefinitions.push({
        ID: defID, group_ID: groupID, objectType: OBJECT_TYPE,
        name: def.name, internalKey: def.key, dataType: def.dataType,
        unit: def.unit, helpText: def.helpText, displayOrder: (dOrder += 10),
        minValue: def.minValue, maxValue: def.maxValue, regexPattern: null, status: 'Active'
      })
      SEED.AttributeObjectTypeConfig.push({
        ID: uid('d', def.key), attribute_ID: defID, objectType: OBJECT_TYPE,
        enabled: true, required: false, displayOrder: dOrder
      })
      if (def.allowed) {
        def.allowed.forEach((v, i) => {
          SEED.AttributeAllowedValues.push({
            ID: uid('c', def.key + '|' + v), attribute_ID: defID,
            value: v, label: v, displayOrder: (i + 1) * 10, status: 'Active'
          })
        })
      }
    }
  }
  return SEED
}

const SEED = expand()

const rowLabel = (row) => row.name || row.value || row.internalKey || String(row.ID)

async function ensureTemplateAttributesSeed (db, { changedBy = 'system' } = {}) {
  const batchId = cds.utils.uuid()
  let inserted = 0
  const perTable = {}
  for (const table of TABLES) {
    const rows = SEED[table] || []
    const existing = await db.run(SELECT.from(NS + table).columns('ID'))
    const have = new Set((existing || []).map((r) => String(r.ID).toLowerCase()))
    const missing = rows.filter((r) => !have.has(String(r.ID).toLowerCase()))
    perTable[table] = missing.length
    if (!missing.length) continue
    await db.run(INSERT.into(NS + table).entries(missing))
    await writeChangeLogs(db, {
      objectType: 'Lookup', objectId: table,
      objectName: `${table} (template-attribute seed)`, source: 'Calibration',
      batchId, changedBy,
      changes: missing.map((row) => ({ fieldName: String(row.ID), oldValue: '', newValue: rowLabel(row) }))
    })
    inserted += missing.length
  }
  return { inserted, perTable }
}

module.exports = { TABLES, SEED, ensureTemplateAttributesSeed }
