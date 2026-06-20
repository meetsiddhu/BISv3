'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE PLUGIN: change-documents — merges a change-log table (+ optional typed
// attribute-history table) into a unified, filtered, sorted change-document list, plus
// CSV export. INDEPENDENT — imports no other plugin. It shares the change-log TABLE with
// the `changelog` plugin but has no code dependency on it. Config-driven for portability:
// pass the entity names + an objectType map; nothing BIS-specific is hardcoded.
// ─────────────────────────────────────────────────────────────────────────────
const cds = require('@sap/cds')
const { SELECT } = cds.ql

const DEFAULTS = {
  changeLogEntity: 'bridge.management.ChangeLog',
  attrHistEntity:  null,   // optional typed history, e.g. 'bridge.management.AttributeValueHistory'
  attrDefEntity:   null,   // optional label source, e.g. 'bridge.management.AttributeDefinitions'
  objectTypeMap:   {},     // e.g. { Bridge:'bridge', Restriction:'restriction' }
  maxRows:         5000
}

async function buildChangeDocuments (db, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts }
  const f = cfg.filters || {}
  const maxRows = cfg.maxRows

  // 1) standard change-log rows
  let query = SELECT.from(cfg.changeLogEntity)
    .columns('ID', 'changedAt', 'changedBy', 'objectType', 'objectId', 'objectName',
             'fieldName', 'oldValue', 'newValue', 'changeSource', 'batchId')
    .orderBy('changedAt desc', 'objectType', 'objectId', 'batchId').limit(maxRows)
  if (f.objectType) query = query.where({ objectType: f.objectType })
  if (f.objectId)   query = query.where({ objectId: String(f.objectId) })
  if (f.changedBy)  query = query.where({ changedBy: f.changedBy })
  if (f.source && f.source !== 'attribute') query = query.where({ changeSource: f.source })
  if (f.batchId)    query = query.where({ batchId: f.batchId })
  if (f.from) query = query.where('changedAt >=', new Date(f.from).toISOString())
  if (f.to)   query = query.where('changedAt <=', new Date(f.to + 'T23:59:59Z').toISOString())

  const attributesOnly = f.source === 'attribute'
  const logRows = attributesOnly ? [] : await db.run(query)

  // 2) optional typed attribute-history merge (custom attributes surface alongside field changes)
  let attrRows = []
  if (cfg.attrHistEntity) {
    const attrObjectType = f.objectType ? cfg.objectTypeMap[f.objectType] : null
    const wantAttr = !f.batchId &&
      (attributesOnly || !f.source || ['manual', 'import', 'api'].includes(f.source)) &&
      (!f.objectType || !!attrObjectType)
    if (wantAttr) {
      let aq = SELECT.from(cfg.attrHistEntity).orderBy('changedAt desc').limit(maxRows)
      if (attrObjectType) aq = aq.where({ objectType: attrObjectType })
      if (f.objectId)  aq = aq.where({ objectId: String(f.objectId) })
      if (f.changedBy) aq = aq.where({ changedBy: f.changedBy })
      if (f.from) aq = aq.where('changedAt >=', new Date(f.from).toISOString())
      if (f.to)   aq = aq.where('changedAt <=', new Date(f.to + 'T23:59:59Z').toISOString())
      const hist = await db.run(aq)
      if (hist && hist.length) {
        const labelByKey = {}
        if (cfg.attrDefEntity) {
          const defs = await db.run(SELECT.from(cfg.attrDefEntity).columns('internalKey', 'name', 'objectType'))
          defs.forEach(d => { labelByKey[d.objectType + '|' + d.internalKey] = d.name })
        }
        const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
        const coalesce = (h, p) => {
          const v = h[p + 'Text'] != null ? h[p + 'Text']
            : h[p + 'Integer'] != null ? h[p + 'Integer']
              : h[p + 'Decimal'] != null ? h[p + 'Decimal']
                : h[p + 'Date'] != null ? h[p + 'Date']
                  : h[p + 'Boolean']
          return v == null ? null : String(v)
        }
        attrRows = hist.map(h => ({
          ID: h.historyId, changedAt: h.changedAt, changedBy: h.changedBy,
          objectType: cap(h.objectType), objectId: h.objectId, objectName: h.objectId,
          fieldName: (labelByKey[h.objectType + '|' + h.attributeKey] || h.attributeKey) + '  (attribute)',
          oldValue: coalesce(h, 'oldValue'), newValue: coalesce(h, 'newValue'),
          changeSource: h.changeSource || 'attribute', batchId: null
        }))
      }
    }
  }

  return (logRows || []).concat(attrRows)
    .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))
    .slice(0, maxRows)
}

// Injection-safe CSV cell (RFC-4180 quoting + leading =+-@ guard) — inlined so the plugin
// carries no BIS dependency and stays portable.
function csvCell (v) {
  if (v == null) return ''
  let s = String(v)
  if (/^[=+\-@]/.test(s)) s = "'" + s
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
  return s
}

function toCsv (rows) {
  const cols = ['changedAt', 'changedBy', 'objectType', 'objectName', 'fieldName', 'oldValue', 'newValue', 'changeSource', 'batchId']
  const lines = (rows || []).map(r => cols.map(c => csvCell(r[c])).join(','))
  return [cols.join(','), ...lines].join('\n')
}

module.exports = { buildChangeDocuments, toCsv, csvCell, DEFAULTS }
