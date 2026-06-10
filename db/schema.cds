// Bridge Management System — DB Schema Barrel
using from './schema/types';
using from './schema/core';
using from './schema/restrictions';
using from './schema/admin';
using {
  Currency,
  cuid,
  managed,
  sap
} from '@sap/cds/common';

using from './attributes-schema';

namespace bridge.management;

entity Bridges : managed {
  key ID           : Integer;
      descr        : String(2000);
      bridgeId     : String(40);
      bridgeName   : String(111);
      assetClass   : String(40);
      route        : String(111);
      state        : String(40);
      region       : String(80);
      lga          : String(111);
      routeNumber  : String(40);
      // ── Multi-modal register (Phase 1) — additive ──
      transportMode   : String(40) default 'Road';  // Road|Rail|LightRail|Pedestrian|Active|Marine|Multi (-> TransportModes)
      secondaryModes  : String(120);                 // comma list for shared structures (e.g. Road,Rail)
      network         : String(80);                  // owning network (-> Networks lookup)
      networkOperator : String(111);                 // network operator / authority
      corridor        : String(111);                 // freight / passenger corridor grouping
      // ── Risk prioritisation (Phase 2/4) — additive ──
      riskConsequence    : Integer @assert.range: [1, 5];  // 1-5 (manual when overridden, else derived)
      riskLikelihood     : Integer @assert.range: [1, 5];  // 1-5
      riskScore          : Decimal(6,2);                   // 0-100
      riskPriority       : String(20);                     // Very High | High | Medium | Low (-> RiskBand)
      riskOverride       : Boolean default false;          // engineer override of derived score
      riskOverrideReason : String(255);
      // ISO-AUDIT-007: structured override approval (who signed off the override, when).
      riskOverrideApprovedBy : String(111);
      riskOverrideApprovedAt : Timestamp;
      riskAssessedAt     : Timestamp;
      riskAssessedBy     : String(111);
      // ── ISO 55000 capital-planning extension (RISK-2/RISK-4) ──
      // Monetised exposure + RUL. All optional + assumption-flagged; the core score is
      // unchanged. expectedValueAud + estimatedRulYears are derived decision-support.
      likelyFailureCostAud : Decimal(15,2);   // estimated consequence cost of failure
      mitigationCostAud    : Decimal(15,2);   // estimated cost to remediate
      riskReductionPct     : Integer @assert.range: [0, 100];
      expectedValueAud     : Decimal(15,2);   // derived: failure-probability x likely cost
      benefitCostRatio     : Decimal(8,2);    // RISK-T4 derived: (EV x reduction%) / mitigation cost — invest when > 1
      estimatedRulYears    : Decimal(5,1);    // derived advisory RUL (assumption-based)
      assetClassStrategy : Association to AssetClassStrategy;  // governing strategy
      latitude     : Decimal(15,6) @assert.range: [-90, 90];
      longitude    : Decimal(15,6) @assert.range: [-180, 180];
      location     : String(255);
      assetOwner   : String(111);
      managingAuthority : String(111);
      structureType : String(60);
      yearBuilt    : Integer @assert.range: [1800, 2100];
      designLoad   : String(40);
      designStandard : String(111);
      clearanceHeight : Decimal(9,2);
      spanLength   : Decimal(9,2);
      material     : String(60);
      spanCount    : Integer;
      totalLength  : Decimal(9,2);
      deckWidth    : Decimal(9,2);
      numberOfLanes : Integer;
      condition    : String(40);
      conditionRating : Integer @assert.range: [1, 10];
      // ELEM-1/AUDIT-010 + FIT-002: provenance of the bridge condition + the worst element
      // rolled up from BridgeElements. conditionSource =
      // Manual | DerivedFromInspection (FIT-002 auto from latest inspection) | DerivedFromElements.
      conditionSource       : String(20) default 'Manual';
      worstElementCondition : Integer @assert.range: [1, 10];
      structuralAdequacyRating : Integer @assert.range: [1, 10];
      postingStatus : String(40);
      conditionStandard : String(111);
      seismicZone  : String(40);
      asBuiltDrawingReference : String(111);
      floodImmunityAriYears : Integer;
      floodImpacted : Boolean;
      highPriorityAsset : Boolean;
      remarks      : LargeString;
      status       : String(40);
      lastInspectionDate : Date;
      // Decision-support only (INSPECT-1/2 / R3): derived on save from
      // lastInspectionDate + the linked AssetClassStrategy.inspectionIntervalMonths.
      // EAM owns the actual maintenance plan / scheduling; this is the engineering
      // overdue signal surfaced in the risk worklist.
      nextInspectionDue  : Date;
      inspectionOverdue  : Boolean default false;
      // ISO-AUDIT-005: SAMP policy signal — true when conditionRating has reached/passed
      // the governing AssetClassStrategy.interventionThreshold (derived on save).
      policyInterventionDue : Boolean default false;
      nhvrAssessed : Boolean;
      nhvrAssessmentDate : Date;
      loadRating   : Decimal(9,2);
      // CAPA-1: which evaluation standard the load rating follows (AS5100 default for NSW;
      // scaffolds AASHTO/Eurocode for multi-country scope without replicating EAM).
      ratingStandardType : String(20) default 'AS5100'; // AS5100 | AASHTO | Eurocode | Other
      pbsApprovalClass : String(40);
      importanceLevel : Integer @assert.range: [1, 4];  // -> ImportanceLevels (NSW classification)
      averageDailyTraffic : Integer;
      heavyVehiclePercent : Decimal(5,2) @assert.range: [0, 100];
      gazetteReference : String(111);
      nhvrReferenceUrl : String(255);
      freightRoute : Boolean;
      overMassRoute : Boolean;
      hmlApproved  : Boolean;
      bDoubleApproved : Boolean;
      dataSource   : String(111);
      sourceReferenceUrl : String(255);
      openDataReference : String(255);
      sourceRecordId : String(111);
      restriction  : Association to Restrictions;
      capacities   : Association to many BridgeCapacities
                       on capacities.bridge = $self;
      restrictions : Association to many BridgeRestrictions
                       on restrictions.bridge = $self;
      inspections  : Association to many BridgeInspections
                       on inspections.bridge = $self;
      defects      : Association to many BridgeDefects
                       on defects.bridge = $self;
      attributes   : Composition of many BridgeAttributes
                       on attributes.bridge = $self;
      documents    : Composition of many BridgeDocuments
                       on documents.bridge = $self;
      geoJson      : LargeString;
      conditionSummary    : String(60);
      conditionAssessor   : String(111);
      conditionReportRef  : String(111);
      structuralAdequacy  : String(40);
      conditionNotes      : LargeString;
      // ── SAP EAM object reference (EAM-1) — this app COMPLEMENTS EAM. These point at
      // the EAM master/work objects so users deep-link out; EAM remains the system of
      // record for the functional location / equipment / work execution. ──
      eamFlocId       : String(40);   // EAM Functional Location id
      eamEquipId      : String(40);   // EAM Equipment number
      eamObjectType   : String(20);   // FLOC | EQUIPMENT | BOTH
      eamSystem       : String(40);   // EAM system identifier
      eamSyncStatus   : String(20) default 'NOT_SYNCED'; // NOT_SYNCED | SYNCED | PENDING | ERROR
      eamSyncMode     : String(20) default 'STANDALONE'; // STANDALONE | PUSH | PULL | BIDIRECTIONAL
      eamLastSyncAt   : Timestamp;
      eamLastSyncBy   : String(111);
      eamPlant            : String(4);    // EAM maintenance plant (WERKS)
      eamCompanyCode      : String(4);    // BUKRS
      eamControllingArea  : String(4);    // KOKRS — sourced from EAM; reference only
      eamOrgUnit          : String(20);   // ORGID — sourced from EAM; reference only
}

/** Hierarchically organized Restrictions */
entity Restrictions : cuid, managed {
  name                : String(255);
  descr               : LargeString;
  restrictionRef      : String(40);
  bridgeRef           : String(40);
  bridge              : Association to Bridges;
  restrictionCategory : String(20) default 'Permanent';
  restrictionType     : String(40);
  restrictionValue    : String(60);
  restrictionUnit     : String(20);
  restrictionStatus   : String(20) default 'Active';
  appliesToVehicleClass : String(40);
  grossMassLimit      : Decimal(9,2);
  axleMassLimit       : Decimal(9,2);
  heightLimit         : Decimal(9,2);
  widthLimit          : Decimal(9,2);
  lengthLimit         : Decimal(9,2);
  speedLimit          : Integer @assert.range: [0, 130];
  permitRequired      : Boolean default false;
  escortRequired      : Boolean default false;
  temporary           : Boolean default false;
  active              : Boolean default true;
  effectiveFrom       : Date;
  effectiveTo         : Date;
  approvedBy          : String(111);
  direction           : String(40) default 'Both';
  enforcementAuthority : String(111);
  temporaryFrom       : Date;
  temporaryTo         : Date;
  temporaryReason     : LargeString;
  approvalReference   : String(111);
  issuingAuthority    : String(111);
  legalReference      : String(111);
  remarks             : LargeString;
  parent   : Association to Restrictions;
  children : Composition of many Restrictions
               on children.parent = $self;
}

// COMP-008: BridgeRestrictions are MASTERED IN BIS (engineering restriction record).
// EAM sync is UNIDIRECTIONAL (BIS -> EAM push of the notification reference); BIS does not
// pull restriction master data from EAM. eamLastSyncAt records the last push timestamp.
entity BridgeRestrictions : cuid, managed {
  bridge              : Association to Bridges;
  restrictionRef      : String(40);
  name                : String(111);
  descr               : String(255);
  restrictionCategory : String(20) default 'Permanent';
  restrictionType     : String(40);
  restrictionValue    : String(60);
  restrictionUnit     : String(20);
  restrictionStatus   : String(20) default 'Active';
  appliesToVehicleClass : String(40);
  grossMassLimit      : Decimal(9,2);
  axleMassLimit       : Decimal(9,2);
  heightLimit         : Decimal(9,2);
  widthLimit          : Decimal(9,2);
  lengthLimit         : Decimal(9,2);
  speedLimit          : Integer @assert.range: [0, 130];
  permitRequired      : Boolean;
  escortRequired      : Boolean;
  temporary           : Boolean;
  active              : Boolean default true;
  effectiveFrom       : Date;
  effectiveTo         : Date;
  approvedBy          : String(111);
  direction           : String(40);
  enforcementAuthority : String(111);
  temporaryFrom       : Date;
  temporaryTo         : Date;
  temporaryReason     : LargeString;
  approvalReference   : String(111);
  issuingAuthority    : String(111);
  legalReference      : String(111);
  remarks             : LargeString;
  // ── Holistic / multi-modal restriction view (Phase 1) — additive ──
  transportMode       : String(40);   // mode the restriction applies to (-> TransportModes; defaults from bridge)
  network             : String(80);   // network context (-> Networks)
  laneAvailability    : String(40);   // fixed code list (-> LaneAvailabilityTypes)
  lanesOpen           : Integer;       // numeric lane availability for aggregation
  lanesTotal          : Integer;
  laneWidthLimit      : Decimal(9,2);  // posted lane width (m)
  restrictionSeverity : String(20);   // Critical | Major | Minor (manual; -> RestrictionSeverities)
  // EAM-R2 (complement): a posting/restriction often originates an EAM notification.
  eamNotificationId   : String(12);
  eamSyncStatus       : String(20) default 'NOT_SYNCED';
  eamLastSyncAt       : Timestamp;
}

entity BridgeCapacities : cuid, managed {
  bridge                : Association to Bridges;

  // EAM-R1 (complement): capacity assessments map to EAM measuring documents/points.
  eamMeasDocId          : String(18);
  eamMeasPointId        : String(20);
  eamSyncStatus         : String(20) default 'NOT_SYNCED';
  eamLastSyncAt         : Timestamp;   // EAM-T1: symmetric sync-audit field

  // ── General ─────────────────────────────────────────────────────────────
  capacityType          : String(40);     // e.g. AS 5100.7, AS 1170

  // ── Mass Limits (tonnes) ─────────────────────────────────────────────────
  grossMassLimit        : Decimal(9,2);   // Gross Mass Limit / GVM (t)
  grossCombined         : Decimal(9,2);   // Gross Combined / GCM (t)
  steerAxleLimit        : Decimal(9,2);   // Steer Axle (t)
  singleAxleLimit       : Decimal(9,2);   // Single Axle (t)
  tandemGroupLimit      : Decimal(9,2);   // Tandem Axle Group (t)
  triAxleGroupLimit     : Decimal(9,2);   // Tri-Axle Group (t)

  // ── Vertical Clearance (metres) ──────────────────────────────────────────
  minClearancePosted    : Decimal(9,2);   // Min Clearance posted (m)
  lane1Clearance        : Decimal(9,2);   // Lane 1 Clearance (m)
  lane2Clearance        : Decimal(9,2);   // Lane 2 Clearance (m)
  clearanceSurveyDate   : Date;
  clearanceSurveyMethod : String(111);

  // ── Horizontal Geometry (metres) ─────────────────────────────────────────
  carriagewayWidth      : Decimal(9,2);   // Carriageway Width (m)
  trafficableWidth      : Decimal(9,2);   // Trafficable Width (m)
  laneWidth             : Decimal(9,2);   // Lane Width (m)

  // ── Load Rating (AS 5100.7) ──────────────────────────────────────────────
  ratingStandard        : String(40);     // e.g. AS 5100.7:2017
  ratingFactor          : Decimal(9,4);   // Rating Factor (RF)
  ratingEngineer        : String(111);    // NER/CPEng number
  ratingDate            : Date;           // Date rating completed
  nextReviewDue         : Date;
  reportReference       : String(111);

  floodClosureLevel     : Decimal(9,2);   // Flood Closure Level (m AHD)

  // ── Fatigue Life Assessment (AS 5100.7 S11) ──────────────────────────────
  designLife            : Integer;        // Design Fatigue Life (years)
  consumedLife          : Decimal(9,2);   // Consumed Life (%)
  fatigueSensitive      : Boolean;        // Fatigue-Sensitive Structure
  criticalElement       : String(255);    // Critical fatigue element

  // ── Capacity Status ───────────────────────────────────────────────────────
  capacityStatus        : String(40);     // e.g. Current, Under Review, Superseded
  lastReviewedBy        : String(111);    // Engineer name + NER/CPEng
  statusReviewDue       : Date;           // Next review due date

  // ── Engineering Notes ─────────────────────────────────────────────────────
  engineeringNotes      : LargeString;    // Assessment notes, conditions, limitations
}

entity BridgeAttributes : cuid, managed {
  bridge              : Association to Bridges;
  attributeGroup      : String(60);
  attributeName       : String(111);
  attributeValue      : String(255);
  unit                : String(40);
  source              : String(111);
  effectiveFrom       : Date;
  effectiveTo         : Date;
  remarks             : LargeString;
}

entity BridgeInspections : cuid, managed {
  bridge              : Association to Bridges;
  inspectionRef       : String(40);
  inspectionType      : String(40);
  inspectionDate      : Date;
  inspector           : String(111);
  accreditationLevel  : Integer @assert.range: [1, 4];
  conditionRating     : Integer @assert.range: [1, 10];
  structuralRating    : Integer @assert.range: [1, 10];
  overallGrade        : String(20);
  nextInspectionDue   : Date;
  inspectionNotes     : LargeString;
  recommendations     : LargeString;
  // EAM-R1 (complement): links the inspection to its EAM maintenance order. EAM executes;
  // this app holds the engineering inspection record + the reference.
  eamOrderId          : String(12);
  eamSyncStatus       : String(20) default 'NOT_SYNCED';
  eamLastSyncAt       : Timestamp;
  active              : Boolean default true;
  defects             : Association to many BridgeDefects
                          on defects.inspection = $self;
}

entity BridgeDefects : cuid, managed {
  bridge              : Association to Bridges;
  inspection          : Association to BridgeInspections;
  defectId            : String(40);
  defectType          : String(60);
  severity            : Integer @assert.range: [1, 4];
  urgency             : Integer @assert.range: [1, 4];
  defectDescription   : LargeString;
  location            : String(255);
  elementAffected     : String(111);                  // legacy free-text (kept, additive)
  element             : Association to BridgeElements; // INSPECT-4: structured element link
  recommendedAction   : LargeString;
  status              : String(20) default 'Open';     // Open | InProgress | Completed | Cancelled
  targetCompletionDate: Date;
  // INSPECT-3 (complement-EAM): the defect's remediation WORK lives in SAP EAM. We hold
  // the engineering defect + its EAM notification/order linkage; EAM executes the work.
  eamNotificationId   : String(12);
  eamWorkOrderId      : String(12);
  eamSyncStatus       : String(20) default 'NOT_SYNCED';
  eamLastSyncAt       : Timestamp;   // EAM-T2: symmetric sync-audit field
  active              : Boolean default true;
}

// NSW Level-2 element types (INSPECT-4 / EAM-4 OTEIL). Codelist.
entity ElementTypes {
  key code : String(20);   // DECK | PIER | ABUTMENT | BEARING | JOINT | GIRDER | RAILING | PAVEMENT | DRAINAGE
  name     : String(60);
  category : String(20);   // structural | functional | mechanical
  eamOteil : String(20);   // EAM object-part (OTEIL) classification code
  isActive : Boolean default true;
}

// Bridge element decomposition (INSPECT-4 / EAM-4). Supports element-level Level-2
// condition and maps to EAM equipment object-parts. Self-referencing hierarchy.
entity BridgeElements : cuid, managed {
  bridge          : Association to Bridges;
  parent          : Association to BridgeElements;
  children        : Composition of many BridgeElements on children.parent = $self;
  elementCode     : String(40);   // e.g. PIER_1, BEARING_N
  elementType     : String(20);   // -> ElementTypes.code
  description     : String(255);
  material        : String(60);
  conditionRating : Integer @assert.range: [1, 10];   // legacy 1-10 (10=best)
  eamEquipId      : String(40);   // EAM equipment id for this object-part
  active          : Boolean default true;
}

entity BridgeDocuments : cuid, managed {
  bridge              : Association to Bridges;
  documentType        : String(60);
  title               : String(111);
  documentUrl         : String(500);
  fileName            : String(255);
  mediaType           : String(100);
  fileSize            : Integer;
  @Core.MediaType: mediaType
  @Core.ContentDisposition.Filename: fileName
  @Core.ContentDisposition.Type: 'attachment'
  content             : LargeBinary;
  referenceNumber     : String(111);
  issuedBy            : String(111);
  documentDate        : Date;
  expiryDate          : Date;
  remarks             : LargeString;
}

entity AssetClasses : sap.common.CodeList {
  key code : String(40);
  isActive : Boolean default true;
}

// ── Multi-modal lookups (Phase 1) — plain code/name lists (CSV-seeded) ──
entity TransportModes {
  key code  : String(40);
  name      : String(111);
  descr     : String(255);
  sortOrder : Integer default 0;
  isActive  : Boolean default true;
}
entity Networks {
  key code  : String(80);
  name      : String(111);
  descr     : String(255);
  operator  : String(111);   // network operator / owning authority
  mode      : String(40);    // primary transport mode of this network
  isActive  : Boolean default true;
}
entity LaneAvailabilityTypes {
  key code  : String(40);
  name      : String(111);
  descr     : String(255);
  sortOrder : Integer default 0;
  isActive  : Boolean default true;
}
entity RestrictionSeverities {
  key code  : String(20);
  name      : String(111);
  descr     : String(255);
  sortOrder : Integer default 0;
  isActive  : Boolean default true;
}

// ── Risk & Asset-Class Strategy governance (Phase 4) ──
entity AssetClassStrategy : cuid, managed {
  assetClass               : String(40);   // -> AssetClasses
  transportMode            : String(40);   // strategy may differ per mode
  name                     : String(111);
  inspectionIntervalMonths : Integer;
  targetConditionRating    : Integer @assert.range: [1, 10];
  interventionThreshold    : Integer @assert.range: [1, 10];  // condition at/below which action triggers
  reviewCycleMonths        : Integer;
  description              : LargeString;
  // RISK-2: assumed condition-degradation rate (legacy points/year) for the RUL estimate.
  // Explicitly an ASSUMPTION — surfaced as advisory, not baked into the core score.
  degradationRatePerYear   : Decimal(4,2);
  // DET-1: deterioration model class. Default Linear (the transparent RUL proxy); Markov /
  // Custom are scaffolded for future per-material calibration (ChangeLog is the history feed).
  deteriorationModel       : String(20) default 'Linear'; // Linear | Markov | Custom
  // Complement-EAM: the SAP EAM maintenance plan this engineering strategy maps to.
  // EAM executes the schedule; this app holds the bridge-engineering policy + feeds it.
  eamMaintenancePlan       : String(40);
  active                   : Boolean default true;
}

entity RiskConfig {
  key factor : String(40);   // consequence | likelihood weighting factor key
  name       : String(111);
  // PRE-MORTEM MUST-FIX 12: a negative or huge weight silently distorts a scoring factor
  // fleet-wide. Bound it (additive @assert; service + importer enforce the same range).
  weight     : Decimal(5,2) default 1 @assert.range: [0, 10];
  active     : Boolean default true;
}

entity RiskBand {
  key code  : String(20);    // VeryHigh | High | Medium | Low
  name      : String(40);    // display band name
  minScore  : Decimal(6,2) @assert.range: [0, 100];  // score range is 4..100 (see risk.js)
  maxScore  : Decimal(6,2) @assert.range: [0, 100];
  colour    : String(20);    // semantic colour for charts
  sortOrder : Integer default 0;
  rationale : LargeString;   // RISK-3: documented justification for the threshold (auditable)
  reviewedBy   : String(111); // RISK-R3: calibration sign-off (who approved this threshold)
  reviewedAt   : Date;        // RISK-R3: last calibration/review date
  reviewSource : String(255); // RISK-R3: evidence reference (NSW manual / failure-data study)
  active       : Boolean default true; // ISO-AUDIT-010: historize via soft-delete (superseded thresholds kept, active=false)
}

// AUDIT-009: NSW bridge-classification codelist behind importanceLevel (1-4). Gives the
// risk consequence input a governed, documented meaning rather than a bare integer.
entity ImportanceLevels {
  key code : Integer;       // 1 (Local Access) .. 4 (State Strategic Route)
  name     : String(60);
  descr    : String(255);
  active   : Boolean default true;
}

entity States : sap.common.CodeList {
  key code : String(100);
  isActive : Boolean default true;
}

entity Regions : sap.common.CodeList {
  key code : String(80);
  isActive : Boolean default true;
}

entity StructureTypes : sap.common.CodeList {
  key code : String(60);
  isActive : Boolean default true;
}

entity DesignLoads : sap.common.CodeList {
  key code : String(40);
  isActive : Boolean default true;
}

entity PostingStatuses : sap.common.CodeList {
  key code : String(40);
  isActive : Boolean default true;
}

entity CapacityStatuses : sap.common.CodeList {
  key code : String(40);
  isActive : Boolean default true;
}

entity ConditionStates : sap.common.CodeList {
  key code : String(40);
  isActive : Boolean default true;
}

entity PbsApprovalClasses : sap.common.CodeList {
  key code : String(40);
  isActive : Boolean default true;
}

entity ConditionSummaries : sap.common.CodeList {
  key code : String(40);
  isActive : Boolean default true;
}

entity StructuralAdequacyTypes : sap.common.CodeList {
  key code : String(40);
  isActive : Boolean default true;
}

entity RestrictionTypes : sap.common.CodeList {
  key code : String(40);
  isActive : Boolean default true;
}

entity RestrictionStatuses : sap.common.CodeList {
  key code : String(20);
  isActive : Boolean default true;
}

entity VehicleClasses : sap.common.CodeList {
  key code : String(40);
  isActive : Boolean default true;
}

entity RestrictionCategories : sap.common.CodeList {
  key code : String(20);
  isActive : Boolean default true;
}

entity RestrictionUnits : sap.common.CodeList {
  key code : String(20);
  isActive : Boolean default true;
}

entity RestrictionDirections : sap.common.CodeList {
  key code : String(40);
  isActive : Boolean default true;
}

type Price : Decimal(9, 2);

// GIS configuration singleton — one record with id='default'
entity GISConfig {
  key id                      : String(40) default 'default';
  // Basemap
  defaultBasemap              : String(40) default 'osm';
  hereApiKey                  : String(255);
  // Reference layers
  showStateBoundaries         : Boolean default false;
  showLgaBoundaries           : Boolean default false;
  // Advanced feature toggles
  enableScaleBar              : Boolean default true;
  enableGps                   : Boolean default true;
  enableMinimap               : Boolean default true;
  enableHeatmap               : Boolean default false;
  enableTimeSlider            : Boolean default false;
  enableStatsPanel            : Boolean default true;
  enableProximity             : Boolean default true;
  enableMgaCoords             : Boolean default true;
  enableStreetView            : Boolean default true;
  enableConditionAlerts       : Boolean default true;
  enableCustomWms             : Boolean default false;
  enableServerClustering      : Boolean default false;
  // Thresholds / defaults
  conditionAlertThreshold     : Integer default 3;
  proximityDefaultRadiusKm    : Decimal(9, 2) default 10;
  heatmapRadius               : Integer default 20;
  heatmapBlur                 : Integer default 15;
  viewportLoadingZoom         : Integer default 8;
  // Custom WMS layers as JSON array string
  customWmsLayers             : LargeString;
}


// Change document — one row per field changed per save operation
entity ChangeLog {
  key ID           : UUID;
  changedAt        : Timestamp;
  changedBy        : String(111);
  objectType       : String(40);   // Bridge | Restriction | GISConfig | Lookup
  objectId         : String(111);
  objectName       : String(255);  // bridgeName / restrictionRef for display
  fieldName        : String(111);
  oldValue         : LargeString;
  newValue         : LargeString;
  changeSource     : String(40);   // OData | MassEdit | MassUpload | Calibration
  batchId          : String(111);  // groups all fields changed in one save
  changeReason     : LargeString;  // ISO-AUDIT-003: governance narrative / justification (e.g. risk-override reason)
}

entity UserActivity {
  key userId      : String(111);
  displayName     : String(255);
  lastSeenAt      : Timestamp;
  lastPath        : String(511);
  sessionCount    : Integer default 0;
  actionCount     : Integer default 0;
}

entity SystemConfig {
  key configKey     : String(80);
  category          : String(40);   // Export | Map | Quality | Upload | Display | Security
  label             : String(255);
  value             : String(1024);
  defaultValue      : String(1024);
  dataType          : String(20);   // string | integer | decimal | boolean
  description       : LargeString;
  isReadOnly        : Boolean default false;
  sortOrder         : Integer default 0;
  modifiedAt        : Timestamp;
  modifiedBy        : String(111);
}

entity BnacEnvironment {
  key environment  : String(20);    // DEV | PREPROD | PROD | TEST
  baseUrl          : String(511) @mandatory;
  description      : String(255);
  active           : Boolean default true;
  modifiedAt       : Timestamp;
  modifiedBy       : String(111);
}

entity BnacObjectIdMap {
  key bridgeId     : String(40);   // matches Bridges.bridgeId
  bnacObjectId     : String(111) @mandatory;
  bnacUrl          : String(511);  // computed: active env baseUrl + bnacObjectId
  loadedAt         : Timestamp;
  loadedBy         : String(111);
  loadBatchId      : String(111);
}

entity BnacLoadHistory {
  key ID           : UUID;
  loadedAt         : Timestamp;
  loadedBy         : String(111);
  fileName         : String(255);
  environment      : String(20);
  total            : Integer default 0;
  success          : Integer default 0;
  failed           : Integer default 0;
  errors           : LargeString;
  batchId          : String(111);
}

entity MassUploadLog {
  key ID           : UUID;
  uploadedAt       : Timestamp;
  uploadedBy       : String(111);
  fileName         : String(255);
  dataset          : String(80);
  datasetLabel     : String(111);
  processed        : Integer default 0;
  inserted         : Integer default 0;
  updated          : Integer default 0;
  status           : String(20) default 'Completed';
}

entity DataQualityRules {
  key id        : UUID;
      name      : String(120) not null;
      category  : String(60)  not null;
      severity  : String(10)  not null;  // critical | warning | info
      ruleType  : String(40)  not null;  // required_field | non_zero | not_older_than_days | condition_requires_restriction | freight_requires_nhvr
      field     : String(60);            // bridge field to check (null for compound rules)
      config    : LargeString;           // JSON: e.g. {"days": 730}
      message   : String(255) not null;  // violation message shown in dashboard
      enabled   : Boolean default true;
      sortOrder : Integer default 0;
}

// Configurable additional reference layers shown in the map Reference Layers panel
entity ReferenceLayerConfig : cuid, managed {
  name             : String(111) @mandatory;
  category         : String(40);   // Weather | Flood | Traffic | Geology | Infrastructure | Environment | Emergency | Administrative | Custom
  layerType        : String(20) default 'WMS';   // WMS | XYZ | ArcGISRest | GeoJSON
  url              : String(511) @mandatory;
  subLayers        : String(511);  // WMS: comma-separated layer names; ArcGIS: sublayer index
  attribution      : String(255);
  opacity          : Decimal(3,2) default 0.70;
  enabledByDefault : Boolean default false;
  active           : Boolean default true;   // show in the map panel
  sortOrder        : Integer default 0;
  description      : String(511);
  isPreset         : Boolean default false;  // system-shipped preset (non-deletable)
  wmsFormat        : String(40) default 'image/png';
  transparent      : Boolean default true;
  minZoom          : Integer default 0;
  maxZoom          : Integer default 19;
}

annotate Bridges with { bridgeId @assert.unique };

annotate Bridges with @(cds.persistence.indexes: [
    { name: 'idx_bms_bridge_bridgeId',      columns: ['bridgeId'] },
    { name: 'idx_bms_bridge_state',         columns: ['state'] },
    { name: 'idx_bms_bridge_condition',     columns: ['condition'] },
    { name: 'idx_bms_bridge_postingStatus', columns: ['postingStatus'] }
]);

annotate Restrictions with @(cds.persistence.indexes: [
    { name: 'idx_bms_restriction_bridge', columns: ['bridge_ID'] },
    { name: 'idx_bms_restriction_status', columns: ['restrictionStatus'] },
    { name: 'idx_bms_restriction_type',   columns: ['restrictionType'] }
]);

// ════════════════════════════════════════════════════════════════════════════
//  Bridge Prioritisation module (bounded, additive) — approved design (docs/prioritisation/).
//  Config-driven (rule 4). Every assessment is an IMMUTABLE, reproducible RUN stamped with the
//  exact param snapshot + version, so any past worklist replays byte-identically. The restriction
//  is a FLAG only — never in the score. Separate from RiskConfig/RiskBand (no recompute hook).
// ════════════════════════════════════════════════════════════════════════════

// Versioned parameter set for the prioritisation engine. Soft-delete via active; an edit creates
// a NEW active version (old kept active=false) affecting only FUTURE runs.
entity PrioritisationConfig : cuid, managed {
  version             : String(20);                  // e.g. 'v1'
  active              : Boolean default true;
  // criticality dimension weights (normalised to sum 1 at compute time)
  wSafety             : Decimal(6,4) default 0.35;
  wNetwork            : Decimal(6,4) default 0.25;
  wFinancial          : Decimal(6,4) default 0.15;
  wEnvironmental      : Decimal(6,4) default 0.10;
  wReputational       : Decimal(6,4) default 0.15;
  // priority-score weights (normalised to sum 1 at compute time)
  wRisk               : Decimal(6,4) default 0.40;
  wCrit               : Decimal(6,4) default 0.40;
  wStrat              : Decimal(6,4) default 0.20;
  maxResidual         : Decimal(6,2) default 25;
  maxCriticality      : Decimal(6,2) default 5;
  // strategy urgency values 0..100
  urgencyRenew        : Decimal(6,2) default 80;
  urgencyMaintain     : Decimal(6,2) default 50;
  urgencyMonitor      : Decimal(6,2) default 20;
  urgencyDecommission : Decimal(6,2) default 30;
  // 5-band ladder (P1..P5) with a 0 floor — JSON, validated on write
  bandThresholds      : String(500) default '[{"code":"P1","min":80},{"code":"P2","min":60},{"code":"P3","min":40},{"code":"P4","min":20},{"code":"P5","min":0}]';
  formulaVersion      : String(20) default 'v1-normalised';
  // Rubric anchor text per dimension per 1-5 level (council gap #3; spec-mandated). JSON:
  // { "dimSafety": {"1":"...","5":"..."}, ... } — surfaced as on-screen scoring guidance.
  rubrics             : LargeString;
  methodologyOwner    : String(111);          // governance: methodology owner (board sign-off)
  // RULE-ENGINE (Phase 1, additive): knobs may be scoped to one PrioritisationModel.
  // null = the global default row (today's behaviour — unchanged).
  modelCode           : String(40);
  notes               : LargeString;
}

// One immutable prioritisation RUN. Inputs + computed outputs + the exact param snapshot used.
// Append-only (the service grants READ,CREATE only); a correction creates a NEW run linked via
// supersededBy. Soft-delete via active. Plain persisted columns (no draft).
entity PrioritisationAssessment : cuid, managed {
  bridge                   : Association to Bridges;
  bridgeRef                : String(40);             // snapshot of bridgeId at run time
  bridgeName               : String(111);            // snapshot of the asset name at run time
  // ── Judgement inputs (1..5) ──
  dimSafety                : Integer @assert.range: [1, 5];
  dimNetwork               : Integer @assert.range: [1, 5];
  dimFinancial             : Integer @assert.range: [1, 5];
  dimEnvironmental         : Integer @assert.range: [1, 5];
  dimReputational          : Integer @assert.range: [1, 5];
  likelihood               : Integer @assert.range: [1, 5];
  likelihoodDerived        : Integer;                // engine default (condition + load)
  likelihoodOverridden     : Boolean default false;
  likelihoodOverrideReason : String(255);
  strategy                 : String(20);             // Renew | Maintain | Monitor | Decommission
  restrictionFlag          : Boolean default false;  // FLAG only — never enters the score
  // ── Computed outputs (server-side; reproducible) ──
  criticality              : Decimal(7,3);
  tier                     : Integer;                // round(criticality) clamped 1..5
  residual                 : Decimal(7,2);           // likelihood × tier
  riskN                    : Decimal(8,3);
  critN                    : Decimal(8,3);
  stratN                   : Decimal(8,3);
  priorityScore            : Decimal(6,2);
  band                     : String(10);             // P1..P5
  // ── Confidence / freshness snapshot ──
  inputsAvailable          : Integer;
  inputsTotal              : Integer;
  conditionAsAtMonths      : Integer;
  // Cost snapshot (council gap #9) — captured from the bridge at run time so the exec one-pager
  // reports the $ cost of the top decile reproducibly per immutable run.
  likelyFailureCostAud     : Decimal(15,2);
  mitigationCostAud        : Decimal(15,2);
  // G4 fleet batch scoring (additive): runs created by scoreFleet share a fleetRunId + carry the
  // full-portfolio rank; G1 user-type factor breakdown JSON for transparency.
  fleetRunId               : String(36);
  fleetRank                : Integer;
  userTypeBreakdown        : LargeString;
  // ── Reproducibility stamp ──
  configVersion            : String(20);
  formulaVersion           : String(20);
  paramSnapshot            : LargeString;            // JSON of the exact params used
  rubricSnapshot           : LargeString;            // frozen rubric wording for the chosen dim levels
  // ── RULE-ENGINE reproducibility (Phase 1, additive). null modelCode = legacy run, interpreted
  // as the seeded default model NSW-RISK-V1 (identical behaviour by construction). ──
  modelCode                : String(40);
  modelVersion             : Integer;
  weightSetHash            : String(64);             // SHA-256 of the resolved criteria+weights+bands
  criterionBreakdown       : LargeString;            // JSON: per-criterion raw, source(+as-at), score,
                                                     //   weight, confidence, contribution, missing-policy
  assessedBy               : String(111);
  assessedAt               : Timestamp;
  // ── Lifecycle ──
  supersededBy             : Association to PrioritisationAssessment;
  active                   : Boolean default true;
}

// EAM-outbound work request (bounded, additive). When an assessment is approved, an
// inspection/intervention WORK REQUEST is raised TO SAP EAM. This is a LOCAL outbound record
// (the queue + audit of the intended push) — it NEVER writes EAM master data (clean-core; EAM
// is the system of record). In STANDALONE mode it stays QUEUED; a future integration worker
// drains the queue and POSTs to EAM, stamping externalRef with the returned notification id.
entity EamWorkRequest : cuid, managed {
  assessment      : Association to PrioritisationAssessment;
  bridge          : Association to Bridges;
  bridgeRef       : String(40);
  bridgeName      : String(111);
  priorityBand    : String(10);
  priorityScore   : Decimal(6,2);
  requestType     : String(20) default 'Inspection';   // Inspection | Intervention | Review
  targetEamSystem : String(40);                         // from config (SystemConfig / bridge.eamSystem)
  eamObjectRef    : String(80);                         // FLOC/equipment the request targets (read from bridge)
  status          : String(20) default 'QUEUED';        // QUEUED | SENT | ACKNOWLEDGED | FAILED | CANCELLED
  payload         : LargeString;                        // JSON snapshot pushed (immutable record of intent)
  externalRef     : String(80);                         // EAM notification id once acknowledged
  notes           : String(500);
  raisedBy        : String(111);
  raisedAt        : Timestamp;
  active          : Boolean default true;               // soft-delete
}

// ════════════════════════════════════════════════════════════════════════════
// CONFIGURABLE PRIORITISATION RULE ENGINE (Phase 1 — additive; docs/prioritisation/
// PHASE0-RULE-ENGINE-ANALYSIS.md). Criteria, weights, value-functions, source bindings and
// aggregation rules are GOVERNED CONFIG ROWS, per asset class + transport mode. The approved
// five-dimension design is seeded as the default model NSW-RISK-V1 whose aggregation method
// 'RiskCritBlend-v1' DELEGATES to srv/lib/prioritisation.js — byte-identical, zero regression.
// All soft-delete; ChangeLog on every CUD (admin service, Phase 3); XSUAA admin writes.
// ════════════════════════════════════════════════════════════════════════════

// A versioned, governed scoring model. version is immutable once Active — a change = clone to a
// new version (mirrors PrioritisationConfig retire-on-new behaviour). Soft-delete via status.
entity PrioritisationModel : cuid, managed {
  code              : String(40);            // e.g. NSW-RISK-V1 (seeded default), RAIL-V1
  name              : String(120);
  version           : Integer default 1;
  status            : String(20) default 'Draft';   // Draft | Active | Retired
  // Named aggregation pipelines (Phase 0 Q1): RiskCritBlend-v1 = the approved formula via
  // delegation; WeightedSum / WeightedSumWithRules = the generic engine for new models.
  aggregationMethod : String(30) default 'WeightedSumWithRules';
  description       : LargeString;
  reviewedBy        : String(111);           // sign-off (mirrors RiskBand governance)
  reviewedAt        : Date;
  reviewSource      : String(255);
  criteria          : Composition of many ModelCriterion on criteria.model = $self;
  classWeights      : Composition of many AssetClassCriterionWeight on classWeights.model = $self;
  rules             : Composition of many AggregationRule on rules.model = $self;
}

// The shared criteria catalogue (rows = parameters; the standards-based pack seeds here).
entity ModelCriterion : cuid, managed {
  model        : Association to PrioritisationModel;
  code         : String(40);                 // SCOUR | LOAD_RATING | SAFETY | BHI ...
  name         : String(120);
  category     : String(24);                 // Likelihood | Consequence | Vulnerability | Criticality | Modifier
  valueType    : String(16) default 'Level1to5';   // Numeric | Discrete | Level1to5 (drives band validation + UI)
  standardRef  : String(80);                 // e.g. "FHWA NBI Item 113", "AASHTO MBE", "AS 5100.2"
  description  : LargeString;
  rubric       : LargeString;                // per-level descriptors for Manual criteria (JSON {"1":..,"5":..})
  displayOrder : Integer default 0;
  active       : Boolean default true;       // soft-delete (retire, never remove)
  bindings     : Composition of many CriterionSourceBinding on bindings.criterion = $self;
  bands        : Composition of many CriterionValueBand on bands.criterion = $self;
}

// Where the raw value resolves from. Adding a NEW parameter = bind to an AttributeDefinitions
// characteristic (sourceType=Attribute, sourceRef=internalKey) — no schema change, no deploy.
// 'Derived' selects from a TESTED code registry (estimatedRulYears, benefitCostRatio,
// conditionTrend, maxOpenDefectSeverity, minElementCondition ...): selection is config, math is code.
// 'External' (MVP, Phase 0 Q5) = Attribute-backed recorded value with provenance — no live calls.
entity CriterionSourceBinding : cuid {
  criterion  : Association to ModelCriterion;
  sourceType : String(24);   // BridgeField | Capacity | Element | Defect | Inspection | Restriction
                             //  | Attribute | Derived | Manual | External
  sourceRef  : String(120);  // field name, AttributeDefinitions.internalKey, or registry key
  unit       : String(20);
  transform  : String(120);  // optional aggregation over child rows, e.g. "min(conditionRating)"
}

// Value-function: raw value -> normalised score 0..100 (discrete XOR numeric per valueType;
// numeric bands validated non-overlapping on write — Phase 3 service).
entity CriterionValueBand : cuid {
  criterion    : Association to ModelCriterion;
  lowerBound   : Decimal(14,3);              // numeric band (null for discrete)
  upperBound   : Decimal(14,3);
  textValue    : String(60);                 // discrete band (e.g. "Scour-critical")
  score        : Decimal(6,2) @assert.range: [0, 100];
  label        : String(120);
  displayOrder : Integer default 0;
}

// Per asset class (+ transport mode) criterion selection + bounded weight. '*' wildcard mirrors
// the AssetClassStrategy seed convention. missingDataPolicy is EXPLICIT — never a silent zero.
entity AssetClassCriterionWeight : cuid {
  model             : Association to PrioritisationModel;
  assetClass        : String(40);            // -> AssetClasses ('*' = all classes)
  transportMode     : String(40);            // -> TransportModes ('*'/null = all modes)
  criterion         : Association to ModelCriterion;
  included          : Boolean default true;
  weight            : Decimal(5,2) default 1 @assert.range: [0, 10];
  missingDataPolicy : String(16) default 'flag';   // flag | neutral | penalise | exclude
}

// Non-compensatory + modifier rules — config, not code. Evaluated in priority order (Phase 2).
entity AggregationRule : cuid {
  model     : Association to PrioritisationModel;
  ruleType  : String(24);                    // SafetyFloor | Veto | Escalate | HurdleMin | ConfidenceWeight | Normalise
  criterion : Association to ModelCriterion; // trigger criterion (null = global)
  config    : LargeString;                   // JSON per ruleType, schema-validated on write (Phase 3)
  rationale : LargeString;                   // auditable justification (mandatory for safety rules)
  priority  : Integer default 0;
  active    : Boolean default true;          // soft-delete
}

// ── RULE-ENGINE G1/G2/G3/G4 (additive): customer user-type axis (TfNSW PS224353), over/under-
// bridge dimension, pre-filter eligibility gates, fleet batch-run stamps. ──
entity UserTypes : cuid, managed {                 // the 9 TfNSW customer user types (config rows)
  code      : String(40);                          // ROAD_PASS | ROAD_HV23 | ROAD_HV1 | RAIL_PASS ...
  name      : String(120);
  weighting : Decimal(5,2) default 1 @assert.range: [0, 10];  // e.g. active transport 0.5
  active    : Boolean default true;
}
// Per-criterion user-type applicability + weight, with the Over/Under-bridge axis ('*' = both).
entity UserTypeCriterionWeight : cuid {
  model      : Association to PrioritisationModel;
  criterion  : Association to ModelCriterion;
  userType   : String(40);                         // -> UserTypes.code
  overUnder  : String(10) default '*';             // Over | Under | '*'
  applicable : Boolean default true;
  weight     : Decimal(5,2) default 1 @assert.range: [0, 10];
}
// Pre-filter: excluded from prioritisation BEFORE scoring (config, with auditable rationale).
entity PrioritisationPreFilter : cuid, managed {
  code      : String(40);
  name      : String(120);
  sourceType : String(24);                         // BridgeField | Attribute
  sourceRef : String(120);
  condition : String(60);                          // e.g. "==Fauna" / "<50" (same mini-grammar as rules)
  rationale : LargeString;
  active    : Boolean default true;
}
