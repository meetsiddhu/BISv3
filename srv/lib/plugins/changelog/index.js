'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE PLUGIN: changelog
// A self-contained, config-driven audit-trail writer. INDEPENDENT — it imports no
// other plugin. Portable to any CAP app: pass `entity` (the target change-log table)
// + the change details; nothing here is BIS-specific.
//
// Target-entity contract (default 'bridge.management.ChangeLog'): the entity must have
//   ID, changedAt, changedBy, objectType, objectId, objectName, fieldName,
//   oldValue, newValue, changeSource, batchId, changeReason
// (changeReason optional). A reusable CDS aspect for this shape is documented in README.
//
// Unifies the three legacy writers (writeChangeLogs / logAudit / logRestrictionChange)
// behind ONE entry point, `auditChange`, with two equivalent forms:
//   • structured: opts.changes = [{ fieldName, oldValue, newValue, reason? }]  (per-field rows)
//   • action:     opts.action + opts.description                               (single summary row)
// ─────────────────────────────────────────────────────────────────────────────
const cds = require('@sap/cds')
const { INSERT, SELECT } = cds.ql
const LOG = cds.log('plugin-changelog')

const DEFAULT_ENTITY = 'bridge.management.ChangeLog'

// Fields that carry no business meaning and should not be diff'd.
const DEFAULT_SKIP_FIELDS = new Set([
  'modifiedAt', 'modifiedBy', 'createdAt', 'createdBy',
  'IsActiveEntity', 'HasActiveEntity', 'HasDraftEntity',
  'DraftAdministrativeData_DraftUUID', 'SiblingEntity',
  '__rowNumber', 'texts'
])

// Bulk/system sources must fail loud on an audit miss (a 50k import leaving no trail is
// unacceptable, rule-3); interactive UI edits tolerate + warn so a transient hiccup
// doesn't block an engineer's save.
const BULK_SOURCES = new Set(['MassUpload', 'MassEdit', 'EAMSync', 'API', 'Import', 'Calibration'])

function valueToString (recordValue) {
  if (recordValue === null || recordValue === undefined) return ''
  if (typeof recordValue === 'boolean') return recordValue ? 'true' : 'false'
  if (recordValue instanceof Date) return recordValue.toISOString().slice(0, 10)
  if (typeof recordValue === 'object') return JSON.stringify(recordValue)
  return String(recordValue)
}

function diffRecords (oldRecord, newRecord, skipFields = DEFAULT_SKIP_FIELDS) {
  const changes = []
  const allFields = new Set([...Object.keys(oldRecord || {}), ...Object.keys(newRecord || {})])
  for (const field of allFields) {
    if (skipFields.has(field)) continue
    const oldStr = valueToString((oldRecord || {})[field])
    const newStr = valueToString((newRecord || {})[field])
    if (oldStr !== newStr) changes.push({ fieldName: field, oldValue: oldStr, newValue: newStr })
  }
  return changes
}

async function fetchCurrent (db, entity, where) {
  // A missing record is NOT an error (SELECT.one returns undefined). Only a genuine DB
  // failure is surfaced — masking it as "no prior record" would corrupt the audit diff.
  try { return await db.run(SELECT.one.from(entity).where(where)) }
  catch (error) { LOG.error(`fetchCurrent failed for ${entity}:`, error.message); throw error }
}

// Unified writer. Returns silently when there is nothing to record.
async function auditChange (db, opts = {}) {
  const {
    entity = DEFAULT_ENTITY,
    objectType, objectId, objectName,
    source = 'OData', batchId = null, changedBy = 'system', changeReason = null,
    changes, action, description
  } = opts

  const base = (extra) => ({
    ID: cds.utils.uuid(),
    changedAt: new Date().toISOString(),
    changedBy: changedBy || 'system',
    objectType,
    objectId: String(objectId),
    objectName: objectName || String(objectId),
    changeSource: source,
    batchId: batchId || null,
    ...extra
  })

  let entries
  if (Array.isArray(changes)) {
    if (!changes.length) return                       // nothing changed → no row (matches legacy writeChangeLogs)
    entries = changes.map(c => base({
      fieldName: c.fieldName,
      oldValue: c.oldValue,
      newValue: c.newValue,
      changeReason: changeReason || c.reason || null
    }))
  } else if (action !== undefined) {
    entries = [base({ fieldName: action, oldValue: null, newValue: description ?? null, changeReason })]
  } else {
    return                                            // neither form supplied → nothing to log
  }

  try {
    await db.run(INSERT.into(entity).entries(entries))
  } catch (error) {
    if (BULK_SOURCES.has(source)) {
      LOG.error(`Audit write failed for bulk operation (source=${source}); failing the operation:`, error.message)
      throw error
    }
    LOG.error('Failed to write change log (tolerated for interactive edit):', error.message)
  }
}

module.exports = { auditChange, diffRecords, fetchCurrent, valueToString, DEFAULT_SKIP_FIELDS, BULK_SOURCES }
