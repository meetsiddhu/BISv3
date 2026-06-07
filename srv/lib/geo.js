'use strict'

// Shared GeoJSON validation (RFC 7946). Used at every ingress boundary (CSV upload,
// API) so malformed or coordinate-swapped geometry never silently persists. GIS-1/GIS-5.

const GEOM_TYPES = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']

// SEC-006: DoS guards. A maliciously deep/huge GeoJSON could blow the stack or pin CPU
// during validation, so bound the raw size, the nesting depth, the total coordinate
// count, and the GeometryCollection nesting before we ever recurse the structure.
const MAX_GEOJSON_BYTES = 2 * 1024 * 1024 // 2 MB raw payload
const MAX_COORD_DEPTH = 12               // Polygon/MultiPolygon legitimately nests ~4; 12 is generous
const MAX_COORD_PAIRS = 100000           // a single geometry's [lon,lat] pair budget
const MAX_GEOMCOLLECTION_DEPTH = 10      // RFC 7946 discourages nested GeometryCollections

// Recursively check that every [lon, lat] pair is within RFC 7946 ranges, while bounding
// recursion depth and total pair count. This also catches the common [lat, lon] swap when
// lon > 90 (lat can never exceed 90). `ctr` is a shared mutable counter ({ n }).
function coordsInRange (c, depth = 0, ctr = { n: 0 }) {
  if (depth > MAX_COORD_DEPTH) return false
  if (!Array.isArray(c)) return false
  if (typeof c[0] === 'number') {
    if (++ctr.n > MAX_COORD_PAIRS) return false
    const [lon, lat] = c
    return Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90
  }
  return c.every(x => coordsInRange(x, depth + 1, ctr))
}

// Validate a geometry node, recursing into GeometryCollection with a depth bound.
function validateGeometry (geom, gcDepth = 0) {
  if (!geom || !GEOM_TYPES.includes(geom.type)) return { ok: false, error: 'unsupported or missing geometry type' }
  if (geom.type === 'GeometryCollection') {
    if (gcDepth > MAX_GEOMCOLLECTION_DEPTH) return { ok: false, error: 'GeometryCollection nested too deeply' }
    if (!Array.isArray(geom.geometries)) return { ok: false, error: 'GeometryCollection missing geometries' }
    if (geom.geometries.length > MAX_COORD_PAIRS) return { ok: false, error: 'GeometryCollection too large' }
    for (const sub of geom.geometries) {
      const r = validateGeometry(sub, gcDepth + 1)
      if (!r.ok) return r
    }
    return { ok: true }
  }
  if (!Array.isArray(geom.coordinates)) return { ok: false, error: 'missing coordinates array' }
  if (!coordsInRange(geom.coordinates)) {
    return { ok: false, error: 'coordinate out of range / payload too large (expected [lon, lat] per RFC 7946)' }
  }
  return { ok: true }
}

// Returns { ok, value, error }. value is a normalised geometry JSON string (or null
// when input is empty). Accepts a Feature by unwrapping to its geometry.
function validateGeoJson (raw) {
  if (raw == null || raw === '') return { ok: true, value: null }
  // SEC-006: bound the raw size before parsing/recursing.
  if (typeof raw === 'string' && raw.length > MAX_GEOJSON_BYTES) {
    return { ok: false, error: `GeoJSON exceeds ${MAX_GEOJSON_BYTES} bytes` }
  }
  let g
  try { g = typeof raw === 'string' ? JSON.parse(raw) : raw } catch (e) { return { ok: false, error: 'not valid JSON' } }
  if (!g || typeof g !== 'object') return { ok: false, error: 'not a GeoJSON object' }
  const geom = g.type === 'Feature' ? g.geometry : g
  const result = validateGeometry(geom)
  if (!result.ok) return result
  return { ok: true, value: JSON.stringify(geom) }
}

module.exports = { validateGeoJson, coordsInRange, validateGeometry, GEOM_TYPES, MAX_GEOJSON_BYTES, MAX_COORD_DEPTH, MAX_COORD_PAIRS }
