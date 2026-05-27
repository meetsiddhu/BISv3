#!/usr/bin/env node
'use strict'

const path = require('path')
const XLSX = require('xlsx')

const DATA_DIR = path.join(__dirname, '..', 'db', 'data')

// Exact BRIDGE_COLUMNS order from mass-upload.js
const BRIDGE_HEADERS = [
  'ID', 'title', 'descr', 'bridgeId', 'bridgeName', 'assetClass', 'route', 'routeNumber',
  'state', 'region', 'lga', 'latitude', 'longitude', 'location', 'assetOwner',
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

const CONDITION_MAP = {
  GOOD: '1', FAIR: '2', POOR: '3', 'VERY POOR': '4', CRITICAL: '5', 'UNDER REVIEW': '3'
}
const POSTING_MAP = {
  UNRESTRICTED: 'Unrestricted', RESTRICTED: 'Restricted',
  CLOSED: 'Closed', 'UNDER REVIEW': 'Under Review'
}

function v(x) { return (x === undefined || x === null || x === '') ? '' : x }
function mapBool(x) {
  if (x === true || x === 'true' || x === 'TRUE' || x === 1 || x === '1') return 'TRUE'
  if (x === false || x === 'false' || x === 'FALSE' || x === 0 || x === '0') return 'FALSE'
  return ''
}

// Handle both old column names (from generator) and new ones (if re-running on already-remapped CSV)
function src(r, ...keys) {
  for (const k of keys) { const val = r[k]; if (val !== undefined && val !== null && val !== '') return val }
  return ''
}

function mapImportanceLevel(raw) {
  // Old data used text; new schema is integer — clear if not numeric
  if (raw === '' || raw == null) return ''
  const n = parseInt(raw, 10)
  if (!isNaN(n)) return n
  // text values don't map to a defined integer scale — omit
  return ''
}

function mapRow(r) {
  const rawCondition = src(r, 'condition')
  const condKey = String(rawCondition).toUpperCase()
  const condCode = CONDITION_MAP[condKey] || v(r.conditionRatingTfnsw) || v(r.conditionRating) || ''
  const condRating = v(r.conditionRatingTfnsw) || v(r.conditionRating) || ''
  const rawPosting = src(r, 'postingStatus')
  const postKey = String(rawPosting).toUpperCase()
  const posting = POSTING_MAP[postKey] || rawPosting

  return [
    '',                                                   // ID
    '',                                                   // title
    '',                                                   // descr
    src(r, 'bridgeId'),                                   // bridgeId
    src(r, 'bridgeName', 'name'),                         // bridgeName  ← handles both old + remapped
    src(r, 'assetClass') || 'Road Bridge',                // assetClass
    src(r, 'route'),                                      // route
    src(r, 'routeNumber'),                                // routeNumber
    src(r, 'state'),                                      // state
    src(r, 'region'),                                     // region
    src(r, 'lga'),                                        // lga
    src(r, 'latitude'),                                   // latitude
    src(r, 'longitude'),                                  // longitude
    '',                                                   // location
    src(r, 'assetOwner'),                                 // assetOwner
    src(r, 'managingAuthority', 'maintenanceAuthority'),  // managingAuthority
    src(r, 'structureType'),                              // structureType
    src(r, 'yearBuilt'),                                  // yearBuilt
    src(r, 'designLoad'),                                 // designLoad
    '',                                                   // designStandard
    src(r, 'clearanceHeight', 'clearanceHeightM'),        // clearanceHeight
    src(r, 'spanLength', 'spanLengthM'),                  // spanLength
    src(r, 'material'),                                   // material
    src(r, 'spanCount', 'numberOfSpans'),                 // spanCount
    src(r, 'totalLength', 'totalLengthM'),                // totalLength
    src(r, 'deckWidth', 'deckWidthM'),                    // deckWidth
    src(r, 'numberOfLanes'),                              // numberOfLanes
    condCode,                                             // condition
    condRating,                                           // conditionRating
    '',                                                   // structuralAdequacyRating
    posting,                                              // postingStatus
    '',                                                   // conditionStandard
    src(r, 'seismicZone'),                                // seismicZone
    '',                                                   // asBuiltDrawingReference
    src(r, 'floodImmunityAriYears', 'floodImmunityAri'), // floodImmunityAriYears
    mapBool(src(r, 'floodImpacted')),                     // floodImpacted
    mapBool(src(r, 'highPriorityAsset')),                 // highPriorityAsset
    src(r, 'remarks'),                                    // remarks
    'Active',                                             // status
    '',                                                   // lastInspectionDate
    mapBool(src(r, 'nhvrAssessed', 'nhvrRouteAssessed')), // nhvrAssessed
    '',                                                   // nhvrAssessmentDate
    '',                                                   // loadRating
    src(r, 'pbsApprovalClass'),                           // pbsApprovalClass
    mapImportanceLevel(src(r, 'importanceLevel')),        // importanceLevel (integer only)
    src(r, 'averageDailyTraffic', 'aadt'),                // averageDailyTraffic
    src(r, 'heavyVehiclePercent', 'heavyVehiclePercentage'), // heavyVehiclePercent
    '',                                                   // gazetteReference
    '',                                                   // nhvrReferenceUrl
    mapBool(src(r, 'freightRoute')),                      // freightRoute
    mapBool(src(r, 'overMassRoute')),                     // overMassRoute
    mapBool(src(r, 'hmlApproved')),                       // hmlApproved
    mapBool(src(r, 'bDoubleApproved', 'bdoubleApproved')), // bDoubleApproved
    src(r, 'dataSource'),                                 // dataSource
    src(r, 'sourceReferenceUrl'),                         // sourceReferenceUrl
    src(r, 'openDataReference'),                          // openDataReference
    src(r, 'bridgeId'),                                   // sourceRecordId
    '',                                                   // restriction_ID
    src(r, 'geoJson'),                                    // geoJson
    '',                                                   // stock
    '',                                                   // price
    ''                                                    // currency_code
  ]
}

function readRows(srcFile) {
  const wb = XLSX.readFile(srcFile, { raw: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  // sheet_to_json uses the header row as keys; strip trailing * from key names
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
  if (!raw.length) return []
  const firstKey = Object.keys(raw[0])[0]
  if (!firstKey.includes('*')) return raw  // headers already clean
  // Remap keys: strip trailing * and whitespace
  return raw.map(row => {
    const clean = {}
    for (const [k, v] of Object.entries(row)) {
      clean[k.replace(/\s*\*\s*$/, '').trim()] = v
    }
    return clean
  })
}

function rebuildCsv(srcFile, destFile, label) {
  const rows = readRows(srcFile)
  const outWs = XLSX.utils.aoa_to_sheet([BRIDGE_HEADERS, ...rows.map(mapRow)])
  const csv = XLSX.utils.sheet_to_csv(outWs)
  require('fs').writeFileSync(destFile, csv, 'utf8')
  console.log(`  ✓ ${label}: ${rows.length} rows → ${destFile}`)
}

const os = require('os')

const WORKBOOK  = path.join(DATA_DIR, 'BMS-MassUpload-Complete.xlsx')  // source of truth for 56 real bridges
const AUSTRALIA = path.join(DATA_DIR, 'mass-upload-bridges-australia.csv')
const NSW_BULK  = path.join(DATA_DIR, 'mass-upload-bridges-nsw-bulk.csv')

function generateAndRebuild(destFile, count, label) {
  const tmp = path.join(os.tmpdir(), `bms-nsw-raw-${Date.now()}.csv`)
  const { execSync } = require('child_process')
  execSync(`node "${path.join(__dirname, 'generate-bulk-bridges.js')}" --count ${count} --out "${tmp}"`, { stdio: 'pipe' })
  rebuildCsv(tmp, destFile, label)
  require('fs').unlinkSync(tmp)
}

// Source australia bridges from the workbook (intact bridge names, headers have * stripped automatically)
function rebuildFromWorkbookSheet(srcXlsx, sheetName, destFile, label) {
  const wb = XLSX.readFile(srcXlsx)
  const ws = wb.Sheets[sheetName]
  const rows = readRows(srcXlsx)  // reuse readRows on xlsx; sheet_to_json picks first sheet
  // Manually read the correct sheet
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
  const clean = raw.map(row => {
    const r = {}
    for (const [k, v] of Object.entries(row)) r[k.replace(/\s*\*\s*$/, '').trim()] = v
    return r
  })
  const outWs = XLSX.utils.aoa_to_sheet([BRIDGE_HEADERS, ...clean.map(mapRow)])
  const csv = XLSX.utils.sheet_to_csv(outWs)
  require('fs').writeFileSync(destFile, csv, 'utf8')
  console.log(`  ✓ ${label}: ${clean.length} rows → ${destFile}`)
}

rebuildFromWorkbookSheet(WORKBOOK, 'Bridges', AUSTRALIA, 'bridges-australia (56 real, from workbook)')
generateAndRebuild(NSW_BULK, 5077, 'bridges-nsw-bulk (5,077 synthetic NSW)')

console.log('\nDone. Both CSVs now use exact BRIDGE_COLUMNS headers.')
