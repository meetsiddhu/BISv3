'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE PLUGIN: mass-upload — generic, per-row CRUD upload engine. INDEPENDENT
// (imports no other plugin; audit is an OPTIONAL injected hook). Parses CSV/Excel, applies
// Create / Update / Delete (soft) per row against a configured entity, returns PER-ROW
// status, exports a results CSV, persists a load-log row + retains the raw source file.
//
// Descriptor (the app's config — nothing BIS-specific lives here):
//   { name, entity, keyFields:[...], columns:[{name,type,required}],
//     operationColumn='_op', objectType?, softDelete?(db,keyWhere,existing),
//     logEntity?, sourceFileEntity='plugins.upload.UploadSourceFile' }
//   row operation values: 'create' | 'update' | 'delete' | 'upsert' (default upsert)
// ─────────────────────────────────────────────────────────────────────────────
const cds = require('@sap/cds')
const { INSERT, UPDATE, SELECT } = cds.ql
const LOG = cds.log('plugin-mass-upload')
let XLSX
try { XLSX = require('xlsx') } catch (_e) { /* parse() unavailable without xlsx; rows[] can be passed directly */ }

const DEFAULT_SOURCE_ENTITY = 'plugins.upload.UploadSourceFile'

function parseFile (fileBuffer) {
  if (!XLSX) throw new Error('xlsx not available — pass rows[] directly')
  const wb = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { defval: null })
}

function coerce (type, v) {
  if (v === null || v === undefined || v === '') return null
  switch (type) {
    case 'integer': { const n = parseInt(v, 10); return Number.isNaN(n) ? null : n }
    case 'decimal': { const n = Number(v); return Number.isNaN(n) ? null : n }
    case 'boolean': return ['true', '1', 'yes', 'y', 'x'].includes(String(v).trim().toLowerCase())
    case 'date': { const d = (v instanceof Date) ? v : new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) }
    default: return String(v)
  }
}

// Process one upload. Returns { summary, rows:[{rowNum,operation,status,message,key}], batchId }.
async function processUpload ({ descriptor, fileBuffer, fileName, mimeType, rows, user, db, hooks = {}, batchId } = {}) {
  if (!descriptor || !descriptor.entity || !Array.isArray(descriptor.keyFields)) {
    throw new Error('processUpload: descriptor with { entity, keyFields[] } is required')
  }
  db = db || await cds.connect.to('db')
  rows = rows || parseFile(fileBuffer)
  batchId = batchId || cds.utils.uuid()
  const opCol = descriptor.operationColumn || '_op'
  const objectType = descriptor.objectType || descriptor.entity
  const results = []
  let created = 0, updated = 0, deleted = 0, failed = 0

  const keyOf = (r) => { const w = {}; for (const k of descriptor.keyFields) w[k] = r[k]; return w }
  const dataOf = (r) => { const d = {}; for (const c of descriptor.columns || []) if (r[c.name] !== undefined) d[c.name] = coerce(c.type, r[c.name]); return d }
  const audit = async (objectId, action, description) => {
    if (typeof hooks.onAudit !== 'function') return
    try { await hooks.onAudit(db, { objectType, objectId, action, description, source: 'MassUpload', batchId, changedBy: user }) }
    catch (e) { LOG.warn('onAudit hook failed:', e.message) }
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 2 // +1 for 0-index, +1 for the header row
    let op = String(r[opCol] || '').trim().toLowerCase() || 'upsert'
    const keyWhere = keyOf(r)
    const keyStr = JSON.stringify(keyWhere)
    try {
      const missing = (descriptor.columns || []).filter(c => c.required && (r[c.name] == null || r[c.name] === '')).map(c => c.name)
      if (op !== 'delete' && missing.length) {
        failed++; results.push({ rowNum, operation: op, status: 'Error', message: `Missing required: ${missing.join(', ')}`, key: keyStr }); continue
      }
      const existing = await db.run(SELECT.one.from(descriptor.entity).where(keyWhere))

      if (op === 'delete') {
        if (!existing) { failed++; results.push({ rowNum, operation: 'delete', status: 'Error', message: 'Not found', key: keyStr }); continue }
        if (typeof descriptor.softDelete === 'function') await descriptor.softDelete(db, keyWhere, existing)
        else await db.run(UPDATE(descriptor.entity).set({ active: false }).where(keyWhere)) // generic soft-delete default
        deleted++; results.push({ rowNum, operation: 'delete', status: 'Success', message: 'Soft-deleted', key: keyStr })
        await audit(keyStr, 'DELETE', 'Mass-upload soft-delete')
      } else if (op === 'create' && existing) {
        failed++; results.push({ rowNum, operation: 'create', status: 'Error', message: 'Already exists', key: keyStr })
      } else if (existing && op !== 'create') {
        await db.run(UPDATE(descriptor.entity).set(dataOf(r)).where(keyWhere))
        updated++; results.push({ rowNum, operation: 'update', status: 'Success', message: 'Updated', key: keyStr })
        await audit(keyStr, 'UPDATE', 'Mass-upload update')
      } else {
        await db.run(INSERT.into(descriptor.entity).entries({ ...dataOf(r), ...keyWhere }))
        created++; results.push({ rowNum, operation: 'create', status: 'Success', message: 'Created', key: keyStr })
        await audit(keyStr, 'CREATE', 'Mass-upload create')
      }
    } catch (e) {
      failed++; results.push({ rowNum, operation: op, status: 'Error', message: e.message, key: keyStr })
    }
  }

  const summary = { dataset: descriptor.name || descriptor.entity, processed: rows.length, created, updated, deleted, failed }

  // Retain the raw source file (additive entity) — survives redeploy, downloadable later.
  const sourceFileId = await retainSourceFile({
    db, fileBuffer, fileName, mimeType, rowCount: rows.length,
    dataset: summary.dataset, batchId, user, sourceFileEntity: descriptor.sourceFileEntity
  })

  // Optional load-log row (config-driven target).
  if (descriptor.logEntity) {
    try {
      await db.run(INSERT.into(descriptor.logEntity).entries({
        ID: cds.utils.uuid(), uploadedAt: new Date().toISOString(), uploadedBy: user || 'system',
        fileName: fileName || null, dataset: summary.dataset, datasetLabel: descriptor.label || summary.dataset,
        processed: summary.processed, inserted: created, updated, deleted, failed,
        sourceFileId, status: failed ? 'CompletedWithErrors' : 'Completed'
      }))
    } catch (e) { LOG.warn('load-log write failed:', e.message) }
  }

  return { summary, rows: results, batchId, sourceFileId }
}

// Retain a raw uploaded file into the source-file entity (additive, downloadable later).
// Exported standalone so an app that drives its OWN row CRUD (not processUpload) still gets
// retention from the same code path. Returns the new source-file ID, or null on failure.
async function retainSourceFile ({ db, fileBuffer, fileName, mimeType, rowCount, dataset, batchId, user, sourceFileEntity } = {}) {
  if (!fileBuffer) return null
  db = db || await cds.connect.to('db')
  try {
    const id = cds.utils.uuid()
    await db.run(INSERT.into(sourceFileEntity || DEFAULT_SOURCE_ENTITY).entries({
      ID: id, batchId: batchId || null, dataset: dataset || null, fileName: fileName || null,
      mimeType: mimeType || null, byteSize: fileBuffer.length || null, rowCount: rowCount == null ? null : rowCount,
      content: fileBuffer, uploadedBy: user || 'system', uploadedAt: new Date().toISOString()
    }))
    return id
  } catch (e) { LOG.warn('source-file retention failed:', e.message); return null }
}

// Injection-safe CSV writer for the per-row results (portable; no external dep).
function csvCell (v) {
  if (v == null) return ''
  let s = String(v)
  if (/^[=+\-@]/.test(s)) s = "'" + s
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
  return s
}
// `cols` is overridable so a host app can add columns (e.g. a `dataset` column) while reusing
// the same injection-safe writer. Default keeps the generic shape (back-compat).
function resultsToCsv (rows, cols = ['rowNum', 'operation', 'status', 'message', 'key']) {
  const lines = (rows || []).map(r => cols.map(c => csvCell(r[c])).join(','))
  return [cols.join(','), ...lines].join('\n')
}

module.exports = { processUpload, parseFile, resultsToCsv, retainSourceFile, coerce, csvCell, DEFAULT_SOURCE_ENTITY }
