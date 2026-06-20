'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE PLUGIN: mapping — generic source↔target resolver. INDEPENDENT (imports no
// other plugin). Backed by plugins.mapping.MappingDomain / MappingValue (see
// mapping-schema.cds). Portable: call resolve(domainCode, key, direction). Process-cached
// with a short TTL so admin edits propagate without a restart; invalidate() forces refresh.
// ─────────────────────────────────────────────────────────────────────────────
const cds = require('@sap/cds')
const { SELECT } = cds.ql
const LOG = cds.log('plugin-mapping')

const DOMAIN_ENTITY = 'plugins.mapping.MappingDomain'
const VALUE_ENTITY  = 'plugins.mapping.MappingValue'
const TTL_MS = 60_000

let _cache = null        // Map<domainCode, { fwd:Map, rev:Map, direction }>
let _loadedAt = 0

async function _load (db) {
  if (_cache && (Date.now() - _loadedAt) < TTL_MS) return _cache
  const next = new Map()
  try {
    const domains = await db.run(SELECT.from(DOMAIN_ENTITY).where({ active: true }))
    const values  = await db.run(SELECT.from(VALUE_ENTITY).where({ active: true }))
    const byId = new Map(domains.map(d => [d.ID, d]))
    for (const d of domains) next.set(d.domainCode, { direction: d.direction, fwd: new Map(), rev: new Map() })
    for (const v of values) {
      const d = byId.get(v.domain_ID); if (!d) continue
      const c = next.get(d.domainCode); if (!c) continue
      c.fwd.set(v.sourceKey, v.targetKey)
      c.rev.set(v.targetKey, v.sourceKey)
    }
    _cache = next; _loadedAt = Date.now()
  } catch (e) {
    LOG.warn('mapping cache load failed; returning empty:', e.message)
    _cache = next; _loadedAt = Date.now()
  }
  return _cache
}

function invalidate () { _cache = null; _loadedAt = 0 }

// resolve(domainCode, key, direction?, opts?) — TO_TARGET (default) maps sourceKey→targetKey;
// FROM_TARGET maps targetKey→sourceKey. Returns opts.fallback (default null) when unmapped.
async function resolve (domainCode, key, direction = 'TO_TARGET', { db, fallback = null } = {}) {
  if (key == null) return fallback
  const conn = db || await cds.connect.to('db')
  const cache = await _load(conn)
  const c = cache.get(domainCode)
  if (!c) return fallback
  const table = direction === 'FROM_TARGET' ? c.rev : c.fwd
  return table.has(key) ? table.get(key) : fallback
}

// Convenience helpers for the EAM domains seeded for this app (the resolver is generic;
// these just compose the conventional composite keys).
const eamCode  = (bisEntity, bisField, bisValue, opts) => resolve('EAM_CODE',  `${bisEntity}:${bisField}:${bisValue}`, 'TO_TARGET', opts)
const eamField = (bisEntity, bisField, opts)            => resolve('EAM_FIELD', `${bisEntity}:${bisField}`, 'TO_TARGET', opts)

module.exports = { resolve, invalidate, eamCode, eamField, DOMAIN_ENTITY, VALUE_ENTITY, TTL_MS }
