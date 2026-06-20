#!/usr/bin/env node
/*
 * Dumps the locally-loaded NSW open-data bridges + HV restrictions to
 * srv/demo-seed-nsw.data.json — inserted at startup by srv/demo-seed.js (seedNsw),
 * idempotent via the dataSource marker, so the deployed register shows real NSW
 * open data at scale alongside the 12 curated demo bridges.
 *
 * Re-run after reloading the NSW files locally.
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const DB = path.join(__dirname, '..', 'db.sqlite')
const OUT = path.join(__dirname, '..', 'srv', 'demo-seed-nsw.data.json')
const BOOL = new Set(['freightRoute', 'floodImpacted', 'active', 'highPriorityAsset'])

function q (sql) {
  const raw = execSync(`sqlite3 "${DB}" ".mode json" "${sql.replace(/"/g, '\\"')}"`, { maxBuffer: 256 * 1024 * 1024 }).toString().trim()
  const rows = raw ? JSON.parse(raw) : []
  return rows.map((r) => { for (const k of Object.keys(r)) { if (BOOL.has(k) && (r[k] === 0 || r[k] === 1)) r[k] = !!r[k] } return r })
}

const bridges = q(`SELECT ID,bridgeId,bridgeName,descr,assetClass,route,routeNumber,state,region,lga,latitude,longitude,
  location,assetOwner,managingAuthority,structureType,yearBuilt,material,totalLength,numberOfLanes,conditionRating,status,
  postingStatus,importanceLevel,loadRating,clearanceHeight,freightRoute,floodImpacted,dataSource,sourceReferenceUrl,
  openDataReference,sourceRecordId,remarks,geoJson
  FROM bridge_management_Bridges WHERE dataSource LIKE 'OpenStreetMap%' ORDER BY ID`)
const restrictions = q(`SELECT ID,restrictionRef,bridgeRef,bridge_ID,name,restrictionCategory,restrictionType,
  restrictionValue,restrictionUnit,restrictionStatus,grossMassLimit,axleMassLimit,heightLimit,active,
  enforcementAuthority,issuingAuthority,restrictionReason,restrictionSeverity,remarks
  FROM bridge_management_Restrictions WHERE restrictionRef LIKE 'HVR-%' ORDER BY restrictionRef`)

const ids = bridges.map((b) => b.ID)
const minId = Math.min(...ids); const maxId = Math.max(...ids)
if (minId <= 1012) { console.error(`ABORT: NSW bridge ID ${minId} collides with curated demo range 1001-1012`); process.exit(1) }

fs.writeFileSync(OUT, JSON.stringify({ marker: 'OpenStreetMap', bridges, restrictions }, null, 0) + '\n')
console.log(`wrote srv/demo-seed-nsw.data.json — bridges=${bridges.length} (ID ${minId}..${maxId}), HV restrictions=${restrictions.length}`)
console.log('bytes:', fs.statSync(OUT).size)
