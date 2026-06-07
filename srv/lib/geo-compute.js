'use strict'

// ARCH-T4: pure geodesy/compute helpers extracted from the server.js god-file so they
// are independently unit-testable and reusable. No CAP/Express/DB dependencies here.

// Parse a "minLon,minLat,maxLon,maxLat" bbox string into a validated object, or null.
function parseBbox (bbox) {
  if (!bbox) return null
  const parts = String(bbox).split(',').map(Number)
  if (parts.length !== 4 || parts.some(isNaN)) return null
  const [minLon, minLat, maxLon, maxLat] = parts
  if (minLon >= maxLon || minLat >= maxLat) return null
  return { minLon, minLat, maxLon, maxLat }
}

// CONFIG-R3: zoom→grid-cell mapping. [maxZoom, cellSizeDeg] pairs; beyond the last pair
// individual points are returned (null = no clustering).
const DEFAULT_ZOOM_CELLS = [[4, 2.0], [5, 1.0], [6, 0.5], [7, 0.25], [8, 0.1]]
function zoomToCellSize (zoom, cells = DEFAULT_ZOOM_CELLS) {
  for (const pair of cells) { if (zoom <= pair[0]) return pair[1] }
  return null
}

// CONFIG-4: spherical great-circle distance (km). The HANA path uses ST_Distance (CRS-aware);
// this is the SQLite-fallback approximation. earthRadiusKm is config-driven (default 6371).
function haversineDistanceKm (lat1, lng1, lat2, lng2, earthRadiusKm = 6371) {
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const haversineTerm = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversineTerm), Math.sqrt(1 - haversineTerm))
}

module.exports = { parseBbox, zoomToCellSize, haversineDistanceKm, DEFAULT_ZOOM_CELLS }
