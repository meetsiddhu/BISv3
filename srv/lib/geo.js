'use strict'

// Shared GeoJSON validation (RFC 7946). Used at every ingress boundary (CSV upload,
// API) so malformed or coordinate-swapped geometry never silently persists. GIS-1/GIS-5.

const GEOM_TYPES = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']

// Recursively check that every [lon, lat] pair is within RFC 7946 ranges. This also
// catches the common [lat, lon] swap when lon > 90 (lat can never exceed 90).
function coordsInRange (c) {
  if (!Array.isArray(c)) return false
  if (typeof c[0] === 'number') {
    const [lon, lat] = c
    return Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90
  }
  return c.every(coordsInRange)
}

// Returns { ok, value, error }. value is a normalised geometry JSON string (or null
// when input is empty). Accepts a Feature by unwrapping to its geometry.
function validateGeoJson (raw) {
  if (raw == null || raw === '') return { ok: true, value: null }
  let g
  try { g = typeof raw === 'string' ? JSON.parse(raw) : raw } catch (e) { return { ok: false, error: 'not valid JSON' } }
  if (!g || typeof g !== 'object') return { ok: false, error: 'not a GeoJSON object' }
  const geom = g.type === 'Feature' ? g.geometry : g
  if (!geom || !GEOM_TYPES.includes(geom.type)) return { ok: false, error: 'unsupported or missing geometry type' }
  if (geom.type === 'GeometryCollection') {
    if (!Array.isArray(geom.geometries)) return { ok: false, error: 'GeometryCollection missing geometries' }
  } else {
    if (!Array.isArray(geom.coordinates)) return { ok: false, error: 'missing coordinates array' }
    if (!coordsInRange(geom.coordinates)) return { ok: false, error: 'coordinate out of range (expected [lon, lat] per RFC 7946)' }
  }
  return { ok: true, value: JSON.stringify(geom) }
}

module.exports = { validateGeoJson, coordsInRange, GEOM_TYPES }
