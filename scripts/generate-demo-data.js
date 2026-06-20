'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Generates a ready-to-upload DEMO dataset for the Mass Upload tile.
//   demo-data/Bridges.csv                  — bridge records (one-sheet CSV load)
//   demo-data/Restrictions.csv             — restriction records (one-sheet CSV load)
//   demo-data/BridgeManagement-DemoData.xlsx       — DATA workbook (Bridges + Restrictions sheets → all-sheet load)
//   demo-data/BridgeManagement-AllowedValues.xlsx  — ALLOWED VALUES (lookup sheets), SEGREGATED from the data
// All codes are valid against the app's seeded lookups; required fields are populated, so
// every row passes validation. Re-uploading the same file UPDATES (matched by bridgeId / restrictionRef).
// ─────────────────────────────────────────────────────────────────────────────
const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '..', 'demo-data')
fs.mkdirSync(OUT, { recursive: true })

// Column order = the Mass Upload template header (the parser strips the trailing * on required cols).
const BRIDGE_COLS = ['ID', 'descr', 'bridgeId', 'bridgeName', 'assetClass', 'route', 'routeNumber', 'state', 'region', 'lga',
  'latitude', 'longitude', 'location', 'assetOwner', 'managingAuthority', 'structureType', 'yearBuilt', 'designLoad',
  'designStandard', 'clearanceHeight', 'spanLength', 'material', 'spanCount', 'totalLength', 'deckWidth', 'numberOfLanes',
  'condition', 'conditionRating', 'structuralAdequacyRating', 'postingStatus', 'conditionStandard', 'seismicZone',
  'asBuiltDrawingReference', 'floodImmunityAriYears', 'floodImpacted', 'highPriorityAsset', 'remarks', 'status',
  'lastInspectionDate', 'nhvrAssessed', 'nhvrAssessmentDate', 'loadRating', 'pbsApprovalClass', 'importanceLevel',
  'averageDailyTraffic', 'heavyVehiclePercent', 'gazetteReference', 'nhvrReferenceUrl', 'freightRoute', 'overMassRoute',
  'hmlApproved', 'bDoubleApproved', 'dataSource', 'sourceReferenceUrl', 'openDataReference', 'sourceRecordId', 'restriction_ID', 'geoJson']
const BRIDGE_REQ = new Set(['bridgeName', 'state', 'latitude', 'longitude', 'assetOwner'])

const RESTR_COLS = ['ID', 'parent_ID', 'restrictionRef', 'bridgeRef', 'bridge_ID', 'name', 'descr', 'restrictionCategory',
  'restrictionType', 'restrictionValue', 'restrictionUnit', 'restrictionStatus', 'appliesToVehicleClass', 'grossMassLimit',
  'axleMassLimit', 'heightLimit', 'widthLimit', 'lengthLimit', 'speedLimit', 'permitRequired', 'escortRequired', 'temporary',
  'active', 'effectiveFrom', 'effectiveTo', 'approvedBy', 'direction', 'enforcementAuthority', 'temporaryFrom', 'temporaryTo',
  'temporaryReason', 'approvalReference', 'issuingAuthority', 'legalReference', 'remarks', 'gazetteNumber', 'gazettePublicationDate',
  'gazetteExpiryDate', 'reviewDueDate', 'approvalDate', 'restrictionReason', 'detourRoute', 'conditionTrigger', 'pbsClassApplicable',
  'grossCombinationLimit', 'tandemAxleLimit', 'triAxleLimit', 'steerAxleLimit', 'pilotVehicleCount', 'signageRequired',
  'restrictionSeverity', 'laneAvailability', 'lanesOpen', 'lanesTotal', 'laneWidthLimit']
const RESTR_REQ = new Set(['restrictionRef', 'restrictionCategory', 'restrictionType', 'restrictionStatus'])

// ── Demo bridges (fictional names + plausible AU coordinates; all valid lookup codes) ──
const bridges = [
  { bridgeId: 'DEMO-BRG-001', bridgeName: 'Riverside Crossing', assetClass: 'Road Bridge', route: 'Pacific Link', state: 'NSW', region: 'Sydney Metropolitan', lga: 'Parramatta', latitude: -33.8136, longitude: 151.0034, location: 'Parramatta River', assetOwner: 'Demo Roads Authority', structureType: 'Beam Bridge', yearBuilt: 1987, designLoad: 'T44', spanCount: 4, totalLength: 120, deckWidth: 14.5, numberOfLanes: 4, condition: 'Good', conditionRating: 8, postingStatus: 'Unrestricted', pbsApprovalClass: 'General Access', loadRating: 1.0, averageDailyTraffic: 28000, freightRoute: true, hmlApproved: true },
  { bridgeId: 'DEMO-BRG-002', bridgeName: 'Hartley Creek Bridge', assetClass: 'Road Bridge', route: 'Mountain Highway', state: 'NSW', region: 'Regional NSW', lga: 'Lithgow', latitude: -33.5419, longitude: 150.1551, location: 'Hartley Creek', assetOwner: 'Demo Roads Authority', structureType: 'Arch Bridge', yearBuilt: 1965, designLoad: 'A160', spanCount: 2, totalLength: 68, deckWidth: 9.2, numberOfLanes: 2, condition: 'Fair', conditionRating: 6, postingStatus: 'Restricted', pbsApprovalClass: 'Level 1', loadRating: 0.85, averageDailyTraffic: 4200, freightRoute: true },
  { bridgeId: 'DEMO-BRG-003', bridgeName: 'Yarra Boulevard Overpass', assetClass: 'Road Bridge', route: 'Eastern Freeway', state: 'VIC', region: 'Greater Melbourne', lga: 'Boroondara', latitude: -37.7985, longitude: 145.0356, location: 'Yarra River', assetOwner: 'Demo State Transport', structureType: 'Box Girder', yearBuilt: 1995, designLoad: 'SM1600', spanCount: 3, totalLength: 145, deckWidth: 22, numberOfLanes: 6, condition: 'Good', conditionRating: 9, postingStatus: 'Unrestricted', pbsApprovalClass: 'Level 2', loadRating: 1.0, averageDailyTraffic: 65000, freightRoute: true, hmlApproved: true, bDoubleApproved: true },
  { bridgeId: 'DEMO-BRG-004', bridgeName: 'Goldfields Rail Viaduct', assetClass: 'Rail Bridge', route: 'Western Rail Line', state: 'VIC', region: 'Regional Victoria', lga: 'Ballarat', latitude: -37.5622, longitude: 143.8503, location: 'Leigh River', assetOwner: 'Demo Rail Network', structureType: 'Arch Bridge', yearBuilt: 1928, designLoad: 'CooperE', spanCount: 7, totalLength: 210, condition: 'Poor', conditionRating: 4, postingStatus: 'Restricted', loadRating: 0.7 },
  { bridgeId: 'DEMO-BRG-005', bridgeName: 'Coral Bay Footbridge', assetClass: 'Pedestrian Bridge', state: 'QLD', region: 'South East Queensland', lga: 'Gold Coast', latitude: -28.0167, longitude: 153.4000, location: 'Coral Canal', assetOwner: 'Demo City Council', structureType: 'Cable-stayed', yearBuilt: 2012, designLoad: 'W80', spanCount: 1, totalLength: 45, deckWidth: 4, condition: 'Good', conditionRating: 9, postingStatus: 'Unrestricted' },
  { bridgeId: 'DEMO-BRG-006', bridgeName: 'Brisbane Reach Bridge', assetClass: 'Road Bridge', route: 'River Expressway', state: 'QLD', region: 'South East Queensland', lga: 'Brisbane', latitude: -27.4810, longitude: 153.0090, location: 'Brisbane River', assetOwner: 'Demo State Transport', structureType: 'Cantilever', yearBuilt: 1978, designLoad: 'T44', spanCount: 5, totalLength: 320, deckWidth: 18, numberOfLanes: 4, condition: 'Fair', conditionRating: 6, postingStatus: 'Under Review', pbsApprovalClass: 'Level 2', loadRating: 0.9, averageDailyTraffic: 41000, freightRoute: true },
  { bridgeId: 'DEMO-BRG-007', bridgeName: 'Torrens Weir Bridge', assetClass: 'Shared Path Bridge', state: 'SA', region: 'Regional NSW', lga: 'Adelaide', latitude: -34.9136, longitude: 138.5990, location: 'River Torrens', assetOwner: 'Demo City Council', structureType: 'Beam Bridge', yearBuilt: 2003, designLoad: 'W80', spanCount: 2, totalLength: 60, deckWidth: 5, condition: 'Good', conditionRating: 8, postingStatus: 'Unrestricted' },
  { bridgeId: 'DEMO-BRG-008', bridgeName: 'Swan Estuary Bridge', assetClass: 'Road Bridge', route: 'Coastal Route', state: 'WA', region: 'Regional Victoria', lga: 'Perth', latitude: -31.9740, longitude: 115.8400, location: 'Swan River', assetOwner: 'Demo Roads Authority', structureType: 'Box Girder', yearBuilt: 2001, designLoad: 'SM1600', spanCount: 4, totalLength: 180, deckWidth: 20, numberOfLanes: 4, condition: 'Good', conditionRating: 8, postingStatus: 'Unrestricted', pbsApprovalClass: 'Level 3', loadRating: 1.0, averageDailyTraffic: 33000, freightRoute: true, hmlApproved: true, bDoubleApproved: true },
  { bridgeId: 'DEMO-BRG-009', bridgeName: 'Derwent Punt Bridge', assetClass: 'Road Bridge', route: 'Southern Outlet', state: 'TAS', region: 'Hobart Region', lga: 'Hobart', latitude: -42.8821, longitude: 147.3272, location: 'Derwent River', assetOwner: 'Demo State Transport', structureType: 'Beam Bridge', yearBuilt: 1972, designLoad: 'T44', spanCount: 6, totalLength: 240, deckWidth: 16, numberOfLanes: 4, condition: 'Very Poor', conditionRating: 3, postingStatus: 'Restricted', loadRating: 0.6, averageDailyTraffic: 18000 },
  { bridgeId: 'DEMO-BRG-010', bridgeName: 'Top End Floodway Bridge', assetClass: 'Road Bridge', route: 'Outback Highway', state: 'NT', region: 'Regional NSW', lga: 'Darwin', latitude: -12.4634, longitude: 130.8456, location: 'Elizabeth River', assetOwner: 'Demo Roads Authority', structureType: 'Beam Bridge', yearBuilt: 1989, designLoad: 'A160', spanCount: 3, totalLength: 95, deckWidth: 8.5, numberOfLanes: 2, condition: 'Fair', conditionRating: 6, postingStatus: 'Unrestricted', floodImpacted: true, floodImmunityAriYears: 20, freightRoute: true },
  { bridgeId: 'DEMO-BRG-011', bridgeName: 'Capital Lake Bridge', assetClass: 'Road Bridge', route: 'Lakeside Drive', state: 'ACT', region: 'Sydney Metropolitan', lga: 'Canberra', latitude: -35.2930, longitude: 149.1240, location: 'Lake Burley Griffin', assetOwner: 'Demo City Council', structureType: 'Box Girder', yearBuilt: 1998, designLoad: 'SM1600', spanCount: 3, totalLength: 130, deckWidth: 19, numberOfLanes: 4, condition: 'Good', conditionRating: 9, postingStatus: 'Unrestricted', pbsApprovalClass: 'Level 2', averageDailyTraffic: 52000 },
  { bridgeId: 'DEMO-BRG-012', bridgeName: 'Old Quarry Rail Bridge', assetClass: 'Rail Bridge', route: 'Freight Spur', state: 'NSW', region: 'Regional NSW', lga: 'Newcastle', latitude: -32.9283, longitude: 151.7817, location: 'Hunter River', assetOwner: 'Demo Rail Network', structureType: 'Cantilever', yearBuilt: 1955, designLoad: 'UIC60', spanCount: 4, totalLength: 160, condition: 'Critical', conditionRating: 2, postingStatus: 'Closed', loadRating: 0.4 },
  { bridgeId: 'DEMO-BRG-013', bridgeName: 'Marina Approach Bridge', assetClass: 'Road Bridge', route: 'Harbour Link', state: 'NSW', region: 'Sydney Metropolitan', lga: 'Sydney', latitude: -33.8568, longitude: 151.2153, location: 'Sydney Harbour foreshore', assetOwner: 'Demo State Transport', structureType: 'Arch Bridge', yearBuilt: 2008, designLoad: 'SM1600', spanCount: 2, totalLength: 110, deckWidth: 21, numberOfLanes: 4, condition: 'Good', conditionRating: 9, postingStatus: 'Unrestricted', pbsApprovalClass: 'Level 3', averageDailyTraffic: 47000, freightRoute: true, bDoubleApproved: true },
  { bridgeId: 'DEMO-BRG-014', bridgeName: 'Wheatbelt Grain Bridge', assetClass: 'Road Bridge', route: 'Grain Route', state: 'WA', region: 'Regional Victoria', lga: 'Northam', latitude: -31.6530, longitude: 116.6720, location: 'Avon River', assetOwner: 'Demo Roads Authority', structureType: 'Beam Bridge', yearBuilt: 1969, designLoad: 'A160', spanCount: 3, totalLength: 78, deckWidth: 7.8, numberOfLanes: 2, condition: 'Poor', conditionRating: 4, postingStatus: 'Restricted', loadRating: 0.75, overMassRoute: true },
  { bridgeId: 'DEMO-BRG-015', bridgeName: 'Sunshine Coast Boardwalk Bridge', assetClass: 'Pedestrian Bridge', state: 'QLD', region: 'South East Queensland', lga: 'Sunshine Coast', latitude: -26.6500, longitude: 153.0670, location: 'Maroochy River', assetOwner: 'Demo City Council', structureType: 'Cable-stayed', yearBuilt: 2016, designLoad: 'W80', spanCount: 1, totalLength: 38, deckWidth: 3.5, condition: 'Good', conditionRating: 10, postingStatus: 'Unrestricted' }
]

// ── Demo restrictions (linked to the bridges above via bridgeRef = bridgeId) ──
const restrictions = [
  { restrictionRef: 'DEMO-RES-001', bridgeRef: 'DEMO-BRG-002', name: 'Hartley Creek load limit', restrictionCategory: 'Permanent', restrictionType: 'Load Limit', restrictionValue: '42', restrictionUnit: 't', restrictionStatus: 'Active', appliesToVehicleClass: 'Heavy Vehicles', grossMassLimit: 42, permitRequired: true, direction: 'Both Directions', restrictionSeverity: 'Major', enforcementAuthority: 'Demo Roads Authority' },
  { restrictionRef: 'DEMO-RES-002', bridgeRef: 'DEMO-BRG-004', name: 'Goldfields viaduct speed limit', restrictionCategory: 'Permanent', restrictionType: 'Speed Restriction', restrictionValue: '25', restrictionUnit: 'km/h', restrictionStatus: 'Active', appliesToVehicleClass: 'All Vehicles', speedLimit: 25, direction: 'Both Directions', restrictionSeverity: 'Moderate' },
  { restrictionRef: 'DEMO-RES-003', bridgeRef: 'DEMO-BRG-006', name: 'Brisbane Reach height limit', restrictionCategory: 'Permanent', restrictionType: 'Height Limit', restrictionValue: '4.6', restrictionUnit: 'm', restrictionStatus: 'Active', appliesToVehicleClass: 'Oversize Overmass', heightLimit: 4.6, permitRequired: true, direction: 'Northbound', restrictionSeverity: 'Major' },
  { restrictionRef: 'DEMO-RES-004', bridgeRef: 'DEMO-BRG-009', name: 'Derwent Punt mass limit', restrictionCategory: 'Permanent', restrictionType: 'Mass Limit', restrictionValue: '30', restrictionUnit: 't', restrictionStatus: 'Active', appliesToVehicleClass: 'Heavy Vehicles', grossMassLimit: 30, direction: 'Both Directions', restrictionSeverity: 'Major', enforcementAuthority: 'Demo State Transport' },
  { restrictionRef: 'DEMO-RES-005', bridgeRef: 'DEMO-BRG-012', name: 'Old Quarry full closure', restrictionCategory: 'Permanent', restrictionType: 'Full Closure', restrictionStatus: 'Active', appliesToVehicleClass: 'All Vehicles', restrictionSeverity: 'Critical', laneAvailability: 'CLOSED', direction: 'Both Directions', restrictionReason: 'Critical structural condition — awaiting replacement' },
  { restrictionRef: 'DEMO-RES-006', bridgeRef: 'DEMO-BRG-014', name: 'Wheatbelt width limit', restrictionCategory: 'Conditional', restrictionType: 'Width Limit', restrictionValue: '3.5', restrictionUnit: 'm', restrictionStatus: 'Active', appliesToVehicleClass: 'Oversize Overmass', widthLimit: 3.5, permitRequired: true, escortRequired: true, direction: 'Both Directions', restrictionSeverity: 'Moderate' },
  { restrictionRef: 'DEMO-RES-007', bridgeRef: 'DEMO-BRG-002', name: 'Hartley Creek seasonal flood closure', restrictionCategory: 'Seasonal', restrictionType: 'Temporary Closure', restrictionStatus: 'Draft', appliesToVehicleClass: 'All Vehicles', temporary: true, restrictionSeverity: 'Major', restrictionReason: 'Wet-season flood risk', direction: 'Both Directions' },
  { restrictionRef: 'DEMO-RES-008', bridgeRef: 'DEMO-BRG-006', name: 'Brisbane Reach lane restriction', restrictionCategory: 'Temporary', restrictionType: 'Lane Restriction', restrictionStatus: 'Suspended', appliesToVehicleClass: 'All Vehicles', laneAvailability: 'ONE_OF_TWO', lanesOpen: 1, lanesTotal: 2, restrictionSeverity: 'Minor', direction: 'Both Directions' }
]

function headerRow (cols, req) { return cols.map((c) => (req.has(c) ? c + '*' : c)) }
function dataRows (cols, items) { return items.map((it) => cols.map((c) => (it[c] === undefined || it[c] === null ? '' : it[c]))) }
function csvCell (v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
function toCsv (cols, req, items) { return [headerRow(cols, req), ...dataRows(cols, items)].map((r) => r.map(csvCell).join(',')).join('\n') + '\n' }
function sheet (cols, req, items) { return XLSX.utils.aoa_to_sheet([headerRow(cols, req), ...dataRows(cols, items)]) }

// 1) Segregated CSVs (one-sheet loads)
fs.writeFileSync(path.join(OUT, 'Bridges.csv'), toCsv(BRIDGE_COLS, BRIDGE_REQ, bridges))
fs.writeFileSync(path.join(OUT, 'Restrictions.csv'), toCsv(RESTR_COLS, RESTR_REQ, restrictions))

// 2) DATA workbook (Bridges + Restrictions sheets → load all sheets at once)
const dataWb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(dataWb, sheet(BRIDGE_COLS, BRIDGE_REQ, bridges), 'Bridges')
XLSX.utils.book_append_sheet(dataWb, sheet(RESTR_COLS, RESTR_REQ, restrictions), 'Restrictions')
XLSX.writeFile(dataWb, path.join(OUT, 'BridgeManagement-DemoData.xlsx'))

// 3) ALLOWED VALUES workbook (lookup sheets) — segregated from the data, valid codes for reference/seeding
const { FALLBACK_LOOKUP_DATA } = require('../srv/mass-upload')
const LOOKUP_SHEETS = ['AssetClasses', 'States', 'Regions', 'StructureTypes', 'DesignLoads', 'PostingStatuses',
  'ConditionStates', 'PbsApprovalClasses', 'RestrictionTypes', 'RestrictionStatuses', 'RestrictionCategories',
  'RestrictionUnits', 'VehicleClasses', 'RestrictionDirections']
const lookupWb = XLSX.utils.book_new()
for (const name of LOOKUP_SHEETS) {
  const rows = FALLBACK_LOOKUP_DATA.get(name) || []
  const aoa = [['code', 'name', 'descr'], ...rows.map((r) => [r.code, r.name || '', r.descr || ''])]
  XLSX.utils.book_append_sheet(lookupWb, XLSX.utils.aoa_to_sheet(aoa), name.slice(0, 31))
}
XLSX.writeFile(lookupWb, path.join(OUT, 'BridgeManagement-AllowedValues.xlsx'))

console.log('Wrote demo-data/:')
console.log('  Bridges.csv                          ', bridges.length, 'bridges')
console.log('  Restrictions.csv                     ', restrictions.length, 'restrictions')
console.log('  BridgeManagement-DemoData.xlsx        (Bridges + Restrictions sheets)')
console.log('  BridgeManagement-AllowedValues.xlsx   (', LOOKUP_SHEETS.length, 'lookup sheets — allowed values)')
