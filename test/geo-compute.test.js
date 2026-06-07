const { parseBbox, zoomToCellSize, haversineDistanceKm, DEFAULT_ZOOM_CELLS } = require('../srv/lib/geo-compute')

describe('geo-compute (extracted from server.js, ARCH-T4)', () => {
  test('parseBbox validates and orders the four corners', () => {
    expect(parseBbox('150,-34,151,-33')).toEqual({ minLon: 150, minLat: -34, maxLon: 151, maxLat: -33 })
    expect(parseBbox(null)).toBeNull()
    expect(parseBbox('1,2,3')).toBeNull()            // wrong arity
    expect(parseBbox('a,b,c,d')).toBeNull()          // non-numeric
    expect(parseBbox('151,-33,150,-34')).toBeNull()  // min >= max
  })

  test('zoomToCellSize returns the first matching cell, null past the last', () => {
    expect(zoomToCellSize(4)).toBe(2.0)
    expect(zoomToCellSize(6)).toBe(0.5)
    expect(zoomToCellSize(8)).toBe(0.1)
    expect(zoomToCellSize(15)).toBeNull()            // high zoom -> individual points
    expect(zoomToCellSize(6, [[6, 9]])).toBe(9)      // honours a custom cell table
  })

  test('haversineDistanceKm computes a sane great-circle distance', () => {
    // Sydney Harbour Bridge area: ~0 km to itself
    expect(haversineDistanceKm(-33.852, 151.211, -33.852, 151.211)).toBeCloseTo(0, 5)
    // Sydney -> Newcastle ~ 115 km (allow tolerance)
    const d = haversineDistanceKm(-33.868, 151.207, -32.927, 151.776)
    expect(d).toBeGreaterThan(100)
    expect(d).toBeLessThan(135)
  })

  test('DEFAULT_ZOOM_CELLS is the documented config default', () => {
    expect(DEFAULT_ZOOM_CELLS[0]).toEqual([4, 2.0])
  })
})
