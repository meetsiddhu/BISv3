#!/usr/bin/env node
/**
 * Generates BMS-MassUpload-Complete.xlsx — a single workbook containing every
 * dataset the mass-upload UI supports: 15 lookup sheets, Bridges, Restrictions.
 *
 * Sheet names and column headers match mass-upload.js DATASETS exactly so that
 * the upload parser accepts the file without modification.
 *
 * Run from the project root:
 *   node scripts/generate-mass-upload-workbook.js
 */

'use strict'

const path = require('path')
const fs = require('fs')
const XLSX = require('xlsx')

const DATA_DIR = path.join(__dirname, '..', 'db', 'data')
const OUT_FILE = path.join(DATA_DIR, 'BMS-MassUpload-Complete.xlsx')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim()
  const lines = raw.split(/\r?\n/)
  if (!lines.length) return []
  // detect separator — prefer ; over ,
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const vals = line.split(sep).map((v) => v.trim())
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
    return obj
  })
}

function lookupRows(name) {
  const file = path.join(DATA_DIR, `bridge.management-${name}.csv`)
  const rows = parseCsv(file)
  // normalise to { code, name, descr }
  return rows.map((r) => [r.code ?? '', r.name ?? '', r.descr ?? ''])
}

function appendLookupSheet(wb, sheetName) {
  const data = [['code *', 'name', 'descr'], ...lookupRows(sheetName)]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), sheetName)
}

// ---------------------------------------------------------------------------
// Condition / posting status mapping (old CSV labels → ConditionStates codes)
// ---------------------------------------------------------------------------
const CONDITION_MAP = { GOOD: '1', FAIR: '2', POOR: '3', 'VERY POOR': '4', CRITICAL: '5', 'UNDER REVIEW': '3' }
const POSTING_MAP = { UNRESTRICTED: 'Unrestricted', RESTRICTED: 'Restricted', CLOSED: 'Closed', 'UNDER REVIEW': 'Under Review' }
const BOOL_MAP = { true: true, false: false, '1': true, '0': false, yes: true, no: false, TRUE: true, FALSE: false }

function mapBool(v) {
  if (v === '' || v == null) return ''
  return BOOL_MAP[v] ?? ''
}

function mapInt(v) {
  const n = parseInt(v, 10)
  return isNaN(n) ? '' : n
}

function mapDec(v) {
  const n = parseFloat(v)
  return isNaN(n) ? '' : n
}

// ---------------------------------------------------------------------------
// Build Bridges sheet rows from mass-upload-bridges-australia.csv
// ---------------------------------------------------------------------------
function buildBridgeRows() {
  const src = path.join(DATA_DIR, 'mass-upload-bridges-australia.csv')

  // The file uses comma as separator but values contain quoted commas.
  // Use XLSX's CSV parser to handle quoting correctly.
  const wb = XLSX.readFile(src, { type: 'file', raw: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })

  return raw.map((r) => {
    const condCode = CONDITION_MAP[String(r.condition ?? '').toUpperCase()] ?? String(r.conditionRating ?? '')
    const rating = mapInt(r.conditionRatingTfnsw || r.conditionRating)
    const posting = POSTING_MAP[String(r.postingStatus ?? '').toUpperCase()] ?? r.postingStatus ?? ''
    const assetClass = r.assetClass || 'Road Bridge'

    return [
      '',                                    // ID (empty = insert)
      '',                                    // title
      '',                                    // descr
      r.bridgeId,                            // bridgeId
      r.name,                                // bridgeName *
      assetClass,                            // assetClass
      r.route ?? '',                         // route
      r.routeNumber ?? '',                   // routeNumber
      r.state,                               // state *
      r.region ?? '',                        // region
      r.lga ?? '',                           // lga
      mapDec(r.latitude),                    // latitude *
      mapDec(r.longitude),                   // longitude *
      '',                                    // location
      r.assetOwner,                          // assetOwner *
      r.maintenanceAuthority ?? '',          // managingAuthority
      r.structureType ?? '',                 // structureType
      mapInt(r.yearBuilt),                   // yearBuilt
      r.designLoad ?? '',                    // designLoad
      r.designStandard ?? '',                // designStandard
      mapDec(r.clearanceHeightM),            // clearanceHeight
      mapDec(r.spanLengthM),                 // spanLength
      r.material ?? '',                      // material
      mapInt(r.numberOfSpans),               // spanCount
      mapDec(r.totalLengthM),                // totalLength
      '',                                    // deckWidth
      mapInt(r.numberOfLanes),               // numberOfLanes
      condCode,                              // condition
      rating,                                // conditionRating
      '',                                    // structuralAdequacyRating
      posting,                               // postingStatus
      '',                                    // conditionStandard
      r.seismicZone ?? '',                   // seismicZone
      '',                                    // asBuiltDrawingReference
      mapInt(r.floodImmunityAri),            // floodImmunityAriYears
      mapBool(r.floodImpacted),              // floodImpacted
      mapBool(r.highPriorityAsset),          // highPriorityAsset
      r.remarks ?? '',                       // remarks
      'Active',                              // status
      '',                                    // lastInspectionDate
      mapBool(r.nhvrRouteAssessed),          // nhvrAssessed
      '',                                    // nhvrAssessmentDate
      '',                                    // loadRating
      r.pbsApprovalClass ?? '',              // pbsApprovalClass
      r.importanceLevel ?? '',               // importanceLevel
      mapInt(r.aadt),                        // averageDailyTraffic
      mapDec(r.heavyVehiclePercentage),      // heavyVehiclePercent
      '',                                    // gazetteReference
      '',                                    // nhvrReferenceUrl
      mapBool(r.freightRoute),               // freightRoute
      mapBool(r.overMassRoute),              // overMassRoute
      mapBool(r.hmlApproved),               // hmlApproved
      mapBool(r.bdoubleApproved),            // bDoubleApproved
      r.dataSource ?? '',                    // dataSource
      r.sourceReferenceUrl ?? '',            // sourceReferenceUrl
      r.openDataReference ?? '',             // openDataReference
      r.bridgeId ?? '',                      // sourceRecordId
      '',                                    // restriction_ID
      r.geoJson ?? '',                       // geoJson
      '',                                    // stock
      '',                                    // price
      ''                                     // currency_code
    ]
  })
}

// ---------------------------------------------------------------------------
// Build Restrictions sheet — sample restrictions for well-known bridges
// ---------------------------------------------------------------------------
function buildRestrictionRows() {
  // [restrictionRef, bridgeRef, name, restrictionCategory, restrictionType,
  //  restrictionValue, restrictionUnit, restrictionStatus, appliesToVehicleClass,
  //  grossMassLimit, axleMassLimit, heightLimit, widthLimit, lengthLimit,
  //  speedLimit, permitRequired, escortRequired, temporary, active,
  //  effectiveFrom, effectiveTo, approvedBy, direction, enforcementAuthority,
  //  temporaryFrom, temporaryTo, temporaryReason, approvalReference,
  //  issuingAuthority, legalReference, remarks]
  const rows = [
    // BRG-NSW-003 Hampden Bridge — load and speed
    ['RST-NSW-001', 'BRG-NSW-003', '', 'Permanent', 'Mass Limit', '5', 't', 'Active', 'Heavy Vehicles', 5, '', '', '', '', '', true, false, false, true, '2020-01-01', '', 'TfNSW', 'Both Directions', 'Transport for NSW', '', '', '', '', 'Transport for NSW', '', 'Gross mass limit 5t. Heritage timber suspension bridge.'],
    ['RST-NSW-002', 'BRG-NSW-003', '', 'Permanent', 'Speed Restriction', '30', 'km/h', 'Active', 'All Vehicles', '', '', '', '', '', 30, false, false, false, true, '2020-01-01', '', 'TfNSW', 'Both Directions', 'Transport for NSW', '', '', '', '', 'Transport for NSW', '', 'Speed limit 30 km/h. One lane, traffic lights.'],
    // BRG-NSW-016 Nepean River Railway Bridge
    ['RST-NSW-003', 'BRG-NSW-016', '', 'Permanent', 'Mass Limit', '10', 't', 'Active', 'All Vehicles', 10, '', '', '', '', '', true, false, false, true, '2019-06-01', '', 'Sydney Trains', 'Both Directions', 'Sydney Trains', '', '', '', '', 'Sydney Trains', '', 'Gross mass limit 10t. Heritage wrought iron railway bridge.'],
    // BRG-NSW-017 Prince Alfred Bridge
    ['RST-NSW-004', 'BRG-NSW-017', '', 'Permanent', 'Mass Limit', '8', 't', 'Active', 'Heavy Vehicles', 8, '', '', '', '', '', true, false, false, true, '2018-03-01', '', 'TfNSW', 'Both Directions', 'Transport for NSW', '', '', '', '', 'Transport for NSW', '', 'Gross mass limit 8t. Heritage timber truss bridge 44 spans.'],
    // BRG-NSW-021 Maitland Swing Bridge
    ['RST-NSW-005', 'BRG-NSW-021', '', 'Permanent', 'Mass Limit', '5', 't', 'Active', 'All Vehicles', 5, '', '', '', '', '', true, false, false, true, '2021-01-01', '', 'TfNSW', 'Both Directions', 'Transport for NSW', '', '', '', '', 'Transport for NSW', '', 'Gross mass limit 5t. Scour monitoring ongoing.'],
    ['RST-NSW-006', 'BRG-NSW-021', '', 'Permanent', 'Speed Restriction', '20', 'km/h', 'Active', 'All Vehicles', '', '', '', '', '', 20, false, false, false, true, '2021-01-01', '', 'TfNSW', 'Both Directions', 'Transport for NSW', '', '', '', '', 'Transport for NSW', '', 'Speed limit 20 km/h. Single-lane bridge.'],
    // BRG-NSW-024 Darling River Bridge Wilcannia
    ['RST-NSW-007', 'BRG-NSW-024', '', 'Permanent', 'Access Restriction', '', 'approval', 'Active', 'Heavy Vehicles', '', '', '', '', '', '', true, false, false, true, '2022-01-01', '', 'TfNSW', 'Both Directions', 'Transport for NSW', '', '', '', '', 'Transport for NSW', '', 'Heavy vehicles prohibited. Heritage steel truss bridge.'],
    // BRG-VIC-004 McKillops Bridge
    ['RST-VIC-001', 'BRG-VIC-004', '', 'Permanent', 'Mass Limit', '5', 't', 'Active', 'Heavy Vehicles', 5, '', '', '', '', '', true, false, false, true, '2019-01-01', '', 'VicDoTP', 'Both Directions', 'Department of Transport and Planning VIC', '', '', '', '', 'Department of Transport and Planning VIC', '', 'Gross mass limit 5t. Remote heritage bridge over Snowy River.'],
    // BRG-QLD-001 Story Bridge
    ['RST-QLD-001', 'BRG-QLD-001', '', 'Permanent', 'Speed Restriction', '60', 'km/h', 'Active', 'All Vehicles', '', '', '', '', '', 60, false, false, false, true, '2015-07-01', '', 'BCC', 'Both Directions', 'Brisbane City Council', '', '', '', '', 'Brisbane City Council', '', 'Speed limit 60 km/h over heritage cantilever structure.'],
    ['RST-QLD-002', 'BRG-QLD-001', '', 'Permanent', 'Dimension Limit', '4.8', 'm', 'Active', 'All Vehicles', '', '', 4.8, '', '', '', false, false, false, true, '2015-07-01', '', 'BCC', 'Both Directions', 'Brisbane City Council', '', '', '', '', 'Brisbane City Council', '', 'Height clearance limit 4.8m.'],
    // BRG-TAS-001 Richmond Bridge
    ['RST-TAS-001', 'BRG-TAS-001', '', 'Permanent', 'Mass Limit', '15', 't', 'Active', 'Heavy Vehicles', 15, '', '', '', '', '', true, false, false, true, '2010-01-01', '', 'DSG Tasmania', 'Both Directions', 'Department of State Growth TAS', '', '', '', '', 'Department of State Growth TAS', '', 'Gross mass limit 15t. Heritage preservation. Oldest bridge in Australia carrying traffic.'],
    // BRG-TAS-004 Tasman Bridge
    ['RST-TAS-002', 'BRG-TAS-004', '', 'Temporary', 'Access Restriction', '', 'approval', 'Active', 'Oversize Overmass', '', '', '', '', '', '', true, true, true, true, '2024-01-01', '2025-12-31', 'DSG Tasmania', 'Both Directions', 'Department of State Growth TAS', '2024-01-01', '2025-12-31', 'Scour investigation and resilience upgrades in progress', '', 'Department of State Growth TAS', '', 'Oversize/overmass vehicles require permit during scour works.'],
    // BRG-WA-003 Fremantle Traffic Bridge
    ['RST-WA-001', 'BRG-WA-003', '', 'Permanent', 'Mass Limit', '8', 't', 'Active', 'Heavy Vehicles', 8, '', '', '', '', '', true, false, false, true, '2018-06-01', '', 'Main Roads WA', 'Both Directions', 'Main Roads WA', '', '', '', '', 'Main Roads WA', '', 'Gross mass limit 8t. Heritage truss bridge. Bypass bridge is primary route.'],
    // BRG-SA-002 Algebuckina Bridge
    ['RST-SA-001', 'BRG-SA-002', '', 'Permanent', 'Mass Limit', '5', 't', 'Active', 'All Vehicles', 5, '', '', '', '', '', true, false, false, true, '2016-01-01', '', 'DIT SA', 'Both Directions', 'Department for Infrastructure and Transport SA', '', '', '', '', 'Department for Infrastructure and Transport SA', '', 'Gross mass limit 5t. Heritage bridge on old Ghan railway route.'],
  ]

  return rows.map((r) => [
    '',         // ID
    '',         // parent_ID
    r[0],       // restrictionRef *
    r[1],       // bridgeRef
    '',         // bridge_ID
    r[2],       // name
    '',         // descr
    r[3],       // restrictionCategory *
    r[4],       // restrictionType *
    r[5],       // restrictionValue
    r[6],       // restrictionUnit
    r[7],       // restrictionStatus *
    r[8],       // appliesToVehicleClass
    r[9],       // grossMassLimit
    r[10],      // axleMassLimit
    r[11],      // heightLimit
    r[12],      // widthLimit
    r[13],      // lengthLimit
    r[14],      // speedLimit
    r[15],      // permitRequired
    r[16],      // escortRequired
    r[17],      // temporary
    r[18],      // active
    r[19],      // effectiveFrom
    r[20],      // effectiveTo
    r[21],      // approvedBy
    r[22],      // direction
    r[23],      // enforcementAuthority
    r[24],      // temporaryFrom
    r[25],      // temporaryTo
    r[26],      // temporaryReason
    r[27],      // approvalReference
    r[28],      // issuingAuthority
    r[29],      // legalReference
    r[30]       // remarks
  ])
}

// ---------------------------------------------------------------------------
// Column headers — must match BRIDGE_COLUMNS / RESTRICTION_COLUMNS in mass-upload.js
// Required fields marked with *
// ---------------------------------------------------------------------------
const BRIDGE_HEADERS = [
  'ID', 'title', 'descr', 'bridgeId', 'bridgeName *', 'assetClass', 'route', 'routeNumber',
  'state *', 'region', 'lga', 'latitude *', 'longitude *', 'location', 'assetOwner *',
  'managingAuthority', 'structureType', 'yearBuilt', 'designLoad', 'designStandard',
  'clearanceHeight', 'spanLength', 'material', 'spanCount', 'totalLength', 'deckWidth',
  'numberOfLanes', 'condition', 'conditionRating', 'structuralAdequacyRating', 'postingStatus',
  'conditionStandard', 'seismicZone', 'asBuiltDrawingReference',
  'floodImmunityAriYears', 'floodImpacted', 'highPriorityAsset', 'remarks', 'status',
  'lastInspectionDate', 'nhvrAssessed', 'nhvrAssessmentDate', 'loadRating',
  'pbsApprovalClass', 'importanceLevel', 'averageDailyTraffic', 'heavyVehiclePercent',
  'gazetteReference', 'nhvrReferenceUrl', 'freightRoute', 'overMassRoute', 'hmlApproved',
  'bDoubleApproved', 'dataSource', 'sourceReferenceUrl', 'openDataReference', 'sourceRecordId',
  'restriction_ID', 'geoJson', 'stock', 'price', 'currency_code'
]

const RESTRICTION_HEADERS = [
  'ID', 'parent_ID', 'restrictionRef *', 'bridgeRef', 'bridge_ID', 'name', 'descr',
  'restrictionCategory *', 'restrictionType *', 'restrictionValue', 'restrictionUnit',
  'restrictionStatus *', 'appliesToVehicleClass', 'grossMassLimit', 'axleMassLimit',
  'heightLimit', 'widthLimit', 'lengthLimit', 'speedLimit', 'permitRequired', 'escortRequired',
  'temporary', 'active', 'effectiveFrom', 'effectiveTo', 'approvedBy', 'direction',
  'enforcementAuthority', 'temporaryFrom', 'temporaryTo', 'temporaryReason',
  'approvalReference', 'issuingAuthority', 'legalReference', 'remarks'
]

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const wb = XLSX.utils.book_new()

  // Instructions sheet
  const instructions = [
    ['BMS Mass Upload Template'],
    [''],
    ['How to use this workbook'],
    ['1. This workbook contains ALL supported upload datasets in a single file.'],
    ['2. Upload it from the Mass Upload screen (select any dataset — the system processes every sheet).'],
    ['3. Keep every sheet name and header row exactly as shown.'],
    ['4. Columns marked with * are required — leave others blank if unknown.'],
    ['5. Lookup columns (condition, state, assetClass, etc.) must match codes in the corresponding sheets.'],
    ['6. Leave the ID column empty for new records; provide an integer to update existing ones.'],
    ['7. Boolean columns: use TRUE / FALSE (case insensitive).'],
    ['8. Date columns: use ISO format YYYY-MM-DD.'],
    [''],
    ['Lookup reference'],
    ['Sheet', 'Lookup column in Bridges', 'Lookup column in Restrictions'],
    ['AssetClasses', 'assetClass', ''],
    ['States', 'state', ''],
    ['Regions', 'region', ''],
    ['StructureTypes', 'structureType', ''],
    ['DesignLoads', 'designLoad', ''],
    ['PostingStatuses', 'postingStatus', ''],
    ['ConditionStates', 'condition', ''],
    ['PbsApprovalClasses', 'pbsApprovalClass', ''],
    ['RestrictionTypes', '', 'restrictionType'],
    ['RestrictionStatuses', '', 'restrictionStatus'],
    ['VehicleClasses', '', 'appliesToVehicleClass'],
    ['RestrictionCategories', '', 'restrictionCategory'],
    ['RestrictionUnits', '', 'restrictionUnit'],
    ['RestrictionDirections', '', 'direction'],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), 'Instructions')

  // All 15 lookup sheets
  const lookups = [
    'AssetClasses', 'States', 'Regions', 'StructureTypes', 'DesignLoads',
    'PostingStatuses', 'ConditionStates', 'PbsApprovalClasses',
    'RestrictionTypes', 'RestrictionStatuses', 'VehicleClasses',
    'RestrictionCategories', 'RestrictionUnits', 'RestrictionDirections'
  ]
  for (const name of lookups) {
    appendLookupSheet(wb, name)
    console.log(`  ✓ ${name}`)
  }

  // Bridges sheet
  console.log('  Building Bridges sheet…')
  const bridgeRows = buildBridgeRows()
  const bridgeSheet = XLSX.utils.aoa_to_sheet([BRIDGE_HEADERS, ...bridgeRows])
  bridgeSheet['!cols'] = BRIDGE_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }))
  XLSX.utils.book_append_sheet(wb, bridgeSheet, 'Bridges')
  console.log(`  ✓ Bridges (${bridgeRows.length} rows)`)

  // Restrictions sheet
  const restrictionRows = buildRestrictionRows()
  const restrictionSheet = XLSX.utils.aoa_to_sheet([RESTRICTION_HEADERS, ...restrictionRows])
  restrictionSheet['!cols'] = RESTRICTION_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }))
  XLSX.utils.book_append_sheet(wb, restrictionSheet, 'Restrictions')
  console.log(`  ✓ Restrictions (${restrictionRows.length} rows)`)

  XLSX.writeFile(wb, OUT_FILE)
  console.log(`\nWritten → ${OUT_FILE}`)
}

main()
