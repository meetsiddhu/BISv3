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

function getConfigBool(key, _fallback = false) {
  return getConfig(key).then(value => value === 'true' || value === '1' || value === 'yes')
}

function invalidateCache(key) { _cache.delete(key) }

// GIS coordinate reference system (EPSG code), config-driven.
// Default 7844 = GDA2020, the DECLARED datum for Australian assets (used for GeoJSON
// export declaration and policy). Override via SystemConfig key GIS_CRS_EPSG.
// See docs/eam-mapping/GIS-CRS-POLICY.md.
const DEFAULT_CRS_EPSG = 7844
function getCrsEpsg() {
  return getConfigInt('GIS_CRS_EPSG', DEFAULT_CRS_EPSG)
}

// HANA spatial COMPUTE/STORAGE SRID. This is the SRID the geoLocation column and all
// ST_Point/ST_Distance comparisons actually use, and it MUST be an SRS installed in
// HANA. Defaults to 4326 (WGS84) because HANA Cloud ships 4326 by default, GDA2020
// (7844) may not be installed, and the two differ by <2 m (coordinate values are
// interchangeable for storage/proximity). Both the proximity query and the geometry
// backfill read this single value so they can never drift apart. Override via
// SystemConfig key GIS_STORAGE_SRID once a matching HANA SRS exists.
const DEFAULT_STORAGE_SRID = 4326
function getStorageSrid() {
  return getConfigInt('GIS_STORAGE_SRID', DEFAULT_STORAGE_SRID)
}

module.exports = { getConfig, getConfigInt, getConfigBool, invalidateCache, getCrsEpsg, getStorageSrid, DEFAULT_CRS_EPSG, DEFAULT_STORAGE_SRID }
