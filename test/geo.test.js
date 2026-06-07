const { validateGeoJson } = require('../srv/lib/geo')

describe('GeoJSON ingress validation (GIS-1/GIS-5)', () => {
  test('empty/null is allowed (no geometry)', () => {
    expect(validateGeoJson(null)).toEqual({ ok: true, value: null })
    expect(validateGeoJson('')).toEqual({ ok: true, value: null })
  })

  test('valid Point passes and is normalised', () => {
    const r = validateGeoJson('{"type":"Point","coordinates":[151.21,-33.85]}')
    expect(r.ok).toBe(true)
    expect(JSON.parse(r.value).type).toBe('Point')
  })

  test('valid LineString / Polygon / MultiLineString pass', () => {
    expect(validateGeoJson('{"type":"LineString","coordinates":[[151.1,-33.8],[151.2,-33.9]]}').ok).toBe(true)
    expect(validateGeoJson('{"type":"Polygon","coordinates":[[[151.1,-33.8],[151.2,-33.8],[151.2,-33.9],[151.1,-33.8]]]}').ok).toBe(true)
    expect(validateGeoJson('{"type":"MultiLineString","coordinates":[[[151.1,-33.8],[151.2,-33.9]]]}').ok).toBe(true)
  })

  test('Feature is unwrapped to its geometry', () => {
    const r = validateGeoJson('{"type":"Feature","geometry":{"type":"Point","coordinates":[151,-33]},"properties":{}}')
    expect(r.ok).toBe(true)
    expect(JSON.parse(r.value).type).toBe('Point')
  })

  test('malformed JSON is rejected', () => {
    expect(validateGeoJson('{not json').ok).toBe(false)
  })

  test('unsupported geometry type is rejected', () => {
    expect(validateGeoJson('{"type":"Circle","coordinates":[1,2]}').ok).toBe(false)
  })

  test('[lat,lon] swap is caught (lat 151 > 90)', () => {
    const r = validateGeoJson('{"type":"Point","coordinates":[-33.85,151.21]}')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/range/)
  })

  test('out-of-range coordinate is rejected', () => {
    expect(validateGeoJson('{"type":"Point","coordinates":[999,-33]}').ok).toBe(false)
  })

  // SEC-006: DoS guards
  test('valid GeometryCollection still passes', () => {
    const gc = '{"type":"GeometryCollection","geometries":[{"type":"Point","coordinates":[151,-33]}]}'
    expect(validateGeoJson(gc).ok).toBe(true)
  })

  test('oversized raw payload is rejected (SEC-006 size guard)', () => {
    const big = '{"type":"LineString","coordinates":[' + '[151,-33],'.repeat(300000) + '[151,-33]]}'
    const r = validateGeoJson(big)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/bytes|too large|range/)
  })

  test('excessive coordinate count is rejected (SEC-006 count guard)', () => {
    // Just over the pair budget but under the byte budget — exercises the count guard.
    const coords = []
    for (let i = 0; i < 120000; i++) coords.push([151, -33])
    const r = validateGeoJson({ type: 'MultiPoint', coordinates: coords })
    expect(r.ok).toBe(false)
  })

  test('deeply nested arrays are rejected (SEC-006 depth guard)', () => {
    let nested = [151, -33]
    for (let i = 0; i < 20; i++) nested = [nested]
    const r = validateGeoJson({ type: 'Polygon', coordinates: nested })
    expect(r.ok).toBe(false)
  })
})
