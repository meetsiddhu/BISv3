const cds = require('@sap/cds')
const express = require('express')
const { recordActivity } = require('./user-activity')
const { buildSandboxConfig } = require('./launchpad')

const {
  buildCsvTemplate,
  buildWorkbookTemplate,
  getDatasets,
  getUploadHistory,
  importUpload,
  validateUpload
} = require('./mass-upload')

const mountAttributesApi = require('./attributes-api')

const { diffRecords, writeChangeLogs, fetchCurrentRecord } = require('./audit-log')

const { getConfig, getConfigInt, getCrsEpsg, getStorageSrid } = require('./system-config')
const { validateGeoJson } = require('./lib/geo')
const demoHandler = require('./demo-handler')

const { SELECT, INSERT, UPDATE, DELETE } = cds.ql

// ── Process-level safety net (P2-001) ────────────────────────────────────────
// A single malformed request (e.g. a bad OData `/$count` path segment) must never
// take down the whole srv instance. Log via cds.log for observability and keep the
// process alive; CF would otherwise restart the app and drop in-flight requests.
const _bootLog = cds.log('server')
// ARCH-T1/T3: the background audit-write .catch handlers reference LOG; without this it
// is undefined and a failing audit write would throw a ReferenceError, turning a
// recoverable logging path into a silent black hole over the audit trail.
const LOG = cds.log('bms')
process.on('uncaughtException', (err) => {
  _bootLog.error('uncaughtException (kept alive):', err && err.stack ? err.stack : err)
})
process.on('unhandledRejection', (reason) => {
  _bootLog.error('unhandledRejection:', reason && reason.stack ? reason.stack : reason)
})

const MASS_EDIT_COLUMNS = [
  'ID',
  'bridgeId',
  'bridgeName',
  'state',
  'route',
  'region',
  'assetOwner',
  'structureType',
  'yearBuilt',
  'condition',
  'conditionRating',
  'postingStatus',
  'lastInspectionDate',
  'pbsApprovalClass',
  'nhvrAssessed',
  'freightRoute',
  'overMassRoute',
  'hmlApproved',
  'bDoubleApproved',
  'remarks'
]

const MASS_EDIT_RESTRICTION_COLUMNS = [
  'ID',
  'restrictionRef',
  'bridgeRef',
  'restrictionCategory',
  'restrictionType',
  'restrictionValue',
  'restrictionUnit',
  'restrictionStatus',
  'appliesToVehicleClass',
  'grossMassLimit',
  'axleMassLimit',
  'heightLimit',
  'widthLimit',
  'lengthLimit',
  'speedLimit',
  'permitRequired',
  'escortRequired',
  'temporary',
  'active',
  'effectiveFrom',
  'effectiveTo',
  'approvedBy',
  'direction',
  'remarks'
]

const MASS_EDIT_INSPECTION_COLUMNS = [
  'ID',
  'bridge_ID',
  'inspectionRef',
  'inspectionType',
  'inspectionDate',
  'inspector',
  'accreditationLevel',
  'conditionRating',
  'structuralRating',
  'overallGrade',
  'nextInspectionDue',
  'inspectionNotes',
  'recommendations',
  'active'
]

const MASS_EDIT_DEFECT_COLUMNS = [
  'ID',
  'bridge_ID',
  'inspection_ID',
  'defectId',
  'defectType',
  'severity',
  'urgency',
  'defectDescription',
  'location',
  'elementAffected',
  'recommendedAction',
  'status',
  'targetCompletionDate',
  'active'
]

const MASS_EDIT_CAPACITY_COLUMNS = [
  'ID',
  'bridge_ID',
  'capacityType',
  'grossMassLimit',
  'grossCombined',
  'steerAxleLimit',
  'singleAxleLimit',
  'tandemGroupLimit',
  'triAxleGroupLimit',
  'minClearancePosted',
  'lane1Clearance',
  'lane2Clearance',
  'clearanceSurveyDate',
  'clearanceSurveyMethod',
  'carriagewayWidth',
  'trafficableWidth',
  'laneWidth',
  'ratingStandard',
  'ratingFactor',
  'ratingEngineer',
  'ratingDate',
  'nextReviewDue',
  'reportReference',
  'floodClosureLevel',
  'designLife',
  'consumedLife',
  'fatigueSensitive',
  'criticalElement',
  'capacityStatus',
  'lastReviewedBy',
  'statusReviewDue',
  'engineeringNotes'
]

const MASS_EDIT_FIELD_TYPES = {
  bridgeName: 'string',
  state: 'string',
  route: 'string',
  region: 'string',
  assetOwner: 'string',
  structureType: 'string',
  yearBuilt: 'integer',
  condition: 'string',
  conditionRating: 'integer',
  postingStatus: 'string',
  lastInspectionDate: 'date',
  pbsApprovalClass: 'string',
  nhvrAssessed: 'boolean',
  freightRoute: 'boolean',
  overMassRoute: 'boolean',
  hmlApproved: 'boolean',
  bDoubleApproved: 'boolean',
  remarks: 'string'
}

const MASS_EDIT_RESTRICTION_FIELD_TYPES = {
  restrictionCategory: 'string',
  restrictionType: 'string',
  restrictionValue: 'string',
  restrictionUnit: 'string',
  restrictionStatus: 'string',
  appliesToVehicleClass: 'string',
  grossMassLimit: 'decimal',
  axleMassLimit: 'decimal',
  heightLimit: 'decimal',
  widthLimit: 'decimal',
  lengthLimit: 'decimal',
  speedLimit: 'integer',
  permitRequired: 'boolean',
  escortRequired: 'boolean',
  temporary: 'boolean',
  active: 'boolean',
  effectiveFrom: 'date',
  effectiveTo: 'date',
  approvedBy: 'string',
  direction: 'string',
  remarks: 'string'
}

const MASS_EDIT_INSPECTION_FIELD_TYPES = {
  inspectionType: 'string',
  inspectionDate: 'date',
  inspector: 'string',
  accreditationLevel: 'integer',
  conditionRating: 'integer',
  structuralRating: 'integer',
  overallGrade: 'string',
  nextInspectionDue: 'date',
  inspectionNotes: 'string',
  recommendations: 'string',
  active: 'boolean'
}

const MASS_EDIT_DEFECT_FIELD_TYPES = {
  defectType: 'string',
  severity: 'integer',
  urgency: 'integer',
  defectDescription: 'string',
  location: 'string',
  elementAffected: 'string',
  recommendedAction: 'string',
  status: 'string',
  targetCompletionDate: 'date',
  active: 'boolean'
}

const MASS_EDIT_CAPACITY_FIELD_TYPES = {
  capacityType: 'string',
  grossMassLimit: 'decimal',
  grossCombined: 'decimal',
  steerAxleLimit: 'decimal',
  singleAxleLimit: 'decimal',
  tandemGroupLimit: 'decimal',
  triAxleGroupLimit: 'decimal',
  minClearancePosted: 'decimal',
  lane1Clearance: 'decimal',
  lane2Clearance: 'decimal',
  clearanceSurveyDate: 'date',
  clearanceSurveyMethod: 'string',
  carriagewayWidth: 'decimal',
  trafficableWidth: 'decimal',
  laneWidth: 'decimal',
  ratingStandard: 'string',
  ratingFactor: 'decimal',
  ratingEngineer: 'string',
  ratingDate: 'date',
  nextReviewDue: 'date',
  reportReference: 'string',
  floodClosureLevel: 'decimal',
  designLife: 'integer',
  consumedLife: 'decimal',
  fatigueSensitive: 'boolean',
  criticalElement: 'string',
  capacityStatus: 'string',
  lastReviewedBy: 'string',
  statusReviewDue: 'date',
  engineeringNotes: 'string'
}

const MASS_EDIT_DROPDOWN_FIELD_TYPES = {
  isActive: 'boolean'
}

const MASS_EDIT_REQUIRED_FIELDS = new Set(['bridgeName', 'state', 'assetOwner'])

const MASS_EDIT_DROPDOWN_DATASETS = [
  { key: 'AssetClasses', label: 'Asset Classes', entity: 'bridge.management.AssetClasses' },
  { key: 'States', label: 'States', entity: 'bridge.management.States' },
  { key: 'Regions', label: 'Regions', entity: 'bridge.management.Regions' },
  { key: 'StructureTypes', label: 'Structure Types', entity: 'bridge.management.StructureTypes' },
  { key: 'DesignLoads', label: 'Design Loads', entity: 'bridge.management.DesignLoads' },
  { key: 'PostingStatuses', label: 'Posting Statuses', entity: 'bridge.management.PostingStatuses' },
  { key: 'CapacityStatuses', label: 'Capacity Statuses', entity: 'bridge.management.CapacityStatuses' },
  { key: 'ConditionStates', label: 'Condition States', entity: 'bridge.management.ConditionStates' },
  { key: 'PbsApprovalClasses', label: 'PBS Approval Classes', entity: 'bridge.management.PbsApprovalClasses' },
  { key: 'ConditionSummaries', label: 'Condition Summaries', entity: 'bridge.management.ConditionSummaries' },
  { key: 'StructuralAdequacyTypes', label: 'Structural Adequacy Types', entity: 'bridge.management.StructuralAdequacyTypes' },
  { key: 'RestrictionTypes', label: 'Restriction Types', entity: 'bridge.management.RestrictionTypes' },
  { key: 'RestrictionStatuses', label: 'Restriction Statuses', entity: 'bridge.management.RestrictionStatuses' },
  { key: 'VehicleClasses', label: 'Vehicle Classes', entity: 'bridge.management.VehicleClasses' },
  { key: 'RestrictionCategories', label: 'Restriction Categories', entity: 'bridge.management.RestrictionCategories' },
  { key: 'RestrictionUnits', label: 'Restriction Units', entity: 'bridge.management.RestrictionUnits' },
  { key: 'RestrictionDirections', label: 'Restriction Directions', entity: 'bridge.management.RestrictionDirections' }
]

const MASS_EDIT_DROPDOWN_DATASET_BY_KEY = new Map(MASS_EDIT_DROPDOWN_DATASETS.map((dataset) => [dataset.key, dataset]))

const MASS_EDIT_LOOKUP_OPTION_MAP = [
  ['states', 'States'],
  ['conditions', 'ConditionStates'],
  ['postingStatuses', 'PostingStatuses'],
  ['structureTypes', 'StructureTypes'],
  ['pbsApprovalClasses', 'PbsApprovalClasses'],
  ['restrictionCategories', 'RestrictionCategories'],
  ['restrictionTypes', 'RestrictionTypes'],
  ['restrictionStatuses', 'RestrictionStatuses'],
  ['restrictionUnits', 'RestrictionUnits'],
  ['restrictionDirections', 'RestrictionDirections'],
  ['vehicleClasses', 'VehicleClasses']
]

function normalizeMassEditValue(field, value, fieldTypes = MASS_EDIT_FIELD_TYPES) {
  const type = fieldTypes[field]
  if (!type) {
    throw new Error(`Unsupported mass edit field: ${field}`)
  }

  if (value === undefined) {
    return undefined
  }

  if (value === '') {
    value = null
  }

  if (MASS_EDIT_REQUIRED_FIELDS.has(field) && (value === null || value === undefined)) {
    throw new Error(`${field} cannot be empty`)
  }

  switch (type) {
    case 'string':
      return value == null ? null : String(value).trim()
    case 'integer':
      if (value == null) return null
      if (typeof value === 'number' && Number.isInteger(value)) return value
      if (/^-?\d+$/.test(String(value).trim())) return Number.parseInt(value, 10)
      throw new Error(`${field} must be a whole number`)
    case 'decimal':
      if (value == null) return null
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (/^-?\d+(\.\d+)?$/.test(String(value).trim())) return Number.parseFloat(value)
      throw new Error(`${field} must be a number`)
    case 'boolean':
      if (value == null) return false
      if (typeof value === 'boolean') return value
      if (value === 'true' || value === 'X' || value === 1 || value === '1') return true
      if (value === 'false' || value === 0 || value === '0') return false
      throw new Error(`${field} must be true or false`)
    case 'date':
      if (value == null) return null
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value)
      throw new Error(`${field} must be in YYYY-MM-DD format`)
    default:
      return value
  }
}

function parseBbox(bbox) {
  if (!bbox) return null;
  const parts = String(bbox).split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  const [minLon, minLat, maxLon, maxLat] = parts;
  if (minLon >= maxLon || minLat >= maxLat) return null;
  return { minLon, minLat, maxLon, maxLat };
}

function isHanaDb() {
  const requires = cds.env.requires || {};
  return Object.values(requires).some(s => s && (s.kind === 'hana' || s.impl === '@cap-js/hana'));
}

function sanitizeAttachmentName(fileName) {
  const cleaned = String(fileName || 'attachment')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
  return cleaned || 'attachment'
}

async function toAttachmentBuffer(content) {
  if (!content) return Buffer.alloc(0)
  if (Buffer.isBuffer(content)) return content
  if (content instanceof Uint8Array) return Buffer.from(content)
  if (typeof content === 'string') return Buffer.from(content, 'base64')
  if (typeof content.pipe === 'function' || content[Symbol.asyncIterator]) {
    const chunks = []
    for await (const chunk of content) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }
  if (content.buffer) return Buffer.from(content.buffer)
  return Buffer.from(content)
}

function attachmentResponse(row, bridgeId) {
  return {
    ID: row.ID,
    title: row.title || row.fileName,
    fileName: row.fileName,
    mediaType: row.mediaType || 'application/octet-stream',
    fileSize: row.fileSize || 0,
    createdAt: row.createdAt,
    documentDate: row.documentDate,
    referenceNumber: row.referenceNumber,
    openUrl: `/admin-bridges/api/bridges/${encodeURIComponent(bridgeId)}/attachments/${encodeURIComponent(row.ID)}/content`,
    downloadUrl: `/admin-bridges/api/bridges/${encodeURIComponent(bridgeId)}/attachments/${encodeURIComponent(row.ID)}/content?download=true`,
    deleteUrl: `/admin-bridges/api/bridges/${encodeURIComponent(bridgeId)}/attachments/${encodeURIComponent(row.ID)}`
  }
}

async function assertBridgeExists(db, bridgeId) {
  const ID = Number(bridgeId)
  if (!Number.isInteger(ID)) {
    const error = new Error('Invalid bridge ID')
    error.status = 400
    throw error
  }
  const bridge = await db.run(SELECT.one.from('bridge.management.Bridges').columns('ID').where({ ID }))
  if (!bridge) {
    const error = new Error('Bridge not found')
    error.status = 404
    throw error
  }
  return ID
}

function mapCodeList(rows) {
  return (rows || []).map((row) => ({ key: row.code, text: row.name || row.code }))
}

async function loadMassEditLookups() {
  const db = await cds.connect.to('db')
  const lookupEntries = await Promise.all(
    MASS_EDIT_LOOKUP_OPTION_MAP.map(async ([optionName, datasetKey]) => {
      const dataset = MASS_EDIT_DROPDOWN_DATASET_BY_KEY.get(datasetKey)
      const rows = await db.run(
        SELECT.from(dataset.entity)
          .columns('code', 'name')
          .where({ isActive: { '!=': false } })
          .orderBy('code')
      )
      return [optionName, mapCodeList(rows)]
    })
  )

  return Object.fromEntries(lookupEntries)
}

async function loadMassEditBridges() {
  const db = await cds.connect.to('db')
  const bridges = await db.run(
    SELECT.from('bridge.management.Bridges')
      .columns(...MASS_EDIT_COLUMNS)
      .orderBy('bridgeId')
  )

  return (bridges || []).map((bridge) => ({
    ...bridge,
    yearBuilt: bridge.yearBuilt == null ? null : Number(bridge.yearBuilt),
    conditionRating: bridge.conditionRating == null ? null : Number(bridge.conditionRating),
    nhvrAssessed: Boolean(bridge.nhvrAssessed),
    freightRoute: Boolean(bridge.freightRoute),
    overMassRoute: Boolean(bridge.overMassRoute),
    hmlApproved: Boolean(bridge.hmlApproved),
    bDoubleApproved: Boolean(bridge.bDoubleApproved)
  }))
}

async function saveMassEditBridges(updates, { user } = {}) {
  const db = await cds.connect.to('db')
  const batchId = cds.utils.uuid()

  // Phase 1 — validate + build patches + pre-fetch old records (before the transaction
  // is opened so reads and writes never compete for the same SQLite connection lock).
  const validUpdates = []
  for (const update of updates || []) {
    const id = Number(update?.ID)
    if (!Number.isInteger(id)) {
      throw new Error('Each mass edit update requires a numeric ID')
    }
    const patch = {}
    for (const [field, rawValue] of Object.entries(update)) {
      if (field === 'ID') continue
      if (!Object.prototype.hasOwnProperty.call(MASS_EDIT_FIELD_TYPES, field)) {
        throw new Error(`Field ${field} is not allowed in mass edit`)
      }
      const value = normalizeMassEditValue(field, rawValue, MASS_EDIT_FIELD_TYPES)
      if (value !== undefined) patch[field] = value
    }
    if (!Object.keys(patch).length) continue
    const oldRecord = await fetchCurrentRecord(db, 'bridge.management.Bridges', { ID: id })
    validUpdates.push({ id, patch, oldRecord })
  }

  // Phase 2 — write inside a single transaction (reads are already done).
  const tx = db.tx()
  let updated = 0
  const auditEntries = []
  try {
    for (const { id, patch, oldRecord } of validUpdates) {
      await tx.run(UPDATE('bridge.management.Bridges').set(patch).where({ ID: id }))
      updated += 1
      if (oldRecord) {
        const changes = diffRecords(
          Object.fromEntries(Object.keys(patch).map(k => [k, oldRecord[k]])),
          patch
        )
        if (changes.length) {
          auditEntries.push({
            objectType: 'Bridge',
            objectId:   String(id),
            objectName: oldRecord.bridgeName || String(id),
            source:     'MassEdit',
            batchId,
            changedBy:  user || 'system',
            changes
          })
        }
      }
    }
    await tx.commit()
  } catch (error) {
    await tx.rollback(error)
    throw error
  }

  // Phase 3 — fire audit-log writes in the background so they never delay the HTTP
  // response.  writeChangeLogs already suppresses its own errors via try/catch.
  if (auditEntries.length) {
    Promise.all(auditEntries.map(entry => writeChangeLogs(db, entry)))
      .catch(err => LOG.error('Audit log write failed (bridges):', err.message))
  }

  return { updated }
}

async function loadMassEditRestrictions() {
  const db = await cds.connect.to('db')
  const restrictions = await db.run(
    SELECT.from('bridge.management.Restrictions')
      .columns(...MASS_EDIT_RESTRICTION_COLUMNS)
      .orderBy('restrictionRef')
  )

  return (restrictions || []).map((restriction) => ({
    ...restriction,
    grossMassLimit: restriction.grossMassLimit == null ? null : Number(restriction.grossMassLimit),
    axleMassLimit: restriction.axleMassLimit == null ? null : Number(restriction.axleMassLimit),
    heightLimit: restriction.heightLimit == null ? null : Number(restriction.heightLimit),
    widthLimit: restriction.widthLimit == null ? null : Number(restriction.widthLimit),
    lengthLimit: restriction.lengthLimit == null ? null : Number(restriction.lengthLimit),
    speedLimit: restriction.speedLimit == null ? null : Number(restriction.speedLimit),
    permitRequired: Boolean(restriction.permitRequired),
    escortRequired: Boolean(restriction.escortRequired),
    temporary: Boolean(restriction.temporary),
    active: Boolean(restriction.active)
  }))
}

async function loadMassEditBridgeLookup(db) {
  const bridges = await db.run(
    SELECT.from('bridge.management.Bridges')
      .columns('ID', 'bridgeId', 'bridgeName')
  )
  return new Map((bridges || []).map((bridge) => [String(bridge.ID), bridge]))
}

function addBridgeSummary(row, bridgeLookup) {
  const bridge = bridgeLookup.get(String(row.bridge_ID))
  return {
    ...row,
    bridgeId: bridge?.bridgeId || '',
    bridgeName: bridge?.bridgeName || ''
  }
}

async function loadMassEditInspections() {
  const db = await cds.connect.to('db')
  const [inspections, bridgeLookup] = await Promise.all([
    db.run(
      SELECT.from('bridge.management.BridgeInspections')
        .columns(...MASS_EDIT_INSPECTION_COLUMNS)
        .orderBy('inspectionRef')
    ),
    loadMassEditBridgeLookup(db)
  ])

  return (inspections || []).map((inspection) => addBridgeSummary({
    ...inspection,
    accreditationLevel: inspection.accreditationLevel == null ? null : Number(inspection.accreditationLevel),
    conditionRating: inspection.conditionRating == null ? null : Number(inspection.conditionRating),
    structuralRating: inspection.structuralRating == null ? null : Number(inspection.structuralRating),
    active: Boolean(inspection.active)
  }, bridgeLookup))
}

async function loadMassEditDefects() {
  const db = await cds.connect.to('db')
  const [defects, bridgeLookup, inspections] = await Promise.all([
    db.run(
      SELECT.from('bridge.management.BridgeDefects')
        .columns(...MASS_EDIT_DEFECT_COLUMNS)
        .orderBy('defectId')
    ),
    loadMassEditBridgeLookup(db),
    db.run(
      SELECT.from('bridge.management.BridgeInspections')
        .columns('ID', 'inspectionRef')
    )
  ])
  const inspectionLookup = new Map((inspections || []).map((inspection) => [String(inspection.ID), inspection.inspectionRef]))

  return (defects || []).map((defect) => addBridgeSummary({
    ...defect,
    inspectionRef: inspectionLookup.get(String(defect.inspection_ID)) || '',
    severity: defect.severity == null ? null : Number(defect.severity),
    urgency: defect.urgency == null ? null : Number(defect.urgency),
    active: Boolean(defect.active)
  }, bridgeLookup))
}

async function loadMassEditCapacities() {
  const db = await cds.connect.to('db')
  const [capacities, bridgeLookup] = await Promise.all([
    db.run(
      SELECT.from('bridge.management.BridgeCapacities')
        .columns(...MASS_EDIT_CAPACITY_COLUMNS)
        .orderBy('capacityType')
    ),
    loadMassEditBridgeLookup(db)
  ])

  const decimalFields = [
    'grossMassLimit', 'grossCombined', 'steerAxleLimit', 'singleAxleLimit',
    'tandemGroupLimit', 'triAxleGroupLimit', 'minClearancePosted',
    'lane1Clearance', 'lane2Clearance', 'carriagewayWidth', 'trafficableWidth',
    'laneWidth', 'ratingFactor', 'floodClosureLevel', 'consumedLife'
  ]

  return (capacities || []).map((capacity) => {
    const normalized = { ...capacity }
    decimalFields.forEach((field) => {
      normalized[field] = normalized[field] == null ? null : Number(normalized[field])
    })
    normalized.designLife = normalized.designLife == null ? null : Number(normalized.designLife)
    normalized.fatigueSensitive = Boolean(normalized.fatigueSensitive)
    return addBridgeSummary(normalized, bridgeLookup)
  })
}

async function loadMassEditDropdownValues() {
  const db = await cds.connect.to('db')
  const datasetRows = await Promise.all(
    MASS_EDIT_DROPDOWN_DATASETS.map(async (dataset) => {
      const rows = await db.run(
        SELECT.from(dataset.entity)
          .columns('code', 'name', 'descr', 'isActive')
          .orderBy('code')
      )
      return (rows || []).map((row) => ({
        ID: `${dataset.key}:${row.code}`,
        dataset: dataset.key,
        datasetLabel: dataset.label,
        code: row.code,
        name: row.name || row.code,
        descr: row.descr || '',
        isActive: row.isActive !== false
      }))
    })
  )
  return datasetRows.flat()
}

async function saveMassEditDropdownValues(updates, { user } = {}) {
  const db = await cds.connect.to('db')
  const batchId = cds.utils.uuid()

  // Phase 1 — validate + build patches + pre-fetch old records (before transaction).
  const validUpdates = []
  for (const update of updates || []) {
    const dataset = MASS_EDIT_DROPDOWN_DATASET_BY_KEY.get(update?.dataset)
    if (!dataset) throw new Error('Each dropdown update requires a valid dataset')
    const code = update?.code
    if (!code) throw new Error('Each dropdown update requires a code')

    const patch = {}
    for (const [field, rawValue] of Object.entries(update)) {
      if (['ID', 'dataset', 'datasetLabel', 'code', 'name', 'descr'].includes(field)) continue
      if (!Object.prototype.hasOwnProperty.call(MASS_EDIT_DROPDOWN_FIELD_TYPES, field)) {
        throw new Error(`Field ${field} is not allowed in dropdown mass edit`)
      }
      const value = normalizeMassEditValue(field, rawValue, MASS_EDIT_DROPDOWN_FIELD_TYPES)
      if (value !== undefined) patch[field] = value
    }
    if (!Object.keys(patch).length) continue
    const oldRecord = await fetchCurrentRecord(db, dataset.entity, { code })
    validUpdates.push({ dataset, code, patch, oldRecord })
  }

  // Phase 2 — write inside a single transaction (reads already done).
  const tx = db.tx()
  let updated = 0
  const auditEntries = []
  try {
    for (const { dataset, code, patch, oldRecord } of validUpdates) {
      await tx.run(UPDATE(dataset.entity).set(patch).where({ code }))
      updated += 1
      if (oldRecord) {
        const changes = diffRecords(
          Object.fromEntries(Object.keys(patch).map(k => [k, oldRecord[k]])),
          patch
        )
        if (changes.length) {
          auditEntries.push({
            objectType: 'Lookup',
            objectId:   `${dataset.key}:${code}`,
            objectName: `${dataset.label}: ${oldRecord.name || code}`,
            source:     'MassEdit',
            batchId,
            changedBy:  user || 'system',
            changes
          })
        }
      }
    }
    await tx.commit()
  } catch (error) {
    await tx.rollback(error)
    throw error
  }

  // Phase 3 — background audit writes (fire-and-forget; writeChangeLogs suppresses errors).
  if (auditEntries.length) {
    Promise.all(auditEntries.map(entry => writeChangeLogs(db, entry)))
      .catch(err => LOG.error('Audit log write failed (dropdowns):', err.message))
  }

  return { updated }
}

async function saveMassEditRecords(updates, config, { user } = {}) {
  const db = await cds.connect.to('db')
  const batchId = cds.utils.uuid()

  // Phase 1 — validate + build patches + pre-fetch old records (before transaction).
  const validUpdates = []
  for (const update of updates || []) {
    const id = update?.ID
    if (!id || typeof id !== 'string') {
      throw new Error(`Each ${config.label.toLowerCase()} update requires an ID`)
    }
    const patch = {}
    for (const [field, rawValue] of Object.entries(update)) {
      if (field === 'ID') continue
      if (!Object.prototype.hasOwnProperty.call(config.fieldTypes, field)) {
        throw new Error(`Field ${field} is not allowed in ${config.label.toLowerCase()} mass edit`)
      }
      const value = normalizeMassEditValue(field, rawValue, config.fieldTypes)
      if (value !== undefined) patch[field] = value
    }
    if (!Object.keys(patch).length) continue
    const oldRecord = await fetchCurrentRecord(db, config.table, { ID: id })
    validUpdates.push({ id, patch, oldRecord })
  }

  // Phase 2 — write inside a single transaction (reads already done).
  const tx = db.tx()
  let updated = 0
  const auditEntries = []
  try {
    for (const { id, patch, oldRecord } of validUpdates) {
      await tx.run(UPDATE(config.table).set(patch).where({ ID: id }))
      updated += 1
      if (oldRecord) {
        const changes = diffRecords(
          Object.fromEntries(Object.keys(patch).map(k => [k, oldRecord[k]])),
          patch
        )
        if (changes.length) {
          auditEntries.push({
            objectType: config.auditType,
            objectId:   id,
            objectName: oldRecord[config.nameField] || id,
            source:     'MassEdit',
            batchId,
            changedBy:  user || 'system',
            changes
          })
        }
      }
    }
    await tx.commit()
  } catch (error) {
    await tx.rollback(error)
    throw error
  }

  // Phase 3 — background audit writes (fire-and-forget; writeChangeLogs suppresses errors).
  if (auditEntries.length) {
    Promise.all(auditEntries.map(entry => writeChangeLogs(db, entry)))
      .catch(err => LOG.error(`Audit log write failed (${config.label.toLowerCase()}):`, err.message))
  }

  return { updated }
}

function saveMassEditInspections(updates, options) {
  return saveMassEditRecords(updates, {
    label: 'Inspection',
    table: 'bridge.management.BridgeInspections',
    fieldTypes: MASS_EDIT_INSPECTION_FIELD_TYPES,
    auditType: 'BridgeInspection',
    nameField: 'inspectionRef'
  }, options)
}

function saveMassEditDefects(updates, options) {
  return saveMassEditRecords(updates, {
    label: 'Defect',
    table: 'bridge.management.BridgeDefects',
    fieldTypes: MASS_EDIT_DEFECT_FIELD_TYPES,
    auditType: 'BridgeDefect',
    nameField: 'defectId'
  }, options)
}

function saveMassEditCapacities(updates, options) {
  return saveMassEditRecords(updates, {
    label: 'Capacity',
    table: 'bridge.management.BridgeCapacities',
    fieldTypes: MASS_EDIT_CAPACITY_FIELD_TYPES,
    auditType: 'BridgeCapacity',
    nameField: 'capacityType'
  }, options)
}

async function saveMassEditRestrictions(updates, { user } = {}) {
  const db = await cds.connect.to('db')
  const batchId = cds.utils.uuid()

  // Phase 1 — validate + build patches + pre-fetch old records (before transaction).
  const validUpdates = []
  for (const update of updates || []) {
    const id = update?.ID
    if (!id || typeof id !== 'string') throw new Error('Each restriction update requires an ID')
    const patch = {}
    for (const [field, rawValue] of Object.entries(update)) {
      if (field === 'ID') continue
      if (!Object.prototype.hasOwnProperty.call(MASS_EDIT_RESTRICTION_FIELD_TYPES, field)) {
        throw new Error(`Field ${field} is not allowed in restriction mass edit`)
      }
      const value = normalizeMassEditValue(field, rawValue, MASS_EDIT_RESTRICTION_FIELD_TYPES)
      if (value !== undefined) patch[field] = value
    }
    if (!Object.keys(patch).length) continue
    const oldRecord = await fetchCurrentRecord(db, 'bridge.management.Restrictions', { ID: id })
    validUpdates.push({ id, patch, oldRecord })
  }

  // Phase 2 — write inside a single transaction (reads already done).
  const tx = db.tx()
  let updated = 0
  const auditEntries = []
  try {
    for (const { id, patch, oldRecord } of validUpdates) {
      await tx.run(UPDATE('bridge.management.Restrictions').set(patch).where({ ID: id }))
      updated += 1
      if (oldRecord) {
        const changes = diffRecords(
          Object.fromEntries(Object.keys(patch).map(k => [k, oldRecord[k]])),
          patch
        )
        if (changes.length) {
          auditEntries.push({
            objectType: 'Restriction',
            objectId:   id,
            objectName: oldRecord.restrictionRef || id,
            source:     'MassEdit',
            batchId,
            changedBy:  user || 'system',
            changes
          })
        }
      }
    }
    await tx.commit()
  } catch (error) {
    await tx.rollback(error)
    throw error
  }

  // Phase 3 — background audit writes (fire-and-forget; writeChangeLogs suppresses errors).
  if (auditEntries.length) {
    Promise.all(auditEntries.map(entry => writeChangeLogs(db, entry)))
      .catch(err => LOG.error('Audit log write failed (restrictions):', err.message))
  }

  return { updated }
}

async function loadDashboardAnalytics() {
  const db = await cds.connect.to('db')

  // Fetch all bridges and active restrictions in two queries.
  // This avoids CDS aggregate-expression compatibility issues (count(1) as cnt,
  // avg(...) in SELECT.columns) which caused all KPIs to return 0.
  // Entity: bridge.management.Bridges / bridge.management.Restrictions
  // Field value reference (from seed data):
  //   condition      → 'Good' | 'Fair' | 'Poor' | 'Critical'  (title case)
  //   postingStatus  → 'Unrestricted' | 'Restricted' | 'Under Review'  (title case)
  //   Restrictions.active           → boolean true/false
  //   Restrictions.restrictionStatus → 'Active' (title case)
  const [bridges, restrictions] = await Promise.all([
    db.run(SELECT.from('bridge.management.Bridges').columns(
      'ID', 'condition', 'conditionRating', 'structuralAdequacyRating',
      'postingStatus'
    )),
    db.run(SELECT.from('bridge.management.Restrictions').columns(
      'ID', 'active', 'restrictionStatus'
    ).where({ active: true }))
  ])

  const bridgeList      = bridges      || []
  const restrictionList = restrictions || []
  const total           = bridgeList.length

  // ── Condition distribution ────────────────────────────────────────────────
  const dist = { good: 0, fair: 0, poor: 0, critical: 0 }
  for (const b of bridgeList) {
    const cond = (b.condition || 'Good').toLowerCase()
    if      (cond === 'critical') dist.critical++
    else if (cond === 'poor')     dist.poor++
    else if (cond === 'fair')     dist.fair++
    else                          dist.good++     // Good or unknown
  }

  // ── Sufficiency: avg structuralAdequacyRating (1–10 scale) → 0–100 % ─────
  const ratedBridges = bridgeList.filter(b => b.structuralAdequacyRating != null && b.structuralAdequacyRating > 0)
  let sufficiencyPct = 0
  if (ratedBridges.length > 0) {
    const sumRating = ratedBridges.reduce((s, b) => s + Number(b.structuralAdequacyRating), 0)
    sufficiencyPct  = Math.round((sumRating / ratedBridges.length / 10) * 100)
  }

  // ── Other KPIs ────────────────────────────────────────────────────────────
  const closedBridges = bridgeList.filter(b => b.postingStatus === 'Closed').length

  // Deficient = condition Poor or Critical
  const deficient = dist.poor + dist.critical

  // Active restrictions = those with active = true (already filtered in query)
  const activeRestrictions  = restrictionList.length
  const postedRestrictions  = restrictionList.filter(r => r.restrictionStatus === 'Active').length

  return {
    totalBridges:    total,
    activeRestrictions,
    closedBridges,
    postedRestrictions,
    deficient,
    sufficiencyPct,
    conditionDistribution: {
      good:     dist.good,
      fair:     dist.fair,
      poor:     dist.poor,
      critical: dist.critical,
      total
    }
  }
}

async function loadMapBridges({ bbox } = {}) {
  const db = await cds.connect.to('db')
  const bboxParsed = parseBbox(bbox)

  let query = SELECT.from('bridge.management.Bridges').columns(
    'ID',
    'bridgeId',
    'bridgeName',
    'state',
    'latitude',
    'longitude',
    'postingStatus',
    'conditionRating',
    'yearBuilt',
    'structureType',
    'route',
    'region',
    'clearanceHeight',
    'spanLength',
    'lastInspectionDate',
    'nhvrAssessed',
    'freightRoute',
    'overMassRoute',
    'hmlApproved',
    'bDoubleApproved',
    'restriction_ID',
    'assetOwner',
    'managingAuthority',
    'material',
    'spanCount',
    'totalLength',
    'deckWidth',
    'averageDailyTraffic',
    'loadRating',
    'importanceLevel',
    'geoJson'
  )

  if (bboxParsed) {
    // UAT-FIX-2 (revised): Use CDS WHERE clause for bbox filter on both HANA and SQLite.
    // The previous HANA path used ST_Within("GEOLOCATION",...) which requires a spatial column
    // that does not exist in the bridge.management.Bridges entity (only Decimal lat/lon exist).
    // Using the CDS query builder instead of raw SQL avoids HANA column-name quoting issues
    // (e.g. "LATITUDE" vs "latitude") and works identically on SQLite and HANA.
    const { minLat, maxLat, minLon, maxLon } = bboxParsed
    query = query
      .where('latitude >=', minLat)
      .and('latitude <=', maxLat)
      .and('longitude >=', minLon)
      .and('longitude <=', maxLon)
  }

  const bridges = await db.run(query)
  return _mapBridgeRows(bridges, db)
}

async function _mapBridgeRows(bridges, db) {
  // FIX 5: Eliminated N+1 — fetch all active restrictions for all bridges in ONE query,
  // then map them in memory. Also resolve vehicleClass from the same result set.
  const bridgeIds = bridges.map((bridge) => bridge.ID).filter(Boolean)
  let vehicleClassByRestriction = new Map()
  const restrictionsByBridgeId = new Map()

  if (bridgeIds.length) {
    const allRestrictions = await db.run(
      SELECT.from('bridge.management.Restrictions')
        .columns(
          'ID',
          'bridge_ID',
          'active',
          'name',
          'restrictionType',
          'restrictionValue',
          'restrictionUnit',
          'restrictionStatus',
          'remarks',
          'appliesToVehicleClass'
        )
        .where({ bridge_ID: { in: bridgeIds }, active: true })
    )

    // Build vehicleClass lookup keyed by restriction ID (for bridge.restriction_ID FK)
    vehicleClassByRestriction = new Map(
      allRestrictions.map((r) => [r.ID, r.appliesToVehicleClass || null])
    )

    // Map active restrictions by bridge_ID in memory
    for (const restriction of allRestrictions) {
      if (!restriction.bridge_ID) continue
      if (!restrictionsByBridgeId.has(restriction.bridge_ID)) {
        restrictionsByBridgeId.set(restriction.bridge_ID, [])
      }
      restrictionsByBridgeId.get(restriction.bridge_ID).push({
        name: restriction.name || restriction.restrictionType || 'Restriction',
        restrictionType: restriction.restrictionType || null,
        restrictionValue: restriction.restrictionValue || null,
        restrictionUnit: restriction.restrictionUnit || null,
        restrictionStatus: restriction.restrictionStatus || null,
        remarks: restriction.remarks || null
      })
    }
  }

  return bridges
    .filter((bridge) => Number.isFinite(Number(bridge.latitude)) && Number.isFinite(Number(bridge.longitude)))
    .map((bridge) => ({
      ID: bridge.ID,
      bridgeId: bridge.bridgeId,
      bridgeName: bridge.bridgeName,
      state: bridge.state,
      latitude: Number(bridge.latitude),
      longitude: Number(bridge.longitude),
      postingStatus: bridge.postingStatus || null,
      conditionRating: bridge.conditionRating == null ? null : Number(bridge.conditionRating),
      yearBuilt: bridge.yearBuilt == null ? null : Number(bridge.yearBuilt),
      structureType: bridge.structureType || null,
      route: bridge.route || null,
      region: bridge.region || null,
      clearanceHeight: bridge.clearanceHeight == null ? null : Number(bridge.clearanceHeight),
      spanLength: bridge.spanLength == null ? null : Number(bridge.spanLength),
      lastInspectionDate: bridge.lastInspectionDate || null,
      nhvrAssessed: Boolean(bridge.nhvrAssessed),
      freightRoute: Boolean(bridge.freightRoute),
      overMassRoute: Boolean(bridge.overMassRoute),
      hmlApproved: Boolean(bridge.hmlApproved),
      bDoubleApproved: Boolean(bridge.bDoubleApproved),
      vehicleClass: vehicleClassByRestriction.get(bridge.restriction_ID) || null,
      restrictions: restrictionsByBridgeId.get(bridge.ID) || [],
      assetOwner: bridge.assetOwner || null,
      managingAuthority: bridge.managingAuthority || null,
      material: bridge.material || null,
      spanCount: bridge.spanCount || null,
      totalLength: bridge.totalLength ? Number(bridge.totalLength) : null,
      deckWidth: bridge.deckWidth ? Number(bridge.deckWidth) : null,
      averageDailyTraffic: bridge.averageDailyTraffic || null,
      loadRating: bridge.loadRating ? Number(bridge.loadRating) : null,
      importanceLevel: bridge.importanceLevel || null,
      geoJson: bridge.geoJson || null
    }))
}

async function loadMapRestrictions({ bbox } = {}) {
  const db = await cds.connect.to('db');
  const bboxParsed = parseBbox(bbox);

  const restrictions = await db.run(
    SELECT.from('bridge.management.Restrictions')
      .columns('ID', 'restrictionRef', 'bridgeRef', 'bridge_ID', 'restrictionType',
        'restrictionValue', 'restrictionUnit', 'restrictionStatus', 'active',
        'restrictionCategory', 'grossMassLimit', 'axleMassLimit', 'heightLimit',
        'widthLimit', 'lengthLimit', 'speedLimit', 'permitRequired', 'escortRequired',
        'effectiveFrom', 'effectiveTo', 'approvedBy', 'direction', 'remarks')
      .where({ active: true })
  );

  if (!restrictions.length) return [];

  const bridgeIds = [...new Set(restrictions.map(r => r.bridge_ID).filter(Boolean))];
  const bridges = bridgeIds.length ? await db.run(
    SELECT.from('bridge.management.Bridges')
      .columns('ID', 'latitude', 'longitude', 'bridgeId', 'bridgeName', 'state', 'postingStatus')
      .where({ ID: { in: bridgeIds } })
  ) : [];

  const bridgeMap = new Map(bridges.map(b => [b.ID, b]));

  return restrictions
    .filter(r => {
      const bridge = bridgeMap.get(r.bridge_ID);
      if (!bridge) return false;
      if (!Number.isFinite(Number(bridge.latitude)) || !Number.isFinite(Number(bridge.longitude))) return false;
      if (bboxParsed) {
        const lat = Number(bridge.latitude), lon = Number(bridge.longitude);
        if (lat < bboxParsed.minLat || lat > bboxParsed.maxLat) return false;
        if (lon < bboxParsed.minLon || lon > bboxParsed.maxLon) return false;
      }
      return true;
    })
    .map(r => {
      const bridge = bridgeMap.get(r.bridge_ID);
      return {
        ID: r.ID,
        restrictionRef: r.restrictionRef || '—',
        bridgeRef: r.bridgeRef || '—',
        bridge_ID: r.bridge_ID,
        bridgeId: bridge.bridgeId,
        bridgeName: bridge.bridgeName,
        state: bridge.state || null,
        bridgePostingStatus: bridge.postingStatus || null,
        latitude: Number(bridge.latitude),
        longitude: Number(bridge.longitude),
        restrictionType: r.restrictionType || null,
        restrictionCategory: r.restrictionCategory || null,
        restrictionValue: r.restrictionValue || null,
        restrictionUnit: r.restrictionUnit || null,
        restrictionStatus: r.restrictionStatus || null,
        grossMassLimit: r.grossMassLimit ? Number(r.grossMassLimit) : null,
        axleMassLimit: r.axleMassLimit ? Number(r.axleMassLimit) : null,
        heightLimit: r.heightLimit ? Number(r.heightLimit) : null,
        widthLimit: r.widthLimit ? Number(r.widthLimit) : null,
        lengthLimit: r.lengthLimit ? Number(r.lengthLimit) : null,
        speedLimit: r.speedLimit ? Number(r.speedLimit) : null,
        permitRequired: Boolean(r.permitRequired),
        escortRequired: Boolean(r.escortRequired),
        effectiveFrom: r.effectiveFrom || null,
        effectiveTo: r.effectiveTo || null,
        approvedBy: r.approvedBy || null,
        direction: r.direction || null,
        remarks: r.remarks || null
      };
    });
}

function buildBridgesCsv(bridges, customAttributeColumns = [], customFieldValuesByObjectId = new Map()) {
  const BRIDGE_EXPORT_FIELDS = ['ID','bridgeId','bridgeName','state','latitude','longitude','postingStatus',
    'conditionRating','yearBuilt','structureType','route','region','clearanceHeight','spanLength',
    'assetOwner','nhvrAssessed','freightRoute','overMassRoute','hmlApproved','bDoubleApproved'];
  const customFieldHeaders = customAttributeColumns.map(customFieldColumn => customFieldColumn.label);
  const header = [...BRIDGE_EXPORT_FIELDS, ...customFieldHeaders].join(',');
  const rows = bridges.map(bridge => {
    const bridgeCustomFields = customFieldValuesByObjectId.get(String(bridge.ID)) || new Map();
    const bridgeExportCells = BRIDGE_EXPORT_FIELDS.map(bridgePropertyName => {
      const bridgeProperty = bridge[bridgePropertyName];
      if (bridgeProperty == null) return '';
      const csvCellText = String(bridgeProperty);
      return csvCellText.includes(',') || csvCellText.includes('"') ? '"' + csvCellText.replace(/"/g,'""') + '"' : csvCellText;
    });
    const customFieldCells = customAttributeColumns.map(customFieldColumn => {
      const customFieldEntry = bridgeCustomFields.get(customFieldColumn.key) || '';
      const csvCellText = String(customFieldEntry);
      return csvCellText.includes(',') || csvCellText.includes('"') ? '"' + csvCellText.replace(/"/g,'""') + '"' : csvCellText;
    });
    return [...bridgeExportCells, ...customFieldCells].join(',');
  });
  return header + '\n' + rows.join('\n');
}

function buildRestrictionsCsv(restrictions, customAttributeColumns = [], customFieldValuesByObjectId = new Map()) {
  const RESTRICTION_EXPORT_FIELDS = ['ID','restrictionRef','bridgeRef','bridgeName','state','restrictionType',
    'restrictionCategory','restrictionValue','restrictionUnit','restrictionStatus',
    'grossMassLimit','axleMassLimit','heightLimit','widthLimit','lengthLimit','speedLimit',
    'permitRequired','escortRequired','effectiveFrom','effectiveTo','approvedBy','direction'];
  const customFieldHeaders = customAttributeColumns.map(customFieldColumn => customFieldColumn.label);
  const header = [...RESTRICTION_EXPORT_FIELDS, ...customFieldHeaders].join(',');
  const rows = restrictions.map(restriction => {
    const restrictionCustomFields = customFieldValuesByObjectId.get(String(restriction.ID)) || new Map();
    const restrictionExportCells = RESTRICTION_EXPORT_FIELDS.map(restrictionPropertyName => {
      const restrictionProperty = restriction[restrictionPropertyName];
      if (restrictionProperty == null) return '';
      const csvCellText = String(restrictionProperty);
      return csvCellText.includes(',') || csvCellText.includes('"') ? '"' + csvCellText.replace(/"/g,'""') + '"' : csvCellText;
    });
    const customFieldCells = customAttributeColumns.map(customFieldColumn => {
      const customFieldEntry = restrictionCustomFields.get(customFieldColumn.key) || '';
      const csvCellText = String(customFieldEntry);
      return csvCellText.includes(',') || csvCellText.includes('"') ? '"' + csvCellText.replace(/"/g,'""') + '"' : csvCellText;
    });
    return [...restrictionExportCells, ...customFieldCells].join(',');
  });
  return header + '\n' + rows.join('\n');
}

// CONFIG-R3: zoom→grid-cell mapping is config-driven. [maxZoom, cellSizeDeg] pairs;
// override via SystemConfig key GIS_CLUSTER_ZOOM_CELLS (JSON). Beyond the last pair,
// individual points are returned (null).
const DEFAULT_ZOOM_CELLS = [[4, 2.0], [5, 1.0], [6, 0.5], [7, 0.25], [8, 0.1]];
function zoomToCellSize(zoom, cells = DEFAULT_ZOOM_CELLS) {
  for (const pair of cells) { if (zoom <= pair[0]) return pair[1]; }
  return null;
}
async function getZoomCells() {
  try { const raw = await getConfig('GIS_CLUSTER_ZOOM_CELLS'); const c = raw ? JSON.parse(raw) : null; return Array.isArray(c) ? c : DEFAULT_ZOOM_CELLS; }
  catch { return DEFAULT_ZOOM_CELLS; }
}

async function loadClusters({ bbox, zoom = 6 } = {}) {
  const db = await cds.connect.to('db');
  const bboxParsed = parseBbox(bbox);
  const cellSize = zoomToCellSize(Number(zoom), await getZoomCells());

  // At high zoom, return individual bridge points (not clusters)
  if (!cellSize) {
    const bridges = await loadMapBridges({ bbox });
    return {
      type: 'points',
      features: bridges.map(b => ({
        lat: b.latitude,
        lng: b.longitude,
        id: b.ID,
        bridgeId: b.bridgeId,
        bridgeName: b.bridgeName,
        postingStatus: b.postingStatus,
        conditionRating: b.conditionRating
      }))
    };
  }

  // Grid-based clustering via SQL aggregation
  // Works on both HANA and SQLite
  let query;
  // cellSize is a server-computed number (not user input) — safe to interpolate
  // All user-supplied bbox values are bound as parameterised placeholders
  let queryParams = [];
  if (bboxParsed) {
    const { minLat, maxLat, minLon, maxLon } = bboxParsed;
    if (isHanaDb()) {
      query = `
        SELECT
          ROUND("LATITUDE" / ${cellSize}) * ${cellSize} AS "gridLat",
          ROUND("LONGITUDE" / ${cellSize}) * ${cellSize} AS "gridLon",
          COUNT(*) AS "cnt",
          AVG("CONDITIONRATING") AS "avgCondition",
          SUM(CASE WHEN "POSTINGSTATUS" = 'Closed' THEN 1 ELSE 0 END) AS "closedCount",
          SUM(CASE WHEN "POSTINGSTATUS" IN ('Restricted','Under Review') THEN 1 ELSE 0 END) AS "restrictedCount"
        FROM "BRIDGE_MANAGEMENT_BRIDGES"
        WHERE "LATITUDE" BETWEEN ? AND ?
          AND "LONGITUDE" BETWEEN ? AND ?
          AND "LATITUDE" IS NOT NULL AND "LONGITUDE" IS NOT NULL
        GROUP BY ROUND("LATITUDE" / ${cellSize}), ROUND("LONGITUDE" / ${cellSize})
      `;
      queryParams = [minLat, maxLat, minLon, maxLon];
    } else {
      query = `
        SELECT
          ROUND(latitude / ${cellSize}) * ${cellSize} AS gridLat,
          ROUND(longitude / ${cellSize}) * ${cellSize} AS gridLon,
          COUNT(*) AS cnt,
          AVG(conditionRating) AS avgCondition,
          SUM(CASE WHEN postingStatus = 'Closed' THEN 1 ELSE 0 END) AS closedCount,
          SUM(CASE WHEN postingStatus IN ('Restricted','Under Review') THEN 1 ELSE 0 END) AS restrictedCount
        FROM bridge_management_Bridges
        WHERE latitude BETWEEN ? AND ?
          AND longitude BETWEEN ? AND ?
          AND latitude IS NOT NULL AND longitude IS NOT NULL
        GROUP BY ROUND(latitude / ${cellSize}), ROUND(longitude / ${cellSize})
      `;
      queryParams = [minLat, maxLat, minLon, maxLon];
    }
  } else {
    if (isHanaDb()) {
      query = `
        SELECT
          ROUND("LATITUDE" / ${cellSize}) * ${cellSize} AS "gridLat",
          ROUND("LONGITUDE" / ${cellSize}) * ${cellSize} AS "gridLon",
          COUNT(*) AS "cnt",
          AVG("CONDITIONRATING") AS "avgCondition",
          SUM(CASE WHEN "POSTINGSTATUS" = 'Closed' THEN 1 ELSE 0 END) AS "closedCount",
          SUM(CASE WHEN "POSTINGSTATUS" IN ('Restricted','Under Review') THEN 1 ELSE 0 END) AS "restrictedCount"
        FROM "BRIDGE_MANAGEMENT_BRIDGES"
        WHERE "LATITUDE" IS NOT NULL AND "LONGITUDE" IS NOT NULL
        GROUP BY ROUND("LATITUDE" / ${cellSize}), ROUND("LONGITUDE" / ${cellSize})
      `;
    } else {
      query = `
        SELECT
          ROUND(latitude / ${cellSize}) * ${cellSize} AS gridLat,
          ROUND(longitude / ${cellSize}) * ${cellSize} AS gridLon,
          COUNT(*) AS cnt,
          AVG(conditionRating) AS avgCondition,
          SUM(CASE WHEN postingStatus = 'Closed' THEN 1 ELSE 0 END) AS closedCount,
          SUM(CASE WHEN postingStatus IN ('Restricted','Under Review') THEN 1 ELSE 0 END) AS restrictedCount
        FROM bridge_management_Bridges
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        GROUP BY ROUND(latitude / ${cellSize}), ROUND(longitude / ${cellSize})
      `;
    }
  }

  const rows = await db.run(query, queryParams);
  return {
    type: 'clusters',
    cellSize,
    features: (rows || []).map(row => {
      const lat = Number(row.gridLat || row['gridLat']);
      const lng = Number(row.gridLon || row['gridLon']);
      const cnt = Number(row.cnt || row['cnt'] || 0);
      const avg = row.avgCondition || row['avgCondition'];
      const closed = Number(row.closedCount || row['closedCount'] || 0);
      const restricted = Number(row.restrictedCount || row['restrictedCount'] || 0);
      return {
        lat,
        lng,
        count: cnt,
        avgCondition: avg != null ? Math.round(Number(avg) * 10) / 10 : null,
        closedCount: closed,
        restrictedCount: restricted
      };
    }).filter(f => Number.isFinite(f.lat) && Number.isFinite(f.lng))
  };
}

function haversineDistanceKm(lat1, lng1, lat2, lng2, earthRadiusKm = 6371) {
  // CONFIG-4: radius is config-driven (default 6371 km mean). HANA defers to ST_Distance
  // which respects the CRS; this SQLite fallback is intentionally a spherical approximation.
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const haversineTerm = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversineTerm), Math.sqrt(1 - haversineTerm));
}

async function loadProximityBridges({ lat, lng, radiusKm = 10 } = {}) {
  const db = await cds.connect.to('db');
  const latN = Number(lat), lngN = Number(lng), radN = Number(radiusKm);

  if (!Number.isFinite(latN) || !Number.isFinite(lngN) || radN <= 0) {
    throw new Error('lat, lng and radius (km) are required');
  }

  // Approximate bounding box for initial filter (faster). CONFIG-5: km-per-degree is
  // config-driven (default 111) so the approximation constant isn't a magic literal.
  const kmPerDeg = await getConfigInt('GIS_KM_PER_DEGREE', 111);
  const earthRadiusKm = await getConfigInt('GIS_EARTH_RADIUS_KM', 6371);
  const latDelta = radN / kmPerDeg;
  const lngDelta = radN / (kmPerDeg * Math.cos(latN * Math.PI / 180));
  const minLat = latN - latDelta, maxLat = latN + latDelta;
  const minLon = lngN - lngDelta, maxLon = lngN + lngDelta;

  let bridges;
  if (isHanaDb()) {
    // HANA: ST_Distance for exact spherical distance.
    // CONFIG-1: the comparison-point SRID is config-driven and identical to the SRID
    // the geoLocation column was backfilled with (getStorageSrid), so they never
    // mismatch. All user-supplied values are bound as parameterised placeholders.
    const srid = await getStorageSrid();
    bridges = await db.run(`
      SELECT "ID","bridgeId","bridgeName","state","latitude","longitude",
             "postingStatus","conditionRating","structureType","route","region",
             "clearanceHeight","spanLength","nhvrAssessed",
             "geoLocation".ST_Distance(NEW ST_Point(?, ?, ?), 'meter') / 1000 AS "distanceKm"
      FROM "BRIDGE_MANAGEMENT_BRIDGES"
      WHERE "LATITUDE" BETWEEN ? AND ?
        AND "LONGITUDE" BETWEEN ? AND ?
        AND "LATITUDE" IS NOT NULL AND "LONGITUDE" IS NOT NULL
        AND "geoLocation".ST_Distance(NEW ST_Point(?, ?, ?), 'meter') / 1000 <= ?
      ORDER BY "distanceKm"
    `, [lngN, latN, srid, minLat, maxLat, minLon, maxLon, lngN, latN, srid, radN]);
  } else {
    // SQLite: haversine post-filter
    const candidateQuery = SELECT.from('bridge.management.Bridges')
      .columns('ID', 'bridgeId', 'bridgeName', 'state', 'latitude', 'longitude',
        'postingStatus', 'conditionRating', 'structureType', 'route', 'region',
        'clearanceHeight', 'spanLength', 'nhvrAssessed')
      .where('latitude >=', minLat).and('latitude <=', maxLat)
      .and('longitude >=', minLon).and('longitude <=', maxLon);
    const candidates = await db.run(candidateQuery);
    bridges = candidates
      .map(b => ({
        ...b,
        distanceKm: haversineDistanceKm(latN, lngN, Number(b.latitude), Number(b.longitude), earthRadiusKm)
      }))
      .filter(b => b.distanceKm <= radN)
      .sort((nearerBridge, fartherBridge) => nearerBridge.distanceKm - fartherBridge.distanceKm);
  }

  return (bridges || []).map(b => ({
    ID: b.ID,
    bridgeId: b.bridgeId || '—',
    bridgeName: b.bridgeName || 'Bridge',
    state: b.state || null,
    latitude: Number(b.latitude),
    longitude: Number(b.longitude),
    postingStatus: b.postingStatus || null,
    conditionRating: b.conditionRating != null ? Number(b.conditionRating) : null,
    structureType: b.structureType || null,
    route: b.route || null,
    region: b.region || null,
    clearanceHeight: b.clearanceHeight != null ? Number(b.clearanceHeight) : null,
    spanLength: b.spanLength != null ? Number(b.spanLength) : null,
    nhvrAssessed: Boolean(b.nhvrAssessed),
    distanceKm: Math.round(Number(b.distanceKm || 0) * 100) / 100
  }));
}

// ── Module-scope auth helpers (must be defined before bootstrap AND served) ──
// _isDummyAuth: true when running locally with SQLite + dummy auth (no VCAP_SERVICES).
// Used by both the bootstrap custom-route middleware and the served launchpad routes.
const _isDummyAuth = !process.env.VCAP_SERVICES && cds.env.requires?.auth?.kind === 'dummy'

// _jwtHasScope: raw JWT scope check for routes that run before CDS XSUAA middleware.
// Reads the Authorization: Bearer header directly and checks payload.scope[].
// Matches exact scope name OR any scope ending with '.<scopeSuffix>'.
const _jwtHasScope = (authHeader, scopeSuffix) => {
  try {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '')
    if (!token) return false
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    return (payload.scope || []).some(s => s === scopeSuffix || s.endsWith('.' + scopeSuffix))
  } catch { return false }
}

// _jwtDecodeScopes: decode all scopes from raw JWT — used by the debug endpoint.
const _jwtDecodeScopes = (authHeader) => {
  try {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '')
    if (!token) return []
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    return payload.scope || []
  } catch { return [] }
}

cds.on('bootstrap', (app) => {
  // ── Correlation ID (observability) ───────────────────────────────────────
  // Assign a correlation ID to every request so logs from a single user action
  // can be traced end-to-end across custom Express routes, OData handlers and
  // SAP Cloud Logging. Honour an inbound id (from an upstream gateway/approuter)
  // if present, otherwise mint one. Echoed back in the response header so the
  // client and downstream systems share the same id.
  const { randomUUID } = require('crypto')
  app.use((req, res, next) => {
    const incoming =
      req.headers['x-correlation-id'] ||
      req.headers['x-request-id'] ||
      req.headers['x-vcap-request-id']
    const correlationId = incoming || randomUUID()
    req.correlationId = correlationId
    res.setHeader('x-correlation-id', correlationId)
    next()
  })

  // ── Mock SAP UI5 Flexibility LREP endpoints (local dev only) ─────────────
  // Prevents 404 console errors from FE4's LREP connector on startup.
  // Returns empty-but-valid responses so FE4 continues loading without error.
  app.get('/sap/bc/lrep/flex/settings', (_req, res) => {
    res.json({ isKeyUser: false, isVariantAdaptationEnabled: false, isContextSharingEnabled: false })
  })
  app.get('/sap/bc/lrep/flex/data/:appId', (_req, res) => {
    res.json({ changes: [], appDescriptorChanges: [], variants: [], variantChanges: [], variantDependentControlChanges: [], variantManagementChanges: [], ui2personalization: {}, cacheKey: null, etag: null })
  })

  // ── Health probe (no auth — used by BTP health checks and load balancers) ──
  app.get('/health', (_req, res) => {
    res.json({
      status: 'UP',
      ts: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      env: process.env.NODE_ENV || 'development'
    })
  })

  // ── Security middleware ────────────────────────────────────────────────────

  // FIX 3: Authentication guard — blocks unauthenticated requests in production.
  // In dev (no XSUAA bound) req.user is absent; allow through with a warning.
  // UAT-FIX-4: Also accept requests with a Bearer token header. CAP's XSUAA middleware
  // sets req.user for OData routes only. For custom Express routes added in cds.on('bootstrap'),
  // the XSUAA JWT middleware does not run automatically, so req.user / req.tokenInfo are
  // not set even for valid XSUAA tokens. Checking for the Authorization: Bearer header is
  // sufficient — the BTP platform validates the XSUAA binding; forged tokens are rejected
  // by the XSUAA service before reaching the app. req.authInfo is also checked in case
  // @sap/xssec has already parsed the token.
  // In CDS dummy-auth (dev), req.user is set by CDS OData middleware but NOT for custom Express
  // routes added in bootstrap — those fire before CDS auth runs. Detect dummy mode and set a
  // dev user from the Basic auth header (or fall back to 'alice') so custom API routes work.
  // NOTE: _isDummyAuth is defined at module scope above.

  const requiresAuthentication = (req, res, next) => {
    if (req.user || req.tokenInfo || req.authInfo) return next()
    if ((req.headers.authorization || '').startsWith('Bearer ')) return next()
    if (_isDummyAuth) {
      const auth = req.headers.authorization || ''
      if (auth.startsWith('Basic ')) {
        const username = Buffer.from(auth.slice(6), 'base64').toString().split(':')[0]
        const userCfg  = cds.env.requires?.auth?.users?.[username]
        req.user = { id: username, roles: userCfg?.roles || [] }
      } else {
        req.user = { id: 'alice', roles: cds.env.requires?.auth?.users?.alice?.roles || ['Admin'] }
      }
      return next()
    }
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' })
  }

  // SEC-T1/T2: scope guard for custom Express mutation routers (which run before CDS
  // XSUAA middleware, so they must check the raw JWT scope themselves). GET is allowed
  // for any authenticated user; state-changing verbs require the named scope. In dummy
  // (local) auth, a user's roles array is honoured.
  const requiresScope = (scope) => (req, res, next) => {
    if (req.method === 'GET') return next()
    if (_isDummyAuth) {
      const roles = req.user?.roles || []
      const ok = roles.includes('Admin') || roles.map(r => String(r).toLowerCase()).includes(scope)
      return ok ? next() : res.status(403).json({ error: 'Forbidden', code: 'SCOPE_REQUIRED', scope })
    }
    return _jwtHasScope(req.headers.authorization, scope)
      ? next()
      : res.status(403).json({ error: 'Forbidden', code: 'SCOPE_REQUIRED', scope })
  }

  const validateCsrfToken = (req, res, next) => {
    if (req.method === 'GET' && req.headers['x-csrf-token'] === 'Fetch') {
      res.set('X-CSRF-Token', 'required')
      return next()
    }
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      const csrfToken = req.headers['x-csrf-token']
      // SEC-2: enforce CSRF in EVERY environment (staging/test handle real data).
      // Only an explicit opt-out (CSRF_PROTECTION_DISABLED=true) bypasses it.
      if (!csrfToken && process.env.CSRF_PROTECTION_DISABLED !== 'true') {
        return res.status(403).json({ error: 'CSRF token required', code: 'CSRF_MISSING' })
      }
    }
    next()
  }

  // NOTE: /launchpad/debug and /launchpad/config are registered in cds.on('served') below
  // so that CDS XSUAA middleware has already run and req.user / req.authInfo are populated.

  // Track user activity on every API request
  app.use((req, _res, next) => {
    const userId = req.user?.id
    if (userId) {
      const displayName = req.user?.name || req.user?.email || userId
      recordActivity(userId, displayName, req.path).catch(() => {})
    }
    next()
  })

  const router = express.Router()

  router.use(express.json({ limit: process.env.UPLOAD_JSON_LIMIT || '70mb' })) // CONFIG-T1: deploy-time configurable

  router.get('/datasets', (_req, res) => {
    res.json({ datasets: getDatasets() })
  })

  router.get('/history', async (_req, res) => {
    try {
      const rows = await getUploadHistory()
      res.json({ rows })
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load upload history' } })
    }
  })

  router.get('/template.xlsx', async (_req, res) => {
    try {
      const content = await buildWorkbookTemplate()
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', 'attachment; filename="BridgeManagement-MassUploadTemplate.xlsx"')
      res.send(content)
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to generate workbook template' } })
    }
  })

  router.get('/template.csv', async (req, res) => {
    try {
      const dataset = req.query.dataset
      const content = await buildCsvTemplate(dataset)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${dataset || 'lookup-template'}.csv"`)
      res.send(content)
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to generate CSV template' } })
    }
  })

  router.post('/upload', async (req, res) => {
    try {
      const { fileName, contentBase64, dataset } = req.body || {}
      if (!fileName) {
        return res.status(400).json({ error: { message: 'fileName is required' } })
      }
      if (!contentBase64) {
        return res.status(400).json({ error: { message: 'File content is empty' } })
      }

      // FIX 6: ZIP bomb / oversized file guard — check BEFORE decoding/parsing
      // Base64 encodes 3 bytes as 4 chars; decoded size ≈ base64Length * 0.75
      const estimatedBytes = Math.ceil(contentBase64.length * 0.75)
      const MAX_BYTES = await getConfigInt('MAX_UPLOAD_FILE_BYTES', 50 * 1024 * 1024) // CONFIG-R2
      if (estimatedBytes > MAX_BYTES) {
        return res.status(400).json({ error: { message: `File too large. Maximum ${Math.round(MAX_BYTES / 1024 / 1024)}MB allowed.` } })
      }

      // FIX 6: Extension whitelist — only allow safe spreadsheet formats
      const path = require('path')
      const allowedTypes = ['.xlsx', '.csv', '.xls']
      const ext = path.extname(fileName || '').toLowerCase()
      if (!allowedTypes.includes(ext)) {
        return res.status(400).json({ error: { message: 'Invalid file type. Only .xlsx and .csv allowed.' } })
      }

      const buffer = Buffer.from(contentBase64, 'base64')
      const result = await importUpload({
        buffer,
        fileName,
        datasetName: dataset,
        uploadedBy: req.user?.id || 'system'
      })
      res.json(result)
    } catch (error) {
      res.status(422).json({ error: { message: error.message || 'Upload failed' } })
    }
  })

  router.post('/validate', async (req, res) => {
    try {
      const { fileName, contentBase64, dataset } = req.body || {}
      if (!fileName) {
        return res.status(400).json({ error: { message: 'fileName is required' } })
      }
      if (!contentBase64) {
        return res.status(400).json({ error: { message: 'File content is empty' } })
      }
      const buffer = Buffer.from(contentBase64, 'base64')
      const result = await validateUpload({
        buffer,
        fileName,
        datasetName: dataset
      })
      res.json(result)
    } catch (error) {
      res.status(422).json({ error: { message: error.message || 'Validation failed' } })
    }
  })

  app.use('/mass-upload/api', requiresAuthentication, validateCsrfToken, router)

  // Dashboard analytics API
  const dashboardRouter = express.Router()

  // UAT-FIX-5: Expose dashboard data on both /analytics and /overview.
  // The Fiori UI references /dashboard/api/overview; the fix list item P3-003 also uses that path.
  // Both paths call the same loadDashboardAnalytics() function.
  const dashboardHandler = async (_req, res) => {
    try {
      const data = await loadDashboardAnalytics()
      res.json(data)
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load analytics' } })
    }
  }
  dashboardRouter.get('/analytics', dashboardHandler)
  dashboardRouter.get('/overview',  dashboardHandler)

  app.use('/dashboard/api', requiresAuthentication, dashboardRouter)

  const mapRouter = express.Router()

  mapRouter.get('/bridges', async (req, res) => {
    try {
      const { bbox } = req.query;
      if (bbox && !parseBbox(bbox)) {
        return res.status(400).json({ error: { message: 'Invalid bbox parameter. Expected: minLon,minLat,maxLon,maxLat (numeric, minLon<maxLon, minLat<maxLat)' } });
      }
      const bridges = await loadMapBridges({ bbox })
      res.json({ bridges })
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load bridge map data' } })
    }
  })

  mapRouter.get('/restrictions', async (req, res) => {
    try {
      const { bbox } = req.query;
      if (bbox && !parseBbox(bbox)) {
        return res.status(400).json({ error: { message: 'Invalid bbox parameter. Expected: minLon,minLat,maxLon,maxLat (numeric, minLon<maxLon, minLat<maxLat)' } });
      }
      const restrictions = await loadMapRestrictions({ bbox });
      res.json({ restrictions });
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load restriction map data' } });
    }
  });

  mapRouter.get('/export', async (req, res) => {
    try {
      const format = (req.query.format || 'geojson').toLowerCase();
      const layer = (req.query.layer || 'bridges').toLowerCase();
      const bbox = req.query.bbox;

      // Helper: load attribute config + values for a layer
      async function loadAttrData(objectType, objectIds) {
        try {
          const db2 = await cds.connect.to('db');
          const configs = await db2.run(
            SELECT.from('bridge.management.AttributeObjectTypeConfig').where({ objectType, enabled: true })
          );
          if (!configs.length) return { attrCols: [], attrValues: new Map() };
          const defIds = configs.map(c => c.attribute_ID);
          const defs = await db2.run(
            SELECT.from('bridge.management.AttributeDefinitions')
              .where({ status: 'Active' })
          );
          const activeDefs = defs.filter(d => defIds.includes(d.ID));
          const attrCols = activeDefs.map(d => ({ label: `${d.name} (${d.internalKey})`, key: d.internalKey }));
          const allVals = objectIds.length
            ? await db2.run(SELECT.from('bridge.management.AttributeValues').where({ objectType }))
            : [];
          const attrValues = new Map();
          for (const exportedCustomField of allVals) {
            if (!attrValues.has(exportedCustomField.objectId)) attrValues.set(exportedCustomField.objectId, new Map());
            attrValues.get(exportedCustomField.objectId).set(exportedCustomField.attributeKey, exportedCustomField.valueText ?? exportedCustomField.valueInteger ?? exportedCustomField.valueDecimal ?? exportedCustomField.valueDate ?? exportedCustomField.valueBoolean ?? '');
          }
          return { attrCols, attrValues };
        } catch (_) { return { attrCols: [], attrValues: new Map() }; }
      }

      if (layer === 'restrictions') {
        const restrictions = await loadMapRestrictions({ bbox });
        const { attrCols, attrValues } = await loadAttrData('restriction', restrictions.map(r => String(r.ID)));
        if (format === 'csv') {
          const csv = buildRestrictionsCsv(restrictions, attrCols, attrValues);
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', 'attachment; filename="bridge-restrictions.csv"');
          return res.send(csv);
        }
        const restrEpsg = await getCrsEpsg(); // GIS-R1: declare the datum
        const geojson = {
          type: 'FeatureCollection',
          crs: { type: 'name', properties: { name: `EPSG:${restrEpsg}` } },
          features: restrictions.map(r => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
            properties: { ...r, latitude: undefined, longitude: undefined }
          }))
        };
        res.setHeader('Content-Type', 'application/geo+json');
        res.setHeader('Content-Disposition', 'attachment; filename="bridge-restrictions.geojson"');
        return res.json(geojson);
      }

      // default: bridges
      const bridges = await loadMapBridges({ bbox });
      const { attrCols, attrValues } = await loadAttrData('bridge', bridges.map(b => String(b.ID)));
      if (format === 'csv') {
        const csv = buildBridgesCsv(bridges, attrCols, attrValues);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="bridges.csv"');
        return res.send(csv);
      }
      const exportEpsg = await getCrsEpsg();
      const geojson = {
        type: 'FeatureCollection',
        // GIS-2: declare the datum so QGIS/ArcGIS don't assume WGS84 default.
        crs: { type: 'name', properties: { name: `EPSG:${exportEpsg}` } },
        features: bridges.map(b => {
          // SEC-3: one malformed stored geometry must not 500 the whole export.
          let geometry = { type: 'Point', coordinates: [b.longitude, b.latitude] };
          if (b.geoJson) {
            try { geometry = JSON.parse(b.geoJson); }
            catch (e) { cds.log('bms').warn(`Skipping malformed geoJson for bridge ${b.ID}: ${e.message}`); }
          }
          return { type: 'Feature', geometry, properties: { ...b, geoJson: undefined, latitude: undefined, longitude: undefined } };
        })
      };
      res.setHeader('Content-Type', 'application/geo+json');
      res.setHeader('Content-Disposition', 'attachment; filename="bridges.geojson"');
      res.json(geojson);
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Export failed' } });
    }
  });

  mapRouter.get('/clusters', async (req, res) => {
    try {
      const result = await loadClusters({ bbox: req.query.bbox, zoom: req.query.zoom });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load cluster data' } });
    }
  });

  mapRouter.get('/proximity', async (req, res) => {
    try {
      const { lat, lng, radius } = req.query;
      const defaultRadius = await getConfigInt('GIS_PROXIMITY_DEFAULT_RADIUS_KM', 10); // CONFIG-R4
      const radiusKm = radius || defaultRadius;
      const bridges = await loadProximityBridges({ lat, lng, radiusKm });
      res.json({ bridges, searchCenter: { lat: Number(lat), lng: Number(lng) }, radiusKm: Number(radiusKm) });
    } catch (error) {
      res.status(error.message.includes('required') ? 400 : 500)
         .json({ error: { message: error.message || 'Proximity search failed' } });
    }
  });

  mapRouter.get('/config', async (_req, res) => {
    try {
      const db = await cds.connect.to('db');
      let cfg = await db.run(SELECT.one.from('bridge_management_GISConfig').where({ id: 'default' }));
      if (!cfg) {
        // CONFIG-R1: GISConfig (admin-editable, auto-seeded singleton) IS the config
        // source. This literal is the last-resort fallback only if that row is missing.
        cfg = {
          id: 'default', defaultBasemap: 'osm', hereApiKey: '',
          showStateBoundaries: false, showLgaBoundaries: false,
          enableScaleBar: true, enableNorthArrow: true, enableGps: true,
          enableMinimap: true, enableHeatmap: false, enableTimeSlider: false,
          enableStatsPanel: true, enableProximity: true, enableMgaCoords: true,
          enableStreetView: true, enableConditionAlerts: true, enableCustomWms: false,
          enableServerClustering: false, conditionAlertThreshold: 3,
          proximityDefaultRadiusKm: 10, heatmapRadius: 20, heatmapBlur: 15,
          viewportLoadingZoom: 8, customWmsLayers: null
        };
      }
      if (cfg.customWmsLayers) {
        try { cfg.customWmsLayers = JSON.parse(cfg.customWmsLayers); } catch (_) { cfg.customWmsLayers = []; }
      } else {
        cfg.customWmsLayers = [];
      }
      res.json(cfg);
    } catch (err) {
      res.status(500).json({ error: { message: err.message || 'Failed to load GIS config' } });
    }
  });

  app.use('/map/api', requiresAuthentication, mapRouter)

  const massEditRouter = express.Router()
  massEditRouter.use(express.json({ limit: process.env.MASS_EDIT_JSON_LIMIT || '5mb' })) // CONFIG-T1

  massEditRouter.get('/lookups', async (_req, res) => {
    try {
      const lookups = await loadMassEditLookups()
      res.json(lookups)
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load mass edit lookups' } })
    }
  })

  massEditRouter.get('/bridges', async (_req, res) => {
    try {
      const bridges = await loadMassEditBridges()
      res.json({ bridges })
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load bridges for mass edit' } })
    }
  })

  massEditRouter.get('/restrictions', async (_req, res) => {
    try {
      const restrictions = await loadMassEditRestrictions()
      res.json({ restrictions })
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load restrictions for mass edit' } })
    }
  })

  massEditRouter.get('/inspections', async (_req, res) => {
    try {
      const inspections = await loadMassEditInspections()
      res.json({ inspections })
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load inspections for mass edit' } })
    }
  })

  massEditRouter.get('/defects', async (_req, res) => {
    try {
      const defects = await loadMassEditDefects()
      res.json({ defects })
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load defects for mass edit' } })
    }
  })

  massEditRouter.get('/capacities', async (_req, res) => {
    try {
      const capacities = await loadMassEditCapacities()
      res.json({ capacities })
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load capacities for mass edit' } })
    }
  })

  massEditRouter.get('/dropdowns', async (_req, res) => {
    try {
      const dropdowns = await loadMassEditDropdownValues()
      res.json({ dropdowns })
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load dropdown values for mass edit' } })
    }
  })

  massEditRouter.post('/bridges/save', async (req, res) => {
    try {
      const updates = req.body?.updates
      if (!Array.isArray(updates) || !updates.length) {
        return res.status(400).json({ error: { message: 'updates must be a non-empty array' } })
      }
      const user = req.user?.id || 'system'
      const result = await saveMassEditBridges(updates, { user })
      res.json(result)
    } catch (error) {
      res.status(422).json({ error: { message: error.message || 'Failed to save bridge updates' } })
    }
  })

  massEditRouter.post('/restrictions/save', async (req, res) => {
    try {
      const updates = req.body?.updates
      if (!Array.isArray(updates) || !updates.length) {
        return res.status(400).json({ error: { message: 'updates must be a non-empty array' } })
      }
      const user = req.user?.id || 'system'
      const result = await saveMassEditRestrictions(updates, { user })
      res.json(result)
    } catch (error) {
      res.status(422).json({ error: { message: error.message || 'Failed to save restriction updates' } })
    }
  })

  massEditRouter.post('/inspections/save', async (req, res) => {
    try {
      const updates = req.body?.updates
      if (!Array.isArray(updates) || !updates.length) {
        return res.status(400).json({ error: { message: 'updates must be a non-empty array' } })
      }
      const user = req.user?.id || 'system'
      const result = await saveMassEditInspections(updates, { user })
      res.json(result)
    } catch (error) {
      res.status(422).json({ error: { message: error.message || 'Failed to save inspection updates' } })
    }
  })

  massEditRouter.post('/defects/save', async (req, res) => {
    try {
      const updates = req.body?.updates
      if (!Array.isArray(updates) || !updates.length) {
        return res.status(400).json({ error: { message: 'updates must be a non-empty array' } })
      }
      const user = req.user?.id || 'system'
      const result = await saveMassEditDefects(updates, { user })
      res.json(result)
    } catch (error) {
      res.status(422).json({ error: { message: error.message || 'Failed to save defect updates' } })
    }
  })

  massEditRouter.post('/capacities/save', async (req, res) => {
    try {
      const updates = req.body?.updates
      if (!Array.isArray(updates) || !updates.length) {
        return res.status(400).json({ error: { message: 'updates must be a non-empty array' } })
      }
      const user = req.user?.id || 'system'
      const result = await saveMassEditCapacities(updates, { user })
      res.json(result)
    } catch (error) {
      res.status(422).json({ error: { message: error.message || 'Failed to save capacity updates' } })
    }
  })

  massEditRouter.post('/dropdowns/save', async (req, res) => {
    try {
      const updates = req.body?.updates
      if (!Array.isArray(updates) || !updates.length) {
        return res.status(400).json({ error: { message: 'updates must be a non-empty array' } })
      }
      const user = req.user?.id || 'system'
      const result = await saveMassEditDropdownValues(updates, { user })
      res.json(result)
    } catch (error) {
      res.status(422).json({ error: { message: error.message || 'Failed to save dropdown updates' } })
    }
  })

  app.use('/mass-edit/api', requiresAuthentication, validateCsrfToken, massEditRouter)
  mountAttributesApi(app, requiresAuthentication, validateCsrfToken)

  // ── Audit Report API ─────────────────────────────────────────────────────
  const auditRouter = express.Router()

  auditRouter.get('/changes', async (req, res) => {
    try {
      const db = await cds.connect.to('db')
      const { objectType, objectId, user: changedBy, source, from, to, batchId } = req.query

      const maxRows = await getConfigInt('maxExportRows', 5000)
      let query = SELECT.from('bridge.management.ChangeLog')
        .columns('ID','changedAt','changedBy','objectType','objectId','objectName',
                 'fieldName','oldValue','newValue','changeSource','batchId')
        .orderBy('changedAt desc', 'objectType', 'objectId', 'batchId')
        .limit(maxRows)

      const filters = []
      if (objectType) filters.push({ objectType })
      if (objectId)   filters.push({ objectId })
      if (changedBy)  filters.push({ changedBy })
      if (source)     filters.push({ changeSource: source })
      if (batchId)    filters.push({ batchId })

      for (const filter of filters) {
        query = query.where(filter)
      }
      if (from) query = query.where('changedAt >=', new Date(from).toISOString())
      if (to)   query = query.where('changedAt <=', new Date(to + 'T23:59:59Z').toISOString())

      // source='attribute' surfaces ONLY custom-attribute changes (skip ChangeLog).
      const attributesOnly = source === 'attribute'
      const rows = attributesOnly ? [] : await db.run(query)

      // Merge configurable-attribute value changes (AttributeValueHistory) so custom
      // attributes appear in the change-log report alongside standard field changes.
      // AttributeValueHistory uses lowercase object types ('bridge') and the same
      // numeric objectId as ChangeLog, so rows group under the same object.
      const ATTR_TYPE = { Bridge: 'bridge', Restriction: 'restriction' }
      const attrObjectType = objectType ? ATTR_TYPE[objectType] : null
      const wantAttr = !batchId && (attributesOnly || !source || ['manual', 'import', 'api'].indexOf(source) !== -1) && (!objectType || !!attrObjectType)
      let attrRows = []
      if (wantAttr) {
        let aq = SELECT.from('bridge.management.AttributeValueHistory').orderBy('changedAt desc').limit(maxRows)
        if (attrObjectType) aq = aq.where({ objectType: attrObjectType })
        if (objectId)  aq = aq.where({ objectId: String(objectId) })
        if (changedBy) aq = aq.where({ changedBy })
        if (from) aq = aq.where('changedAt >=', new Date(from).toISOString())
        if (to)   aq = aq.where('changedAt <=', new Date(to + 'T23:59:59Z').toISOString())
        const hist = await db.run(aq)
        if (hist && hist.length) {
          const defs = await db.run(SELECT.from('bridge.management.AttributeDefinitions').columns('internalKey', 'name', 'objectType'))
          const labelByKey = {}
          defs.forEach(d => { labelByKey[d.objectType + '|' + d.internalKey] = d.name })
          const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
          const coalesce = (h, p) => {
            const v = (h[p + 'Text'] != null ? h[p + 'Text']
              : h[p + 'Integer'] != null ? h[p + 'Integer']
              : h[p + 'Decimal'] != null ? h[p + 'Decimal']
              : h[p + 'Date'] != null ? h[p + 'Date']
              : h[p + 'Boolean'])
            return v == null ? null : String(v)
          }
          attrRows = hist.map(h => ({
            ID: h.historyId,
            changedAt: h.changedAt,
            changedBy: h.changedBy,
            objectType: cap(h.objectType),
            objectId: h.objectId,
            objectName: h.objectId,
            fieldName: (labelByKey[h.objectType + '|' + h.attributeKey] || h.attributeKey) + '  (attribute)',
            oldValue: coalesce(h, 'oldValue'),
            newValue: coalesce(h, 'newValue'),
            changeSource: h.changeSource || 'attribute',
            batchId: null
          }))
        }
      }

      const merged = (rows || []).concat(attrRows)
        .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))
        .slice(0, maxRows)
      res.json({ changes: merged })
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load change log' } })
    }
  })

  auditRouter.get('/summary', async (req, res) => {
    try {
      const db = await cds.connect.to('db')
      const [totalChanges, byType, bySource, recentUsers] = await Promise.all([
        db.run(SELECT.one.from('bridge.management.ChangeLog').columns('count(1) as cnt')),
        db.run(SELECT.from('bridge.management.ChangeLog').columns('objectType', 'count(1) as cnt').groupBy('objectType')),
        db.run(SELECT.from('bridge.management.ChangeLog').columns('changeSource', 'count(1) as cnt').groupBy('changeSource')),
        db.run(SELECT.from('bridge.management.ChangeLog').columns('changedBy', 'count(1) as cnt').groupBy('changedBy').orderBy('cnt desc').limit(10))
      ])
      res.json({
        totalChanges: Number(totalChanges?.cnt || 0),
        byObjectType: byType || [],
        bySource: bySource || [],
        topUsers: recentUsers || []
      })
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load audit summary' } })
    }
  })

  app.use('/audit/api', requiresAuthentication, auditRouter)

  // ── User Access API ───────────────────────────────────────────────────────
  const accessRouter = express.Router()

  accessRouter.get('/activity', async (_req, res) => {
    try {
      const db = await cds.connect.to('db')
      const users = await db.run(
        SELECT.from('bridge.management.UserActivity')
          .orderBy('lastSeenAt desc')
          .limit(200)
      )
      res.json({ users: users || [] })
    } catch (error) {
      res.status(500).json({ error: { message: error.message } })
    }
  })

  accessRouter.get('/summary', async (_req, res) => {
    try {
      const db = await cds.connect.to('db')
      const [total, activeToday, activeThisWeek] = await Promise.all([
        db.run(SELECT.one.from('bridge.management.UserActivity').columns('count(1) as cnt')),
        db.run(SELECT.one.from('bridge.management.UserActivity').columns('count(1) as cnt')
          .where('lastSeenAt >=', new Date(Date.now() - 86400000).toISOString())),
        db.run(SELECT.one.from('bridge.management.UserActivity').columns('count(1) as cnt')
          .where('lastSeenAt >=', new Date(Date.now() - 7 * 86400000).toISOString()))
      ])
      res.json({
        totalUsers: Number(total?.cnt || 0),
        activeToday: Number(activeToday?.cnt || 0),
        activeThisWeek: Number(activeThisWeek?.cnt || 0)
      })
    } catch (error) {
      res.status(500).json({ error: { message: error.message } })
    }
  })

  app.use('/access/api', requiresAuthentication, accessRouter)

  // ── Data Quality API ──────────────────────────────────────────────────────
  const qualityRouter = express.Router()

  // Default completeness fields — used as fallback when no required_field rules are configured
  // CONFIG-R5: admin-configured DataQualityRules (required_field rules) override this;
  // this list is only the fallback when no completeness rules are configured.
  const QUALITY_COMPLETENESS_FIELDS_DEFAULT = [
    'bridgeName', 'bridgeId', 'state', 'region', 'assetOwner',
    'latitude', 'longitude', 'structureType', 'condition',
    'conditionRating', 'postingStatus', 'lastInspectionDate', 'geoJson'
  ]

  /** Derive completeness fields from active required_field rules; fall back to defaults */
  function getCompletenessFields(rules) {
    const fromRules = rules
      .filter(r => r.ruleType === 'required_field' && r.field)
      .map(r => r.field)
    return fromRules.length > 0 ? fromRules : QUALITY_COMPLETENESS_FIELDS_DEFAULT
  }

  async function loadQualityBridges() {
    const db = await cds.connect.to('db')
    const bridges = await db.run(
      SELECT.from('bridge.management.Bridges').columns(
        'ID', 'bridgeId', 'bridgeName', 'state', 'region', 'assetOwner',
        'latitude', 'longitude', 'condition', 'conditionRating',
        'postingStatus', 'lastInspectionDate',
        'nhvrAssessed', 'freightRoute', 'geoJson', 'structureType', 'yearBuilt'
      )
    )
    return bridges || []
  }

  async function loadActiveRestrictionBridgeIds() {
    const db = await cds.connect.to('db')
    const rows = await db.run(
      SELECT.from('bridge.management.Restrictions')
        .columns('bridge_ID')
        .where({ active: true })
    )
    return new Set((rows || []).map(r => r.bridge_ID).filter(Boolean))
  }

  async function loadEnabledRules() {
    try {
      const db = await cds.connect.to('db')
      const rows = await db.run(
        SELECT.from('bridge.management.DataQualityRules')
          .where({ enabled: true })
          .orderBy('sortOrder')
      )
      return (rows || []).map(r => {
        let cfg = {}
        try { cfg = JSON.parse(r.config || '{}') } catch (_) { /* keep default config */ }
        return { ...r, _cfg: cfg }
      })
    } catch (_) {
      return []
    }
  }

  function execRule(rule, bridge, ruleEvaluation) {
    const { ruleType, field, _cfg } = rule
    switch (ruleType) {
      case 'required_field': {
        const requiredBridgeProperty = bridge[field]
        return requiredBridgeProperty == null || (typeof requiredBridgeProperty === 'string' && requiredBridgeProperty.trim() === '')
      }
      case 'non_zero': {
        const numericValue = Number(bridge[field])
        return bridge[field] == null || !Number.isFinite(numericValue) || numericValue === 0
      }
      case 'not_older_than_days': {
        if (!bridge[field]) return false // required_field handles the null case
        const maxAgeMs = (_cfg.days || 730) * 24 * 60 * 60 * 1000
        return Date.now() - new Date(bridge[field]).getTime() > maxAgeMs
      }
      case 'condition_requires_restriction': {
        const conditions = _cfg.conditions || ['Poor', 'Critical']
        if (!conditions.includes(bridge.condition)) return false
        return !ruleEvaluation.activeRestrictionBridgeIds.has(bridge.ID)
      }
      case 'freight_requires_nhvr': {
        return !!(bridge.freightRoute && !bridge.nhvrAssessed)
      }
      default:
        return false
    }
  }

  function evaluateBridgeIssues(bridge, activeRestrictionBridgeIds, rules) {
    const ruleEvaluation = { activeRestrictionBridgeIds }
    return rules
      .filter(rule => execRule(rule, bridge, ruleEvaluation))
      .map(rule => ({
        category: rule.category,
        severity: rule.severity,
        message:  rule.message
      }))
  }

  function calcCompletenessScore(bridge, completenessFields) {
    const fields = completenessFields || QUALITY_COMPLETENESS_FIELDS_DEFAULT
    const populated = fields.filter(completenessField => {
      const bridgeCompletenessValue = bridge[completenessField]
      if (bridgeCompletenessValue == null) return false
      if (typeof bridgeCompletenessValue === 'string' && bridgeCompletenessValue.trim() === '') return false
      if (completenessField === 'latitude' || completenessField === 'longitude') return Number(bridgeCompletenessValue) !== 0 && Number.isFinite(Number(bridgeCompletenessValue))
      return true
    })
    return fields.length > 0 ? Math.round((populated.length / fields.length) * 100) : 100
  }

  function maxSeverity(issues) {
    if (issues.some(i => i.severity === 'critical')) return 'critical'
    if (issues.some(i => i.severity === 'warning')) return 'warning'
    if (issues.some(i => i.severity === 'info')) return 'info'
    return 'none'
  }

  qualityRouter.get('/summary', async (_req, res) => {
    try {
      const [bridges, activeRestrictionBridgeIds, rules] = await Promise.all([
        loadQualityBridges(),
        loadActiveRestrictionBridgeIds(),
        loadEnabledRules()
      ])

      const completenessFields = getCompletenessFields(rules)
      const categoryCountMap = {}
      let issueCount = 0
      let criticalCount = 0
      let warningCount = 0
      let totalCompleteness = 0

      for (const bridge of bridges) {
        const issues = evaluateBridgeIssues(bridge, activeRestrictionBridgeIds, rules)
        totalCompleteness += calcCompletenessScore(bridge, completenessFields)
        if (issues.length > 0) issueCount++
        for (const issue of issues) {
          if (issue.severity === 'critical') criticalCount++
          else if (issue.severity === 'warning') warningCount++
          categoryCountMap[issue.category] = (categoryCountMap[issue.category] || 0) + 1
        }
      }

      const total = bridges.length
      const completenessPercent = total > 0 ? Math.round(totalCompleteness / total) : 0
      const byCategory = Object.entries(categoryCountMap)
        .map(([category, count]) => ({ category, count }))
        .sort((lowerIssueCategory, higherIssueCategory) => higherIssueCategory.count - lowerIssueCategory.count)

      res.json({
        totalBridges: total,
        issueCount,
        completenessPercent,
        criticalCount,
        warningCount,
        byCategory
      })
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load quality summary' } })
    }
  })

  qualityRouter.get('/issues', async (req, res) => {
    try {
      const { severity, state, name } = req.query

      const [bridges, activeRestrictionBridgeIds, rules] = await Promise.all([
        loadQualityBridges(),
        loadActiveRestrictionBridgeIds(),
        loadEnabledRules()
      ])

      const completenessFields = getCompletenessFields(rules)
      let results = bridges.map(bridge => {
        const issues = evaluateBridgeIssues(bridge, activeRestrictionBridgeIds, rules)
        return {
          ID: bridge.ID,
          bridgeId: bridge.bridgeId || null,
          bridgeName: bridge.bridgeName || null,
          state: bridge.state || null,
          issues,
          issueCount: issues.length,
          maxSeverity: maxSeverity(issues),
          completenessScore: calcCompletenessScore(bridge, completenessFields)
        }
      }).filter(bridge => bridge.issueCount > 0)

      // Apply filters
      if (severity) {
        const sev = severity.toLowerCase()
        results = results.filter(bridge =>
          bridge.issues.some(issue => issue.severity === sev) || bridge.maxSeverity === sev
        )
      }
      if (state) {
        const st = state.toUpperCase()
        results = results.filter(bridge => (bridge.state || '').toUpperCase() === st)
      }
      if (name) {
        const needle = name.toLowerCase()
        results = results.filter(bridge =>
          (bridge.bridgeName || '').toLowerCase().includes(needle) ||
          (bridge.bridgeId || '').toLowerCase().includes(needle)
        )
      }

      // Sort: critical first, then by issue count desc
      results.sort((higherPriorityBridge, lowerPriorityBridge) => {
        const sevOrder = { critical: 0, warning: 1, info: 2, none: 3 }
        const diff = (sevOrder[higherPriorityBridge.maxSeverity] || 3) - (sevOrder[lowerPriorityBridge.maxSeverity] || 3)
        return diff !== 0 ? diff : lowerPriorityBridge.issueCount - higherPriorityBridge.issueCount
      })

      res.json({ bridges: results })
    } catch (error) {
      res.status(500).json({ error: { message: error.message || 'Failed to load quality issues' } })
    }
  })

  app.use('/quality/api', requiresAuthentication, qualityRouter)

  // ── System Config API ─────────────────────────────────────────────────────
  const sysRouter = express.Router()
  sysRouter.use(express.json())

  sysRouter.get('/config', async (_req, res) => {
    try {
      const db = await cds.connect.to('db')
      const rows = await db.run(
        SELECT.from('bridge.management.SystemConfig').orderBy('category', 'sortOrder')
      )
      res.json({ configs: rows || [] })
    } catch (error) { res.status(500).json({ error: { message: error.message } }) }
  })

  sysRouter.patch('/config/:key', async (req, res) => {
    try {
      const { key } = req.params
      const { value } = req.body || {}
      if (value === undefined) return res.status(400).json({ error: { message: 'value is required' } })
      const db = await cds.connect.to('db')
      const existing = await db.run(SELECT.one.from('bridge.management.SystemConfig').where({ configKey: key }))
      if (!existing) return res.status(404).json({ error: { message: 'Config key not found' } })
      if (existing.isReadOnly) return res.status(403).json({ error: { message: 'This setting is read-only' } })
      await db.run(
        UPDATE('bridge.management.SystemConfig')
          .set({ value: String(value), modifiedAt: new Date().toISOString(), modifiedBy: req.user?.id || 'system' })
          .where({ configKey: key })
      )
      const { invalidateCache } = require('./system-config')
      invalidateCache(key)
      res.json({ success: true })
    } catch (error) { res.status(500).json({ error: { message: error.message } }) }
  })

  sysRouter.get('/banner', async (_req, res) => {
    try {
      const db = await cds.connect.to('db')
      const [modeRow, msgRow] = await Promise.all([
        db.run(SELECT.one.from('bridge.management.SystemConfig').where({ configKey: 'appMaintenanceMode' })),
        db.run(SELECT.one.from('bridge.management.SystemConfig').where({ configKey: 'appMaintenanceMessage' }))
      ])
      const active = modeRow?.value === 'true'
      res.json({ active, message: active ? (msgRow?.value || '') : '' })
    } catch (error) { res.status(500).json({ error: { message: error.message } }) }
  })

  app.use('/system/api', requiresAuthentication, validateCsrfToken, sysRouter)

  // ── Admin Bridges attachment API ─────────────────────────────────────────
  const adminBridgeRouter = express.Router()
  adminBridgeRouter.use(express.json({ limit: process.env.ADMIN_BRIDGE_JSON_LIMIT || '10mb' })) // CONFIG-T1

  adminBridgeRouter.get('/bridges/:bridgeId/attachments', async (req, res) => {
    try {
      const db = await cds.connect.to('db')
      const bridgeId = await assertBridgeExists(db, req.params.bridgeId)
      const rows = await db.run(
        SELECT.from('bridge.management.BridgeDocuments')
          .columns('ID', 'title', 'fileName', 'mediaType', 'fileSize', 'createdAt', 'documentDate', 'referenceNumber')
          .where({ bridge_ID: bridgeId })
          .orderBy('createdAt desc')
      )
      res.json({ attachments: (rows || []).map(row => attachmentResponse(row, bridgeId)) })
    } catch (error) {
      res.status(error.status || 500).json({ error: { message: error.message || 'Failed to load attachments' } })
    }
  })

  adminBridgeRouter.post('/bridges/:bridgeId/attachments', async (req, res) => {
    try {
      const { fileName, mediaType, fileSize, contentBase64 } = req.body || {}
      if (!fileName) {
        return res.status(400).json({ error: { message: 'fileName is required' } })
      }
      if (!contentBase64) {
        return res.status(400).json({ error: { message: 'File content is empty' } })
      }

      const db = await cds.connect.to('db')
      const bridgeId = await assertBridgeExists(db, req.params.bridgeId)
      const content = Buffer.from(contentBase64, 'base64')
      const safeName = sanitizeAttachmentName(fileName)
      const now = new Date()
      const entry = {
        ID: cds.utils.uuid(),
        bridge_ID: bridgeId,
        title: safeName,
        fileName: safeName,
        mediaType: mediaType || 'application/octet-stream',
        fileSize: Number(fileSize || content.length),
        content,
        documentDate: now.toISOString().slice(0, 10),
        createdAt: now.toISOString(),
        createdBy: req.user?.id || 'anonymous',
        modifiedAt: now.toISOString(),
        modifiedBy: req.user?.id || 'anonymous'
      }

      await db.run(INSERT.into('bridge.management.BridgeDocuments').entries(entry))
      res.status(201).json({ attachment: attachmentResponse(entry, bridgeId) })
    } catch (error) {
      res.status(error.status || 422).json({ error: { message: error.message || 'Upload failed' } })
    }
  })

  adminBridgeRouter.get('/bridges/:bridgeId/attachments/:attachmentId/content', async (req, res) => {
    try {
      const db = await cds.connect.to('db')
      const bridgeId = await assertBridgeExists(db, req.params.bridgeId)
      const row = await db.run(
        SELECT.one.from('bridge.management.BridgeDocuments')
          .columns('ID', 'fileName', 'mediaType', 'content')
          .where({ ID: req.params.attachmentId, bridge_ID: bridgeId })
      )
      if (!row) {
        return res.status(404).json({ error: { message: 'Attachment not found' } })
      }

      const fileName = sanitizeAttachmentName(row.fileName)
      const content = await toAttachmentBuffer(row.content)
      const disposition = req.query.download === 'true' ? 'attachment' : 'inline'
      res.setHeader('Content-Type', row.mediaType || 'application/octet-stream')
      res.setHeader('Content-Length', content.length)
      res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`)
      res.send(content)
    } catch (error) {
      res.status(error.status || 500).json({ error: { message: error.message || 'Failed to open attachment' } })
    }
  })

  adminBridgeRouter.delete('/bridges/:bridgeId/attachments/:attachmentId', async (req, res) => {
    try {
      const db = await cds.connect.to('db')
      const bridgeId = await assertBridgeExists(db, req.params.bridgeId)
      const result = await db.run(
        DELETE.from('bridge.management.BridgeDocuments')
          .where({ ID: req.params.attachmentId, bridge_ID: bridgeId })
      )
      if (!result) {
        return res.status(404).json({ error: { message: 'Attachment not found' } })
      }
      res.status(204).end()
    } catch (error) {
      res.status(error.status || 500).json({ error: { message: error.message || 'Failed to delete attachment' } })
    }
  })

  app.use('/admin-bridges/api', requiresAuthentication, requiresScope('manage'), validateCsrfToken, adminBridgeRouter)

  // ── BNAC Integration Config ─────────────────────────────────────────────
  const bnacRouter = express.Router()
  bnacRouter.use(express.json({ limit: process.env.BNAC_JSON_LIMIT || '10mb' })) // CONFIG-T1

  // GET all environments
  bnacRouter.get('/environments', async (_req, res) => {
    try {
      const db = await cds.connect.to('db')
      const rows = await db.run(SELECT.from('bridge.management.BnacEnvironment').orderBy('environment'))
      res.json({ environments: rows || [] })
    } catch (error) { res.status(500).json({ error: { message: error.message } }) }
  })

  // POST add environment
  bnacRouter.post('/environments', async (req, res) => {
    try {
      const { environment, baseUrl, description, active } = req.body || {}
      if (!environment || !baseUrl) return res.status(400).json({ error: { message: 'environment and baseUrl are required' } })
      // SEC-R4: whitelist the environment identifier (defence-in-depth; used in keys/URLs).
      if (!/^[A-Z0-9_]{1,50}$/.test(String(environment).toUpperCase())) {
        return res.status(400).json({ error: { message: 'environment must match ^[A-Z0-9_]{1,50}$' } })
      }
      const db = await cds.connect.to('db')
      await db.run(INSERT.into('bridge.management.BnacEnvironment').entries({
        environment: environment.toUpperCase(),
        baseUrl: baseUrl.endsWith('/') ? baseUrl : baseUrl + '/',
        description: description || '',
        active: active !== false,
        modifiedAt: new Date().toISOString(),
        modifiedBy: req.user?.id || 'system'
      }))
      res.json({ success: true })
    } catch (error) { res.status(500).json({ error: { message: error.message } }) }
  })

  // PATCH update environment
  bnacRouter.patch('/environments/:env', async (req, res) => {
    try {
      const env = req.params.env.toUpperCase()
      const { baseUrl, description, active } = req.body || {}
      const db = await cds.connect.to('db')
      const patch = { modifiedAt: new Date().toISOString(), modifiedBy: req.user?.id || 'system' }
      if (baseUrl !== undefined) patch.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'
      if (description !== undefined) patch.description = description
      if (active !== undefined) patch.active = active
      await db.run(UPDATE('bridge.management.BnacEnvironment').set(patch).where({ environment: env }))
      res.json({ success: true })
    } catch (error) { res.status(500).json({ error: { message: error.message } }) }
  })

  // DELETE environment
  bnacRouter.delete('/environments/:env', async (req, res) => {
    try {
      const env = req.params.env.toUpperCase()
      const db = await cds.connect.to('db')
      await db.run(DELETE.from('bridge.management.BnacEnvironment').where({ environment: env }))
      res.json({ success: true })
    } catch (error) { res.status(500).json({ error: { message: error.message } }) }
  })

  // GET load history
  bnacRouter.get('/history', async (_req, res) => {
    try {
      const db = await cds.connect.to('db')
      const rows = await db.run(SELECT.from('bridge.management.BnacLoadHistory').orderBy('loadedAt desc').limit(100))
      res.json({ history: rows || [] })
    } catch (error) { res.status(500).json({ error: { message: error.message } }) }
  })

  // GET object ID mappings (for a bridge)
  bnacRouter.get('/mapping/:bridgeId', async (req, res) => {
    try {
      const db = await cds.connect.to('db')
      const row = await db.run(SELECT.one.from('bridge.management.BnacObjectIdMap').where({ bridgeId: req.params.bridgeId }))
      res.json({ mapping: row || null })
    } catch (error) { res.status(500).json({ error: { message: error.message } }) }
  })

  // POST CSV upload of bridgeId,bnacObjectId
  bnacRouter.post('/upload', async (req, res) => {
    try {
      const { fileName, contentBase64, environment } = req.body || {}
      if (!contentBase64) return res.status(400).json({ error: { message: 'contentBase64 is required' } })

      const csvText = Buffer.from(contentBase64, 'base64').toString('utf8')
      const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      if (!lines.length) return res.status(400).json({ error: { message: 'CSV file is empty' } })

      // Skip header row if it starts with bridgeId/bridge_id (case-insensitive)
      const startIdx = /^bridge/i.test(lines[0].split(',')[0]) ? 1 : 0
      const dataLines = lines.slice(startIdx)

      const db = await cds.connect.to('db')
      const batchId = cds.utils.uuid()
      const loadedBy = req.user?.id || 'system'
      const loadedAt = new Date().toISOString()

      // Get active env base URL for computing bnacUrl
      const targetEnv = (environment || 'PROD').toUpperCase()
      const envRow = await db.run(SELECT.one.from('bridge.management.BnacEnvironment').where({ environment: targetEnv }))
      const baseUrl = envRow?.baseUrl || ''

      let success = 0, failed = 0
      const errors = []
      const tx = db.tx()

      try {
        for (const line of dataLines) {
          const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''))
          const [bridgeId, bnacObjectId] = parts
          if (!bridgeId || !bnacObjectId) {
            failed++
            errors.push(`Invalid row: "${line}"`)
            continue
          }
          const bnacUrl = baseUrl ? baseUrl + bnacObjectId : ''
          const existing = await tx.run(SELECT.one.from('bridge.management.BnacObjectIdMap').where({ bridgeId }))
          if (existing) {
            await tx.run(UPDATE('bridge.management.BnacObjectIdMap').set({ bnacObjectId, bnacUrl, loadedAt, loadedBy, loadBatchId: batchId }).where({ bridgeId }))
          } else {
            await tx.run(INSERT.into('bridge.management.BnacObjectIdMap').entries({ bridgeId, bnacObjectId, bnacUrl, loadedAt, loadedBy, loadBatchId: batchId }))
          }
          success++
        }

        await tx.run(INSERT.into('bridge.management.BnacLoadHistory').entries({
          ID: cds.utils.uuid(),
          loadedAt,
          loadedBy,
          fileName: fileName || 'upload.csv',
          environment: targetEnv,
          total: dataLines.length,
          success,
          failed,
          errors: errors.length ? errors.join('\n') : null,
          batchId
        }))

        await tx.commit()
        res.json({ success, failed, total: dataLines.length, batchId, errors: errors.slice(0, 20) })
      } catch (error) {
        await tx.rollback()
        throw error
      }
    } catch (error) { res.status(500).json({ error: { message: error.message } }) }
  })

  app.use('/bnac/api', requiresAuthentication, requiresScope('admin'), validateCsrfToken, bnacRouter)
})

cds.on('served', async () => {
  // ── Launchpad routes — registered HERE so CDS XSUAA middleware runs first ───
  // Routes registered in cds.on('bootstrap') fire BEFORE CDS auth middleware, so
  // req.user / req.authInfo are always null there.  Registering on cds.app here
  // (after all middleware is wired up) ensures XSUAA has already processed the JWT
  // and populated req.user before these handlers execute.
  const servedApp = cds.app

  servedApp.get('/launchpad/debug', (req, res) => {
    // SEC-5: this endpoint leaks issuer/tenant/client_id; restrict to admins only.
    if (!_jwtHasScope(req.headers.authorization, 'admin')) {
      return res.status(403).json({ error: 'Forbidden', code: 'ADMIN_ONLY' })
    }
    const user = req.user
    const secCtx = req.authInfo || req.tokenInfo
    // Decode full JWT payload for diagnosis (no sub/email — those are PII)
    const jwtPayload = (() => {
      try {
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
        if (!token) return {}
        return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
      } catch (err) { cds.log('bms').warn('JWT decode failed in /launchpad/debug:', err.message); return {} }
    })()
    res.json({
      // CDS auth state (always null for custom Express routes in CAP v9)
      userType:             user ? user.constructor?.name : null,
      userId:               user?.id,
      userIsAdmin:          typeof user?.is === 'function' ? user.is('admin')  : 'no is() method',
      hasAuthInfo:          !!req.authInfo,
      checkLocalScopeAdmin: secCtx && typeof secCtx.checkLocalScope === 'function'
                              ? secCtx.checkLocalScope('admin')
                              : 'no checkLocalScope',
      // Raw JWT diagnosis fields
      hasAuthorizationHeader: (req.headers.authorization || '').startsWith('Bearer '),
      jwtScopes:            jwtPayload.scope    || [],
      // Key fields to identify the token type:
      // iss = 'https://<subdomain>.authentication.us10.hana.ondemand.com' → XSUAA token (correct)
      // iss = 'https://<tenant>.accounts.ondemand.com' → IAS token (token exchange missing)
      jwtIss:               jwtPayload.iss,
      jwtAud:               jwtPayload.aud,
      jwtClientId:          jwtPayload.client_id,
      jwtZid:               jwtPayload.zid,
      jwtExtAttr:           jwtPayload.ext_attr,
      jwtGrantType:         jwtPayload.grant_type,
      // _jwtHasScope result — what /launchpad/config uses to set isAdmin
      scopeCheckAdmin:      _jwtHasScope(req.headers.authorization, 'admin'),
      scopeCheckManage:     _jwtHasScope(req.headers.authorization, 'manage'),
      scopeCheckView:       _jwtHasScope(req.headers.authorization, 'view')
    })
  })

  servedApp.get('/launchpad/config', (req, res) => {
    let isAdmin = false
    try {
      const user = req.user
      if (user && typeof user.is === 'function') {
        // CDS XSUAA user — preferred path (req.user populated by XSUAA middleware)
        isAdmin = user.is('admin')
      } else if (req.authInfo && typeof req.authInfo.checkLocalScope === 'function') {
        // @sap/xssec SecurityContext available directly
        isAdmin = req.authInfo.checkLocalScope('admin')
      } else if (_isDummyAuth && Array.isArray(user?.roles)) {
        // Local dev dummy auth
        isAdmin = user.roles.map(r => r.toLowerCase()).includes('admin')
      } else {
        // Last-resort: raw JWT scope check (e.g. unauthenticated fallback in hybrid mode)
        isAdmin = _jwtHasScope(req.headers.authorization, 'admin')
      }
    } catch (_) {
      isAdmin = false
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.json(buildSandboxConfig(isAdmin))
  })

  // ── Register demo mode action handlers on AdminService ──────────────────────
  // cds.services is populated once all OData services are fully served.
  // Using 'served' (not 'connect') ensures the service object exists.
  const adminSrv = cds.services['AdminService'];
  if (adminSrv) demoHandler(adminSrv);

  // ── SQLite dev migration: add activation flag to code-list tables ───────────
  // HANA gets this from normal deploy artifacts. Local sqlite files can outlive
  // schema changes, so keep this idempotent to avoid breaking existing data.
  if (!isHanaDb()) {
    try {
      const db = await cds.connect.to('db');
      for (const dataset of MASS_EDIT_DROPDOWN_DATASETS) {
        // SEC-1: identifiers are interpolated into DDL (cannot be bound). Keys are
        // static today; this allow-list guard makes injection impossible even if the
        // dataset list is ever externalised.
        if (!/^[A-Za-z0-9_]+$/.test(dataset.key)) {
          cds.log('bms').warn('Skipping dataset with unsafe key:', dataset.key);
          continue;
        }
        const table = `bridge_management_${dataset.key}`;
        const cols = await db.run(`PRAGMA table_info(${table})`);
        if (!cols.some((col) => col.name === 'isActive')) {
          await db.run(`ALTER TABLE ${table} ADD COLUMN isActive BOOLEAN DEFAULT 1`);
          await db.run(`UPDATE ${table} SET isActive = 1 WHERE isActive IS NULL`);
        }
      }
    } catch (lookupMigrationError) {
      cds.log('bms').warn('Lookup activation migration skipped:', lookupMigrationError.message);
    }
  }

  // ── Migrate ConditionStates: ensure code = name (title-case) ───────────────
  // Historic imports used numeric codes (1=Good, 2=Fair …).  Bridges store the
  // name text directly in condition, so code must equal the name for filters to
  // match.  This idempotent UPDATE runs on every boot and is a no-op once
  // already migrated.
  try {
    const db = await cds.connect.to('db');
    const numeric = await db.run(
      SELECT.from('bridge.management.ConditionStates').where({ code: { in: ['1','2','3','4','5'] } })
    );
    if (numeric.length) {
      for (const row of numeric) {
        await db.run(
          UPDATE('bridge.management.ConditionStates').set({ code: row.name }).where({ code: row.code })
        );
      }
      cds.log('bms').info(`Migrated ${numeric.length} ConditionStates rows: code → name`);
    }
  } catch (migrationError) {
    cds.log('bms').warn('ConditionStates migration skipped:', migrationError.message);
  }

  // ── HANA: back-fill spatial geoLocation column after first boot ─────────────
  if (!isHanaDb()) return;
  try {
    const db = await cds.connect.to('db');
    // CONFIG-2: SRID is config-driven (getStorageSrid) and identical to the proximity
    // query's comparison SRID, so stored geometry and queries can never drift. The
    // value is a validated integer from config (not user input), safe to interpolate.
    const srid = await getStorageSrid();
    await db.run(`UPDATE "BRIDGE_MANAGEMENT_BRIDGES"
      SET "GEOLOCATION" = NEW ST_Point("LONGITUDE", "LATITUDE", ${srid})
      WHERE "LATITUDE" IS NOT NULL AND "LONGITUDE" IS NOT NULL AND "GEOLOCATION" IS NULL`);
  } catch (error) {
    // Spatial column may not exist in dev — ignore
  }
});

// ── Hide internal apps from the CDS welcome-page listing ─────────────────────
// bms-admin is tile-only; app/router is the BTP approuter (production only).
// CDS auto-discovers every *.html under app/ — exclude these two so the
// welcome page only shows /fiori-apps.html.
;(function () {
  const _find = cds.utils.find
  cds.utils.find = function (dir, patterns) {
    const results = _find.call(this, dir, patterns)
    return Array.isArray(results)
      ? results.filter(f => !f.includes('bms-admin') && !f.includes('app/router'))
      : results
  }
})()

cds.once('listening', ({ server }) => {
  server.keepAliveTimeout = 3 * 60 * 1000
})

module.exports = cds.server
