#!/usr/bin/env node
/*
 * Generates demo seed CSVs for the HANA-deployed app:
 *   db/data/bridge.management-Bridges.csv         (register / map)
 *   db/data/bridge.management-BridgeElements.csv  (BHI/BSI live breakdown)
 *   db/data/bridge.management-Restrictions.csv    (restrictions tiles)
 *
 * Fictional, NSW-style Australian bridges with a deliberate spread of mode /
 * state / condition / importance / environment so the dashboard, map, BHI/BSI
 * explorer and prioritisation all show meaningful variety. bsiScore/bhiScore/
 * bsiPriority and the prioritisation runs are computed AFTER load by the real
 * engines (see scripts/finalise-seed-scores.* in the runbook) — not hand-set.
 */
const fs = require('fs')
const path = require('path')
const DATA = path.join(__dirname, '..', 'db', 'data')

function cell (v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
function writeCsv (file, cols, rows) {
  const lines = [cols.join(',')]
  for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(','))
  fs.writeFileSync(path.join(DATA, file), lines.join('\n') + '\n')
  console.log('wrote ' + file + ' (' + rows.length + ' rows)')
}

// id, name, mode, assetClass, state, region(+coastal flag for corrosion), lga, lat, lon,
// year, condition(1-10), structAdeq(1-10), importance(1-4), adt, hv%, flood, seismic, owner
const B = [
  [1001, 'Parramatta River Bridge',   'Road',       'Road Bridge',        'NSW', 'Sydney Metropolitan', 'Parramatta',   -33.8136, 151.0034, 1987, 8, 8, 3, 28000, 9,  false, '0', 'Demo Roads Authority'],
  [1002, 'Hartley Creek Bridge',       'Road',       'Road Bridge',        'NSW', 'Regional NSW',        'Lithgow',      -33.5419, 150.1551, 1965, 6, 5, 2,  4200, 14, false, '0', 'Demo Roads Authority'],
  [1003, 'Yarra Boulevard Overpass',   'Road',       'Road Bridge',        'VIC', 'Greater Melbourne',   'Boroondara',   -37.7985, 145.0356, 1995, 9, 9, 2, 65000, 7,  false, '1', 'Demo State Transport'],
  [1004, 'Goldfields Rail Viaduct',    'Rail',       'Rail Bridge',        'VIC', 'Regional Victoria',   'Ballarat',     -37.5622, 143.8503, 1958, 4, 4, 4,     0, 0,  false, '1', 'Demo Rail Authority'],
  [1005, 'Brisbane River Footbridge',  'Pedestrian', 'Pedestrian Bridge',  'QLD', 'Brisbane',            'Brisbane',     -27.4709, 153.0176, 2011, 8, 9, 1,     0, 0,  false, '0', 'Demo City Council'],
  [1006, 'Torrens Weir Bridge',        'Road',       'Road Bridge',        'SA',  'Adelaide',            'Adelaide',     -34.9136, 138.5995, 1979, 5, 5, 2, 12500, 10, false, '0', 'Demo City Council'],
  [1007, 'Derwent Estuary Crossing',   'Road',       'Road Bridge',        'TAS', 'Coastal Tasmania',    'Hobart',       -42.8210, 147.3257, 1972, 3, 3, 3, 18000, 12, true,  '0', 'Demo Roads Authority'],
  [1008, 'Swan River Shared Path',     'Pedestrian', 'Shared Path Bridge', 'WA',  'Perth',               'Perth',        -31.9609, 115.8765, 2006, 7, 8, 1,     0, 0,  false, '0', 'Demo City Council'],
  [1009, 'Hunter Valley Rail Bridge',  'Rail',       'Rail Bridge',        'NSW', 'Regional NSW',        'Maitland',     -32.7330, 151.5550, 1969, 5, 5, 4,     0, 0,  false, '0', 'Demo Rail Authority'],
  [1010, 'Murray River Bridge',        'Road',       'Road Bridge',        'NSW', 'Riverina',            'Albury',       -36.0737, 146.9135, 1961, 6, 5, 3,  9800, 18, true,  '0', 'Demo Roads Authority'],
  [1011, 'Coral Coast Highway Bridge', 'Road',       'Road Bridge',        'QLD', 'Coastal Queensland',  'Mackay',       -21.1411, 149.1860, 1990, 4, 4, 3, 15200, 22, true,  '0', 'Demo State Transport'],
  [1012, 'Old Town Bridge',            'Road',       'Road Bridge',        'NSW', 'Regional NSW',        'Bathurst',     -33.4193, 149.5775, 1954, 2, 2, 2,  2600, 8,  false, '0', 'Demo City Council']
]

const BRIDGE_COLS = ['ID','bridgeId','bridgeName','assetClass','transportMode','state','region','lga',
  'latitude','longitude','assetOwner','yearBuilt','material','structureType','conditionRating',
  'structuralAdequacyRating','status','importanceLevel','averageDailyTraffic','heavyVehiclePercent',
  'floodImpacted','seismicZone','mitigationCostAud','expectedValueAud','benefitCostRatio']

const MAT = { 'Road Bridge': 'Reinforced Concrete', 'Rail Bridge': 'Steel', 'Pedestrian Bridge': 'Steel/Timber', 'Shared Path Bridge': 'Composite' }
const STR = { 'Road Bridge': 'Beam Bridge', 'Rail Bridge': 'Truss Bridge', 'Pedestrian Bridge': 'Cable-stayed', 'Shared Path Bridge': 'Box Girder' }

const bridges = B.map((b, i) => {
  const [ID, name, mode, aclass, state, region, lga, lat, lon, year, cond, str, imp, adt, hv, flood, seis, owner] = b
  // worse condition + higher importance → higher remediation cost & expected loss (for the optimiser)
  const mitig = (11 - cond) * 120000 + imp * 90000
  const expVal = (11 - cond) * 65000 + imp * 110000 + Math.round(adt / 50)
  return {
    ID, bridgeId: 'BR-' + (1000 + i + 1), bridgeName: name, assetClass: aclass, transportMode: mode,
    state, region, lga, latitude: lat, longitude: lon, assetOwner: owner, yearBuilt: year,
    material: MAT[aclass] || 'Reinforced Concrete', structureType: STR[aclass] || 'Beam Bridge',
    conditionRating: cond, structuralAdequacyRating: str, status: 'Active', importanceLevel: imp,
    averageDailyTraffic: adt, heavyVehiclePercent: hv, floodImpacted: flood, seismicZone: seis,
    mitigationCostAud: mitig, expectedValueAud: expVal, benefitCostRatio: Math.round((expVal / mitig) * 100) / 100
  }
})
writeCsv('bridge.management-Bridges.csv', BRIDGE_COLS, bridges)

// ── Elements (worst-per-part drives BSI) ──
const PARTS = [['DK', 'Deck', +1], ['SUP', 'Superstructure', 0], ['SUB', 'Substructure', -1], ['BRG', 'Bearings', -1], ['DRN', 'Drainage', +1]]
const clamp = (n) => Math.max(1, Math.min(10, n))
const elements = []
B.forEach((b) => {
  const ID = b[0], cond = b[10]
  PARTS.forEach((p, j) => {
    // pedestrian/shared bridges skip bearings/drainage for a leaner element set
    if (j >= 3 && (b[3] === 'Pedestrian Bridge')) return
    elements.push({
      ID: 'el-' + ID + '-' + p[0].toLowerCase(), bridge_ID: ID, elementCode: p[0], elementType: p[1],
      conditionRating: clamp(cond + p[2]), totalQuantity: 100, quantityUnit: 'm2',
      conditionState1Qty: clamp(cond + p[2]) * 10
    })
  })
})
writeCsv('bridge.management-BridgeElements.csv',
  ['ID','bridge_ID','elementCode','elementType','conditionRating','totalQuantity','quantityUnit','conditionState1Qty'],
  elements)

// ── Restrictions (linked to bridges) ──
const restrictions = [
  { ID: 'res-001', restrictionRef: 'RES-1001', name: 'Hartley Creek load limit',     bridgeRef: 'BR-1002', bridge_ID: 1002, restrictionCategory: 'Load',   restrictionType: 'Load Limit',        restrictionValue: 42, restrictionUnit: 't',    restrictionStatus: 'Active', active: true, restrictionReason: 'Aged arch — reduced live-load capacity', restrictionSeverity: 'Major' },
  { ID: 'res-002', restrictionRef: 'RES-1002', name: 'Derwent crossing speed limit',  bridgeRef: 'BR-1007', bridge_ID: 1007, restrictionCategory: 'Speed',  restrictionType: 'Speed Restriction', restrictionValue: 40, restrictionUnit: 'km/h', restrictionStatus: 'Active', active: true, restrictionReason: 'Poor deck condition',                  restrictionSeverity: 'Moderate' },
  { ID: 'res-003', restrictionRef: 'RES-1003', name: 'Murray River height limit',     bridgeRef: 'BR-1010', bridge_ID: 1010, restrictionCategory: 'Height', restrictionType: 'Height Limit',      restrictionValue: 4.3, restrictionUnit: 'm',   restrictionStatus: 'Active', active: true, restrictionReason: 'Low truss clearance',                   restrictionSeverity: 'Moderate' },
  { ID: 'res-004', restrictionRef: 'RES-1004', name: 'Old Town Bridge load limit',    bridgeRef: 'BR-1012', bridge_ID: 1012, restrictionCategory: 'Load',   restrictionType: 'Load Limit',        restrictionValue: 15, restrictionUnit: 't',    restrictionStatus: 'Active', active: true, restrictionReason: 'Very poor condition — structural review pending', restrictionSeverity: 'Severe' },
  { ID: 'res-005', restrictionRef: 'RES-1005', name: 'Coral Coast width limit',       bridgeRef: 'BR-1011', bridge_ID: 1011, restrictionCategory: 'Width',  restrictionType: 'Width Limit',       restrictionValue: 3.5, restrictionUnit: 'm',   restrictionStatus: 'Active', active: true, restrictionReason: 'Corrosion to outer girders',            restrictionSeverity: 'Moderate' },
  { ID: 'res-006', restrictionRef: 'RES-1006', name: 'Goldfields viaduct axle limit', bridgeRef: 'BR-1004', bridge_ID: 1004, restrictionCategory: 'Load',   restrictionType: 'Axle Mass Limit',   restrictionValue: 20, restrictionUnit: 't',    restrictionStatus: 'Active', active: true, restrictionReason: 'Fatigue on steel members',              restrictionSeverity: 'Major' }
]
writeCsv('bridge.management-Restrictions.csv',
  ['ID','restrictionRef','name','bridgeRef','bridge_ID','restrictionCategory','restrictionType','restrictionValue','restrictionUnit','restrictionStatus','active','restrictionReason','restrictionSeverity'],
  restrictions)
