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
      riskAssessedAt     : Timestamp;
      riskAssessedBy     : String(111);
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
      nhvrAssessed : Boolean;
      nhvrAssessmentDate : Date;
      loadRating   : Decimal(9,2);
      pbsApprovalClass : String(40);
      importanceLevel : Integer @assert.range: [1, 4];
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
}

entity BridgeCapacities : cuid, managed {
  bridge                : Association to Bridges;

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
  elementAffected     : String(111);
  recommendedAction   : LargeString;
  status              : String(20) default 'Open';
  targetCompletionDate: Date;
  active              : Boolean default true;
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
  active                   : Boolean default true;
}

entity RiskConfig {
  key factor : String(40);   // consequence | likelihood weighting factor key
  name       : String(111);
  weight     : Decimal(5,2) default 1;
  active     : Boolean default true;
}

entity RiskBand {
  key code  : String(20);    // VeryHigh | High | Medium | Low
  name      : String(40);    // display band name
  minScore  : Decimal(6,2);
  maxScore  : Decimal(6,2);
  colour    : String(20);    // semantic colour for charts
  sortOrder : Integer default 0;
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
  changeSource     : String(40);   // OData | MassEdit | MassUpload
  batchId          : String(111);  // groups all fields changed in one save
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
