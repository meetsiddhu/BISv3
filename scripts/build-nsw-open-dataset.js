#!/usr/bin/env node
/*
 * Builds loadable NSW bridge + culvert + heavy-vehicle-restriction files from
 * OpenStreetMap open data (Overpass → /tmp/osm-bridges.json, /tmp/osm-culverts.json).
 *
 * Outputs (demo-data/):
 *   NSW-OpenData-Bridges-Culverts.csv   — 58-col Mass Upload "Bridges" template
 *   NSW-OpenData-HV-Restrictions.csv    — 55-col Mass Upload "Restrictions" template
 *                                          (posted load / height / axle limits = heavy-vehicle
 *                                           access restrictions; the NHVR's domain)
 *
 * NHVR / heavy-vehicle note: the NHVR Route Planner / National Network Map is itself powered by
 * OpenStreetMap, so posted HV attributes (mass/height/axle limits, freight-route designation)
 * live in OSM tags and are mapped here onto the app's NHVR fields (loadRating, clearanceHeight,
 * freightRoute, postingStatus) and into companion restrictions. The GAZETTED route approvals
 * (B-double / road-train / HML networks) are authoritative NHVR data (National HV Network Map,
 * SHP/GPKG, NHVR Spatial API) requiring a spatial join — left blank + flagged for DQ.
 *
 * Source: (c) OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright).
 */
const fs = require('fs')
const path = require('path')

const cell = (v) => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
const BRIDGE_COLS = [
  ['ID', 'ID'], ['descr', 'descr'], ['bridgeId', 'bridgeId'], ['bridgeName*', 'bridgeName'],
  ['assetClass', 'assetClass'], ['route', 'route'], ['routeNumber', 'routeNumber'], ['state*', 'state'],
  ['region', 'region'], ['lga', 'lga'], ['latitude*', 'latitude'], ['longitude*', 'longitude'],
  ['location', 'location'], ['assetOwner*', 'assetOwner'], ['managingAuthority', 'managingAuthority'],
  ['structureType', 'structureType'], ['yearBuilt', 'yearBuilt'], ['designLoad', 'designLoad'],
  ['designStandard', 'designStandard'], ['clearanceHeight', 'clearanceHeight'], ['spanLength', 'spanLength'],
  ['material', 'material'], ['spanCount', 'spanCount'], ['totalLength', 'totalLength'], ['deckWidth', 'deckWidth'],
  ['numberOfLanes', 'numberOfLanes'], ['condition', 'condition'], ['conditionRating', 'conditionRating'],
  ['structuralAdequacyRating', 'structuralAdequacyRating'], ['postingStatus', 'postingStatus'],
  ['conditionStandard', 'conditionStandard'], ['seismicZone', 'seismicZone'],
  ['asBuiltDrawingReference', 'asBuiltDrawingReference'], ['floodImmunityAriYears', 'floodImmunityAriYears'],
  ['floodImpacted', 'floodImpacted'], ['highPriorityAsset', 'highPriorityAsset'], ['remarks', 'remarks'],
  ['status', 'status'], ['lastInspectionDate', 'lastInspectionDate'], ['nhvrAssessed', 'nhvrAssessed'],
  ['nhvrAssessmentDate', 'nhvrAssessmentDate'], ['loadRating', 'loadRating'], ['pbsApprovalClass', 'pbsApprovalClass'],
  ['importanceLevel', 'importanceLevel'], ['averageDailyTraffic', 'averageDailyTraffic'],
  ['heavyVehiclePercent', 'heavyVehiclePercent'], ['gazetteReference', 'gazetteReference'],
  ['nhvrReferenceUrl', 'nhvrReferenceUrl'], ['freightRoute', 'freightRoute'], ['overMassRoute', 'overMassRoute'],
  ['hmlApproved', 'hmlApproved'], ['bDoubleApproved', 'bDoubleApproved'], ['dataSource', 'dataSource'],
  ['sourceReferenceUrl', 'sourceReferenceUrl'], ['openDataReference', 'openDataReference'],
  ['sourceRecordId', 'sourceRecordId'], ['restriction_ID', 'restriction_ID'], ['geoJson', 'geoJson']
]
const RES_COLS = [
  ['ID', 'ID'], ['parent_ID', null], ['restrictionRef*', 'restrictionRef'], ['bridgeRef', 'bridgeRef'],
  ['bridge_ID', null], ['name', 'name'], ['descr', null], ['restrictionCategory*', 'restrictionCategory'],
  ['restrictionType*', 'restrictionType'], ['restrictionValue', 'restrictionValue'], ['restrictionUnit', 'restrictionUnit'],
  ['restrictionStatus*', 'restrictionStatus'], ['appliesToVehicleClass', null], ['grossMassLimit', 'grossMassLimit'],
  ['axleMassLimit', 'axleMassLimit'], ['heightLimit', 'heightLimit'], ['widthLimit', null], ['lengthLimit', null],
  ['speedLimit', null], ['permitRequired', null], ['escortRequired', null], ['temporary', null], ['active', 'active'],
  ['effectiveFrom', null], ['effectiveTo', null], ['approvedBy', null], ['direction', null],
  ['enforcementAuthority', 'enforcementAuthority'], ['temporaryFrom', null], ['temporaryTo', null],
  ['temporaryReason', null], ['approvalReference', null], ['issuingAuthority', 'issuingAuthority'],
  ['legalReference', null], ['remarks', 'remarks'], ['gazetteNumber', null], ['gazettePublicationDate', null],
  ['gazetteExpiryDate', null], ['reviewDueDate', null], ['approvalDate', null], ['restrictionReason', 'restrictionReason'],
  ['detourRoute', null], ['conditionTrigger', null], ['pbsClassApplicable', null], ['grossCombinationLimit', null],
  ['tandemAxleLimit', null], ['triAxleLimit', null], ['steerAxleLimit', null], ['pilotVehicleCount', null],
  ['signageRequired', 'signageRequired'], ['restrictionSeverity', 'restrictionSeverity'], ['laneAvailability', null],
  ['lanesOpen', null], ['lanesTotal', null], ['laneWidthLimit', null]
]

const toRad = (d) => d * Math.PI / 180
function haversine (a, b) {
  const R = 6371000; const dLat = toRad(b.lat - a.lat); const dLon = toRad(b.lon - a.lon)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
function centroid (g) {
  return { lat: +(g.reduce((s, p) => s + p.lat, 0) / g.length).toFixed(6), lon: +(g.reduce((s, p) => s + p.lon, 0) / g.length).toFixed(6) }
}
function lengthM (g) { let t = 0; for (let i = 1; i < g.length; i++) t += haversine(g[i - 1], g[i]); return Math.round(t) }
const num = (v) => { const m = String(v == null ? '' : v).match(/[\d.]+/); return m ? m[0] : '' }

const REGIONS = [
  ['Sydney Metropolitan', -34.20, -33.55, 150.55, 151.40], ['Central Coast', -33.55, -33.05, 151.10, 151.65],
  ['Hunter', -33.05, -31.90, 150.60, 152.30], ['Illawarra & Shoalhaven', -35.30, -34.20, 150.30, 151.05],
  ['Mid North Coast', -31.90, -30.30, 152.20, 153.20], ['Northern Rivers', -29.50, -28.10, 152.30, 153.65],
  ['New England & North West', -31.20, -28.60, 149.50, 152.30], ['Riverina', -36.20, -34.20, 143.40, 147.80],
  ['Murray', -36.30, -35.00, 142.00, 147.90], ['Central West & Orana', -34.00, -31.80, 147.00, 150.30],
  ['South East & Tablelands', -37.50, -34.40, 148.40, 150.50], ['Far West', -34.50, -28.80, 140.90, 145.50]
]
function regionOf (lat, lon) { for (const [n, s, no, w, e] of REGIONS) if (lat >= s && lat <= no && lon >= w && lon <= e) return n; return 'Regional NSW' }

function classOf (t) {
  if (t.tunnel === 'culvert' || t.man_made === 'culvert') return 'Culvert'
  if (t.railway || t.bridge === 'rail') return 'Rail Bridge'
  if (t.highway === 'footway' || t.highway === 'path' || t.highway === 'pedestrian' || t.highway === 'steps') return (t.bicycle && t.bicycle !== 'no') ? 'Shared Path Bridge' : 'Pedestrian Bridge'
  if (t.highway === 'cycleway') return 'Shared Path Bridge'
  if (t.highway) return 'Road Bridge'
  if (t.waterway) return 'Culvert'
  return 'Road Bridge'
}
const STRUCT = { yes: 'Beam Bridge', viaduct: 'Viaduct', aqueduct: 'Aqueduct', suspension: 'Suspension Bridge', cantilever: 'Cantilever Bridge', arch: 'Arch Bridge', 'cable-stayed': 'Cable-stayed Bridge', movable: 'Movable Bridge', swing: 'Movable Bridge', bascule: 'Movable Bridge', truss: 'Truss Bridge', boardwalk: 'Boardwalk' }
function structOf (t, cls) {
  if (cls === 'Culvert') return 'Culvert'
  if (t.bridge && STRUCT[t.bridge]) return STRUCT[t.bridge]
  if (t['bridge:structure'] && STRUCT[t['bridge:structure']]) return STRUCT[t['bridge:structure']]
  return ''
}
function ownerOf (t, cls) {
  if (cls === 'Rail Bridge') return 'Transport Asset Holding Entity (inferred)'
  const ref = t.ref || ''
  if (/^[ABM]\d/.test(ref) || /(AU:NSW|National Highway)/.test(t.network || '') || /^(motorway|trunk)$/.test(t.highway || '')) return 'Transport for NSW (inferred)'
  if (t.highway) return 'Local Council (inferred)'
  return 'Unknown (open data)'
}
function importanceOf (t, cls) {
  if (cls === 'Rail Bridge') return 4
  if (/^(motorway|trunk)/.test(t.highway || '')) return 4
  if (t.highway === 'primary' || t.highway === 'primary_link') return 3
  if (t.highway === 'secondary' || t.highway === 'secondary_link') return 2
  if (cls === 'Pedestrian Bridge' || cls === 'Shared Path Bridge') return 1
  if (t.highway) return 1
  return ''
}
const yearOf = (t) => { const m = (t.start_date || t['ref:start_date'] || '').match(/\b(1[5-9]\d\d|20\d\d)\b/); return m ? +m[1] : '' }

function transform (way) {
  const t = way.tags || {}
  const g = way.geometry || []
  if (g.length < 2 || !t.name) return null
  const c = centroid(g)
  const cls = classOf(t)
  const struct = structOf(t, cls)
  const owner = ownerOf(t, cls)
  const year = yearOf(t)
  // heavy-vehicle / NHVR attributes from OSM tags
  const loadR = num(t.maxweight || t['maxweight:signed'])
  const clearH = /^[\d.]/.test(t.maxheight || '') ? num(t.maxheight) : '' // skip 'default'/'unrestricted'
  const axleR = num(t.maxaxleload)
  const posted = (loadR || clearH) ? 'Restricted' : ''
  const freight = (t.hgv === 'designated' || t.hgv === 'yes') ? true : ''
  const rec = {
    ID: '', descr: '', bridgeId: t.ref || ('OSM-' + way.id), bridgeName: t.name, assetClass: cls,
    route: '', routeNumber: t.ref || '', state: 'NSW', region: regionOf(c.lat, c.lon), lga: '',
    latitude: c.lat, longitude: c.lon, location: t['addr:place'] || t.waterway || '',
    assetOwner: owner, managingAuthority: '', structureType: struct, yearBuilt: year,
    designLoad: '', designStandard: '', clearanceHeight: clearH, spanLength: '', material: t.material || '',
    spanCount: '', totalLength: lengthM(g), deckWidth: num(t.width), numberOfLanes: t.lanes ? parseInt(t.lanes, 10) : '',
    condition: '', conditionRating: '', structuralAdequacyRating: '', postingStatus: posted,
    conditionStandard: '', seismicZone: '', asBuiltDrawingReference: '', floodImmunityAriYears: '',
    floodImpacted: '', highPriorityAsset: '', remarks: '', status: 'Active', lastInspectionDate: '',
    nhvrAssessed: '', nhvrAssessmentDate: '', loadRating: loadR, pbsApprovalClass: '',
    importanceLevel: importanceOf(t, cls), averageDailyTraffic: '', heavyVehiclePercent: '',
    gazetteReference: '', nhvrReferenceUrl: '', freightRoute: freight, overMassRoute: '', hmlApproved: '',
    bDoubleApproved: '', dataSource: 'OpenStreetMap (open data, ODbL)',
    sourceReferenceUrl: 'https://www.openstreetmap.org/way/' + way.id, openDataReference: 'OSM:way/' + way.id,
    sourceRecordId: String(way.id), restriction_ID: '',
    geoJson: JSON.stringify({ type: 'LineString', coordinates: g.map((p) => [p.lon, p.lat]) })
  }
  const missing = ['condition', 'conditionRating', 'lastInspectionDate', 'lga']
  if (!struct) missing.push('structureType')
  if (!year) missing.push('yearBuilt')
  if (!posted) missing.push('postingStatus')
  const tier = missing.length <= 5 ? 'PARTIAL' : 'INCOMPLETE'
  const hv = [loadR && 'load limit ' + loadR + 't', clearH && 'clearance ' + clearH + 'm', axleR && 'axle ' + axleR + 't', freight && 'freight route'].filter(Boolean)
  const hvNote = hv.length ? ` HV: ${hv.join(', ')} (posted, open data; NHVR gazettal/route approval NOT verified).` : ''
  rec.remarks = `OPEN DATA (OpenStreetMap, ODbL). DQ: ${tier} - geometry & identity captured; ` +
    `owner/region/importance INFERRED (verify). Missing: ${missing.join(', ')}. No engineering/inspection data from open source.${hvNote}`

  // companion heavy-vehicle restriction for posted load / height / axle limits
  let restriction = null
  if (loadR || clearH || axleR) {
    const isLoad = !!(loadR || axleR)
    restriction = {
      ID: '', restrictionRef: 'HVR-' + way.id, bridgeRef: rec.bridgeId,
      name: (isLoad ? 'Load limit' : 'Height limit') + ' - ' + t.name,
      restrictionCategory: 'Permanent', // permanence, not limit-kind
      restrictionType: loadR ? 'Load Limit' : (clearH ? 'Height Limit' : 'Axle Group Limit'),
      restrictionValue: loadR || clearH || axleR, restrictionUnit: loadR ? 't' : (clearH ? 'm' : 't'),
      restrictionStatus: 'Active', grossMassLimit: loadR, axleMassLimit: axleR, heightLimit: clearH,
      active: true, signageRequired: true, enforcementAuthority: owner, issuingAuthority: 'Posted signage (OpenStreetMap)',
      restrictionReason: 'Posted heavy-vehicle ' + (loadR ? 'mass' : 'clearance') + ' limit captured from open data (OpenStreetMap).',
      restrictionSeverity: (loadR && +loadR < 20) ? 'Major' : 'Moderate',
      remarks: 'OPEN DATA (OpenStreetMap, ODbL). DQ: posted limit captured; NHVR gazette reference, approved-vehicle classes & axle breakdown NOT available from open data - verify against the NHVR National Network Map.'
    }
  }
  return { bridge: rec, restriction }
}

// ── build ──
function load (f) { try { return require(f).elements || [] } catch { return [] } }
const bridgesRaw = []; const restrAll = []
const handle = (w) => { const r = transform(w); if (!r) return; bridgesRaw.push(r.bridge); if (r.restriction) restrAll.push(r.restriction) }
for (const w of load('/tmp/osm-bridges.json')) handle(w)
for (const w of load('/tmp/osm-culverts.json')) handle(w)

const seen = new Set(); const rows = []; const keptRefs = new Set()
for (const r of bridgesRaw) {
  const k = r.bridgeName + '@' + r.latitude.toFixed(3) + ',' + r.longitude.toFixed(3)
  if (seen.has(k)) continue; seen.add(k); rows.push(r); keptRefs.add(r.bridgeId)
}
const restrRows = restrAll.filter((x) => keptRefs.has(x.bridgeRef))

// ── spatial join: flag bridges on the NSW heavy-vehicle freight network ──
// OSM hgv=designated roads = the freight/HV access network the NHVR map is built on. A bridge
// within ~250 m of such a road is on a freight route. (The gazetted B-double/road-train/HML
// approvals are NOT open data — NHVR Spatial API — so those flags stay blank + DQ-flagged.)
const FREIGHT_M = 250
const M_DEG = 111320
const segs = []
for (const w of load('/tmp/osm-freight.json')) {
  const g = w.geometry || []
  for (let i = 1; i < g.length; i++) {
    const a = g[i - 1]; const b = g[i]
    segs.push({ ax: a.lon, ay: a.lat, bx: b.lon, by: b.lat, minLat: Math.min(a.lat, b.lat), maxLat: Math.max(a.lat, b.lat), minLon: Math.min(a.lon, b.lon), maxLon: Math.max(a.lon, b.lon) })
  }
}
const buf = FREIGHT_M / M_DEG * 1.3
function ptSegM (plat, plon, s) {
  const mx = M_DEG * Math.cos(((s.ay + s.by) / 2) * Math.PI / 180)
  const px = plon * mx; const py = plat * M_DEG; const ax = s.ax * mx; const ay = s.ay * M_DEG; const bx = s.bx * mx; const by = s.by * M_DEG
  const dx = bx - ax; const dy = by - ay; const len2 = dx * dx + dy * dy || 1
  let t = ((px - ax) * dx + (py - ay) * dy) / len2; t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
function onFreight (lat, lon) {
  for (const s of segs) {
    if (lat < s.minLat - buf || lat > s.maxLat + buf || lon < s.minLon - buf || lon > s.maxLon + buf) continue
    if (ptSegM(lat, lon, s) <= FREIGHT_M) return true
  }
  return false
}
let freightHits = 0
for (const r of rows) {
  if (r.freightRoute === true) { freightHits++; continue }
  if (segs.length && onFreight(r.latitude, r.longitude)) {
    r.freightRoute = true; freightHits++
    r.remarks += ' On NSW freight network (OSM hgv=designated, spatial join); NHVR B-double/road-train/HML approval NOT verified.'
  }
}

function writeCsv (file, cols, data) {
  const lines = [cols.map((c) => c[0]).join(',')]
  for (const r of data) lines.push(cols.map((c) => cell(c[1] ? r[c[1]] : '')).join(','))
  fs.writeFileSync(path.join(__dirname, '..', 'demo-data', file), lines.join('\n') + '\n')
}
writeCsv('NSW-OpenData-Bridges-Culverts.csv', BRIDGE_COLS, rows)
writeCsv('NSW-OpenData-HV-Restrictions.csv', RES_COLS, restrRows)

const byClass = rows.reduce((m, r) => { m[r.assetClass] = (m[r.assetClass] || 0) + 1; return m }, {})
const hvBridges = rows.filter((r) => r.loadRating || r.clearanceHeight || r.freightRoute).length
console.log('bridges:', rows.length, JSON.stringify(byClass))
console.log('bridges with HV/NHVR attributes:', hvBridges, '(loadRating/clearanceHeight/freightRoute)')
console.log('bridges on freight network (spatial join):', freightHits, 'of', rows.length)
console.log('HV restrictions emitted:', restrRows.length,
  '— load=' + restrRows.filter((r) => r.restrictionType === 'Load Limit').length,
  'height=' + restrRows.filter((r) => r.restrictionType === 'Height Limit').length)
