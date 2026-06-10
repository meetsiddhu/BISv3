'use strict'

// ARCH-T4: CSV export builders extracted from the server.js god-file. Pure functions —
// independently unit-testable, with RFC-4180-style quoting (escape commas/quotes).

// Quote a single CSV cell when it contains a comma or a double-quote.
function csvCell (value) {
  if (value == null) return ''
  const text = String(value)
  return (text.includes(',') || text.includes('"')) ? '"' + text.replace(/"/g, '""') + '"' : text
}

// Generic builder: fixed export fields + appended custom-attribute columns.
function buildCsv (records, exportFields, customAttributeColumns = [], customFieldValuesByObjectId = new Map()) {
  const customFieldHeaders = customAttributeColumns.map((c) => c.label)
  const header = [...exportFields, ...customFieldHeaders].join(',')
  const rows = (records || []).map((record) => {
    const recordCustomFields = customFieldValuesByObjectId.get(String(record.ID)) || new Map()
    const fixedCells = exportFields.map((field) => csvCell(record[field]))
    const customCells = customAttributeColumns.map((c) => csvCell(recordCustomFields.get(c.key) || ''))
    return [...fixedCells, ...customCells].join(',')
  })
  return header + '\n' + rows.join('\n')
}

const BRIDGE_EXPORT_FIELDS = ['ID', 'bridgeId', 'bridgeName', 'state', 'latitude', 'longitude', 'postingStatus',
  'conditionRating', 'yearBuilt', 'structureType', 'route', 'region', 'clearanceHeight', 'spanLength',
  'assetOwner', 'nhvrAssessed', 'freightRoute', 'overMassRoute', 'hmlApproved', 'bDoubleApproved']

const RESTRICTION_EXPORT_FIELDS = ['ID', 'restrictionRef', 'bridgeRef', 'bridgeName', 'state', 'restrictionType',
  'restrictionCategory', 'restrictionValue', 'restrictionUnit', 'restrictionStatus',
  'grossMassLimit', 'axleMassLimit', 'heightLimit', 'widthLimit', 'lengthLimit', 'speedLimit',
  'permitRequired', 'escortRequired', 'effectiveFrom', 'effectiveTo', 'approvedBy', 'direction',
  // Previously-missing legal/authority columns + new NSW/NHVR attributes (appended — additive)
  'issuingAuthority', 'legalReference', 'approvalReference', 'enforcementAuthority',
  'temporaryFrom', 'temporaryTo', 'temporaryReason', 'remarks',
  'restrictionSeverity', 'laneAvailability', 'lanesOpen', 'lanesTotal', 'laneWidthLimit',
  'gazetteNumber', 'gazettePublicationDate', 'gazetteExpiryDate', 'reviewDueDate', 'approvalDate',
  'restrictionReason', 'detourRoute', 'conditionTrigger', 'pbsClassApplicable',
  'grossCombinationLimit', 'tandemAxleLimit', 'triAxleLimit', 'steerAxleLimit',
  'pilotVehicleCount', 'signageRequired', 'appliesToVehicleClass']

function buildBridgesCsv (bridges, customAttributeColumns = [], customFieldValuesByObjectId = new Map()) {
  return buildCsv(bridges, BRIDGE_EXPORT_FIELDS, customAttributeColumns, customFieldValuesByObjectId)
}

function buildRestrictionsCsv (restrictions, customAttributeColumns = [], customFieldValuesByObjectId = new Map()) {
  return buildCsv(restrictions, RESTRICTION_EXPORT_FIELDS, customAttributeColumns, customFieldValuesByObjectId)
}

module.exports = { csvCell, buildCsv, buildBridgesCsv, buildRestrictionsCsv, BRIDGE_EXPORT_FIELDS, RESTRICTION_EXPORT_FIELDS }
