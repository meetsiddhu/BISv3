'use strict'
// Back-compat facade over the reusable `changelog` plugin (srv/lib/plugins/changelog).
// Existing signatures are preserved so the ~19 call sites keep working unchanged; the
// plugin is the single source of truth for audit-trail writing.
const { auditChange, diffRecords, fetchCurrent, valueToString } = require('./lib/plugins/changelog')

// Structured per-field writer (opts already carries { objectType, objectId, objectName,
// source, batchId, changedBy, changes, changeReason }) → the plugin's structured form.
async function writeChangeLogs (db, opts) {
  return auditChange(db, opts)
}

// Kept name for the ~existing call sites.
async function fetchCurrentRecord (db, entity, where) {
  return fetchCurrent(db, entity, where)
}

module.exports = { diffRecords, writeChangeLogs, fetchCurrentRecord, valueToString }
