#!/usr/bin/env node
/*
 * Builds srv/demo-seed.data.json from the locally-computed demo dataset (bridges
 * with engine-computed BHI/BSI, their elements, restrictions, and the real
 * scoreFleet prioritisation runs). This JSON is loaded by srv/demo-seed.js at
 * server startup and inserted ONCE into an empty register — so the deployed app
 * (HANA) ships with working demo data WITHOUT polluting the committed CSV seed
 * (which would otherwise break test fixtures + reset business data on deploy).
 *
 * Re-run after regenerating the demo data + recomputing scores/runs locally.
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const DB = path.join(__dirname, '..', 'db.sqlite')
const OUT = path.join(__dirname, '..', 'srv', 'demo-seed.data.json')
const BOOL = new Set(['floodImpacted', 'active', 'likelihoodOverridden', 'restrictionFlag'])
const TS = '2026-06-15T00:00:00.000Z'

function q (sql) {
  const raw = execSync(`sqlite3 "${DB}" ".mode json" "${sql.replace(/"/g, '\\"')}"`, { maxBuffer: 64 * 1024 * 1024 }).toString().trim()
  const rows = raw ? JSON.parse(raw) : []
  return rows.map((r) => {
    for (const k of Object.keys(r)) if (BOOL.has(k) && (r[k] === 0 || r[k] === 1)) r[k] = !!r[k]
    return r
  })
}

const bridges = q("SELECT ID,bridgeId,bridgeName,assetClass,transportMode,state,region,lga,latitude,longitude,assetOwner,yearBuilt,material,structureType,conditionRating,structuralAdequacyRating,status,importanceLevel,averageDailyTraffic,heavyVehiclePercent,floodImpacted,seismicZone,mitigationCostAud,expectedValueAud,benefitCostRatio,bsiScore,bhiScore,bsiPriority FROM bridge_management_Bridges ORDER BY ID")
const elements = q("SELECT ID,bridge_ID,elementCode,elementType,conditionRating,totalQuantity,quantityUnit,conditionState1Qty FROM bridge_management_BridgeElements ORDER BY ID")
const restrictions = q("SELECT ID,restrictionRef,name,bridgeRef,bridge_ID,restrictionCategory,restrictionType,restrictionValue,restrictionUnit,restrictionStatus,active,restrictionReason,restrictionSeverity FROM bridge_management_Restrictions ORDER BY ID")
const runs = q(`SELECT ID,'${TS}' AS createdAt,createdBy,'${TS}' AS modifiedAt,modifiedBy,bridge_ID,bridgeRef,bridgeName,dimSafety,dimNetwork,dimFinancial,dimEnvironmental,dimReputational,likelihood,likelihoodDerived,likelihoodOverridden,likelihoodOverrideReason,strategy,restrictionFlag,criticality,tier,residual,riskN,critN,stratN,priorityScore,band,inputsAvailable,inputsTotal,conditionAsAtMonths,likelyFailureCostAud,mitigationCostAud,fleetRunId,fleetRank,userTypeBreakdown,runType,reviewStatus,includedWeight,totalWeight,configVersion,formulaVersion,paramSnapshot,rubricSnapshot,modelCode,modelVersion,weightSetHash,criterionBreakdown,assessedBy,'${TS}' AS assessedAt,supersededBy_ID,active FROM bridge_management_PrioritisationAssessment ORDER BY fleetRank`)

fs.writeFileSync(OUT, JSON.stringify({ bridges, elements, restrictions, runs }, null, 0) + '\n')
console.log(`wrote ${path.relative(path.join(__dirname, '..'), OUT)} — bridges=${bridges.length} elements=${elements.length} restrictions=${restrictions.length} runs=${runs.length}`)
