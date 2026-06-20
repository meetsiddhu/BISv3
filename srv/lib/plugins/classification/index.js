'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE PLUGIN: classification — generic SAP-style class / characteristic / value
// engine. INDEPENDENT (imports no other plugin). Models classes (groups) → characteristics
// (definitions) → allowed values, with per-(objectType, assetClass) enablement scoping, and
// resolves + reads + writes typed attribute values for ANY object instance. Config-driven:
// every entity name is a parameter (defaults below), so another CAP app reuses it by copying
// this module and supplying its own entity names.
//
//   resolve(db, {objectType, assetClass}, opts?)   → enabled characteristic groups for an object
//   loadValues(db, {objectType, objectId}, opts?)  → current typed values for an object instance
//   writeValues(db, {objectType, objectId, updates[], changedBy, changeSource}, opts?) → upsert + history
//   coerceValue / buildValueEntry / typedValueColumn — typing helpers (data-type aware)
// ─────────────────────────────────────────────────────────────────────────────
const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE } = cds.ql

const DEFAULT_ENTITIES = {
  groups: 'bridge.management.AttributeGroups',
  definitions: 'bridge.management.AttributeDefinitions',
  config: 'bridge.management.AttributeObjectTypeConfig',
  allowedValues: 'bridge.management.AttributeAllowedValues',
  values: 'bridge.management.AttributeValues',
  history: 'bridge.management.AttributeValueHistory'
}
const E = (opts) => Object.assign({}, DEFAULT_ENTITIES, (opts && opts.entities) || {})

function typedValueColumn (dataType) {
  switch (dataType) {
    case 'Integer': return 'valueInteger'
    case 'Decimal': return 'valueDecimal'
    case 'Date': return 'valueDate'
    case 'Boolean': return 'valueBoolean'
    default: return 'valueText' // Text, SingleSelect, MultiSelect
  }
}

function coerceValue (dataType, raw) {
  if (raw === null || raw === undefined || raw === '') return null
  switch (dataType) {
    case 'Integer':
      if (typeof raw === 'number' && Number.isInteger(raw)) return raw
      if (/^-?\d+$/.test(String(raw).trim())) return parseInt(raw, 10)
      throw new Error('Expected a whole number')
    case 'Decimal':
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw
      if (/^-?\d+(\.\d+)?$/.test(String(raw).trim())) return parseFloat(raw)
      throw new Error('Expected a number')
    case 'Date':
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw)
      throw new Error('Expected date in YYYY-MM-DD format')
    case 'Boolean':
      if (typeof raw === 'boolean') return raw
      if (raw === 'true' || raw === 'X' || raw === '1' || raw === 1) return true
      if (raw === 'false' || raw === '0' || raw === 0) return false
      throw new Error('Expected true or false')
    default:
      return String(raw).trim()
  }
}

function buildValueEntry (objectType, objectId, attributeKey, dataType, coerced) {
  return {
    objectType,
    objectId: String(objectId),
    attributeKey,
    valueText: ['Text', 'SingleSelect', 'MultiSelect'].includes(dataType) ? coerced : null,
    valueInteger: dataType === 'Integer' ? coerced : null,
    valueDecimal: dataType === 'Decimal' ? coerced : null,
    valueDate: dataType === 'Date' ? coerced : null,
    valueBoolean: dataType === 'Boolean' ? coerced : null
  }
}

// Resolve the enabled characteristic groups for an (objectType, assetClass). A config row scoped
// to the requested assetClass overrides the all-classes (null) row; with no assetClass only the
// all-classes rows apply (backward compatible). Returns groups with their enabled attributes.
// groupIds (optional): when a non-empty array, restrict the resolved config to ONLY those
// classes (SAP EAM-style explicit classification — the object's assigned classes). When
// omitted/empty, all classes scoped to the objectType apply (the original behaviour).
async function resolve (db, { objectType, assetClass, groupIds } = {}, opts = {}) {
  const ent = E(opts)
  let groups = await db.run(SELECT.from(ent.groups).where({ objectType, status: 'Active' }).orderBy('displayOrder'))
  if (Array.isArray(groupIds) && groupIds.length) {
    const wanted = new Set(groupIds.map(String))
    groups = groups.filter(g => wanted.has(String(g.ID)))
  }
  if (!groups.length) return []

  const allDefs = await db.run(SELECT.from(ent.definitions).where({ objectType, status: 'Active' }).orderBy('displayOrder'))
  const configs = await db.run(SELECT.from(ent.config).where({ objectType }))

  const scope = assetClass || ''
  const configByKey = new Map()
  for (const c of configs) {
    const cClass = c.assetClass || ''
    if (cClass !== '' && cClass !== scope) continue
    const existing = configByKey.get(c.attribute_ID)
    if (!existing || (cClass !== '' && (existing.assetClass || '') === '')) configByKey.set(c.attribute_ID, c)
  }

  const allowed = await db.run(SELECT.from(ent.allowedValues).where({ status: 'Active' }).orderBy('displayOrder'))
  const avByAttr = new Map()
  for (const av of allowed) {
    if (!avByAttr.has(av.attribute_ID)) avByAttr.set(av.attribute_ID, [])
    avByAttr.get(av.attribute_ID).push({ value: av.value, label: av.label || av.value })
  }

  const groupMap = new Map(groups.map(g => [g.ID, { ...g, attributes: [] }]))
  for (const def of allDefs) {
    const cfg = configByKey.get(def.ID)
    if (!cfg || !cfg.enabled) continue
    const group = groupMap.get(def.group_ID)
    if (!group) continue
    group.attributes.push({
      ...def,
      required: cfg.required || false,
      displayOrder: cfg.displayOrder != null ? cfg.displayOrder : def.displayOrder,
      allowedValues: avByAttr.get(def.ID) || []
    })
  }

  return groups
    .map(g => groupMap.get(g.ID))
    .filter(g => g.attributes.length > 0)
    .map(g => ({ ...g, attributes: g.attributes.sort((a, b) => a.displayOrder - b.displayOrder) }))
}

async function loadValues (db, { objectType, objectId } = {}, opts = {}) {
  return db.run(SELECT.from(E(opts).values).where({ objectType, objectId: String(objectId) }))
}

// Upsert typed values for an object + append an AttributeValueHistory row per change.
// updates: [{ attributeKey, dataType, coercedValue }]. Optional hooks.onAudit(db, entry) runs per change.
async function writeValues (db, { objectType, objectId, updates = [], changedBy, changeSource } = {}, opts = {}) {
  const ent = E(opts)
  const hooks = opts.hooks || {}
  const existing = await loadValues(db, { objectType, objectId }, opts)
  const byKey = new Map(existing.map(v => [v.attributeKey, v]))
  const now = () => new Date().toISOString()

  for (const { attributeKey, dataType, coercedValue } of updates) {
    const old = byKey.get(attributeKey)
    const entry = buildValueEntry(objectType, objectId, attributeKey, dataType, coercedValue)
    if (old) {
      await db.run(UPDATE(ent.values).set({
        valueText: entry.valueText, valueInteger: entry.valueInteger, valueDecimal: entry.valueDecimal,
        valueDate: entry.valueDate, valueBoolean: entry.valueBoolean, modifiedBy: changedBy, modifiedAt: now()
      }).where({ ID: old.ID }))
      await db.run(INSERT.into(ent.history).entries({
        historyId: cds.utils.uuid(), objectType, objectId: String(objectId), attributeKey,
        oldValueText: old.valueText, oldValueInteger: old.valueInteger, oldValueDecimal: old.valueDecimal, oldValueDate: old.valueDate, oldValueBoolean: old.valueBoolean,
        newValueText: entry.valueText, newValueInteger: entry.valueInteger, newValueDecimal: entry.valueDecimal, newValueDate: entry.valueDate, newValueBoolean: entry.valueBoolean,
        changedBy, changedAt: now(), changeSource
      }))
    } else {
      await db.run(INSERT.into(ent.values).entries({
        ID: cds.utils.uuid(), objectType, objectId: String(objectId), attributeKey,
        valueText: entry.valueText, valueInteger: entry.valueInteger, valueDecimal: entry.valueDecimal, valueDate: entry.valueDate, valueBoolean: entry.valueBoolean,
        createdBy: changedBy, createdAt: now(), modifiedBy: changedBy, modifiedAt: now()
      }))
      await db.run(INSERT.into(ent.history).entries({
        historyId: cds.utils.uuid(), objectType, objectId: String(objectId), attributeKey,
        newValueText: entry.valueText, newValueInteger: entry.valueInteger, newValueDecimal: entry.valueDecimal, newValueDate: entry.valueDate, newValueBoolean: entry.valueBoolean,
        changedBy, changedAt: now(), changeSource
      }))
    }
    if (typeof hooks.onAudit === 'function') {
      try { await hooks.onAudit(db, { objectType, objectId: String(objectId), attributeKey, dataType, value: coercedValue, changedBy, changeSource }) } catch (_e) { /* non-fatal */ }
    }
  }
}

module.exports = { resolve, loadValues, writeValues, coerceValue, buildValueEntry, typedValueColumn, DEFAULT_ENTITIES }
