const cds = require('@sap/cds')
const { INSERT, SELECT } = cds.ql
const LOG = cds.log('bms-audit')

// Fields that carry no business meaning and should not be diff'd
const SKIP_FIELDS = new Set([
  'modifiedAt', 'modifiedBy', 'createdAt', 'createdBy',
  'IsActiveEntity', 'HasActiveEntity', 'HasDraftEntity',
  'DraftAdministrativeData_DraftUUID', 'SiblingEntity',
  '__rowNumber', 'texts'
])

function valueToString(recordValue) {
  if (recordValue === null || recordValue === undefined) return ''
  if (typeof recordValue === 'boolean') return recordValue ? 'true' : 'false'
  if (recordValue instanceof Date) return recordValue.toISOString().slice(0, 10)
  if (typeof recordValue === 'object') return JSON.stringify(recordValue)
  return String(recordValue)
}

function diffRecords(oldRecord, newRecord) {
  const changes = []
  const allFields = new Set([
    ...Object.keys(oldRecord || {}),
    ...Object.keys(newRecord || {})
  ])

  for (const field of allFields) {
    if (SKIP_FIELDS.has(field)) continue
    const oldStr = valueToString((oldRecord || {})[field])
    const newStr = valueToString((newRecord || {})[field])
    if (oldStr !== newStr) {
      changes.push({ fieldName: field, oldValue: oldStr, newValue: newStr })
    }
  }
  return changes
}

async function writeChangeLogs(db, { objectType, objectId, objectName, source, batchId, changedBy, changes, changeReason }) {
  if (!changes || !changes.length) return

  const entries = changes.map(change => ({
    ID: cds.utils.uuid(),
    changedAt: new Date().toISOString(),
    changedBy: changedBy || 'system',
    objectType,
    objectId: String(objectId),
    objectName: objectName || String(objectId),
    fieldName: change.fieldName,
    oldValue: change.oldValue,
    newValue: change.newValue,
    changeSource: source,
    batchId: batchId || null,
    changeReason: changeReason || change.reason || null  // ISO-AUDIT-003: governance narrative
  }))

  try {
    await db.run(INSERT.into('bridge.management.ChangeLog').entries(entries))
  } catch (error) {
    // OPS-4 / rule-3 ("ChangeLog on every CUD"): a silent audit miss is unacceptable
    // for bulk/API paths (a 50k upload could leave no trail), so surface the error and
    // let the caller abort. Single interactive UI edits tolerate + warn so a transient
    // audit hiccup doesn't block an engineer's save.
    const bulkSources = ['MassUpload', 'MassEdit', 'EAMSync', 'API', 'Import', 'Calibration']
    if (bulkSources.includes(source)) {
      LOG.error(`Audit write failed for bulk operation (source=${source}); failing the operation:`, error.message)
      throw error
    }
    LOG.error('Failed to write change log (tolerated for interactive edit):', error.message)
  }
}

async function fetchCurrentRecord(db, entity, where) {
  // OPS-2: a missing record is NOT an error — SELECT.one returns undefined without
  // throwing, so we return that as-is. The catch only fires on a genuine DB failure
  // (bad connection, locked table); surface it (log + rethrow) rather than masking it
  // as "no prior record", which would silently corrupt the audit diff.
  try {
    return await db.run(SELECT.one.from(entity).where(where))
  } catch (error) {
    LOG.error(`fetchCurrentRecord failed for ${entity}:`, error.message)
    throw error
  }
}

module.exports = { diffRecords, writeChangeLogs, fetchCurrentRecord, valueToString }
