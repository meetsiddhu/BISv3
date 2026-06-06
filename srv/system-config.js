const cds = require('@sap/cds')
const { SELECT } = cds.ql

const _cache = new Map()
const CACHE_TTL_MS = 60_000

async function getConfig(key) {
  const cached = _cache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value
  try {
    const db = await cds.connect.to('db')
    const row = await db.run(SELECT.one.from('bridge.management.SystemConfig').where({ configKey: key }))
    const val = row?.value ?? row?.defaultValue ?? null
    _cache.set(key, { value: val, ts: Date.now() })
    return val
  } catch { return null }
}

function getConfigInt(key, fallback = 0) {
  return getConfig(key).then(value => {
    const parsedValue = parseInt(value, 10)
    return isNaN(parsedValue) ? fallback : parsedValue
  })
}

function getConfigBool(key, fallback = false) {
  return getConfig(key).then(value => value === 'true' || value === '1' || value === 'yes')
}

function invalidateCache(key) { _cache.delete(key) }

// GIS coordinate reference system (EPSG code), config-driven.
// Default 7844 = GDA2020, the correct datum for Australian assets. Override via
// the SystemConfig key GIS_CRS_EPSG. See docs/eam-mapping/GIS-CRS-POLICY.md.
const DEFAULT_CRS_EPSG = 7844
function getCrsEpsg() {
  return getConfigInt('GIS_CRS_EPSG', DEFAULT_CRS_EPSG)
}

module.exports = { getConfig, getConfigInt, getConfigBool, invalidateCache, getCrsEpsg, DEFAULT_CRS_EPSG }
