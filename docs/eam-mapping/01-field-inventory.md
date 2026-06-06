# Phase 1 — BIS Field Inventory

> Analysis-only — no files modified.  
> All CAP types are as declared in `db/schema.cds` and `db/schema/` unless noted.  
> i18n labels in `app/_i18n/i18n.properties` are minimal; most labels are in `@title` CDS annotations.

---

## 1.1 `Bridges` (bridge.management namespace — primary entity)

| # | Field | CAP Type | Key/Assoc | M/O | Default | UI Label (from @title) | Business Meaning |
|---|---|---|---|---|---|---|---|
| 1 | ID | Integer | KEY | M | — | — | Integer surrogate key (auto-increment) |
| 2 | descr | String(2000) | — | O | — | Description | Long-form asset description |
| 3 | bridgeId | String(40) | — | M(@assert.unique) | — | Bridge ID (auto-generated) | Business identifier; auto-generated; @Core.Computed |
| 4 | bridgeName | String(111) | — | M | — | Bridge Name | Human-readable name |
| 5 | assetClass | String(40) | — | O | — | Asset Class | Code-list ref: AssetClasses |
| 6 | route | String(111) | — | O | — | Route | Road/highway route name |
| 7 | state | String(40) | — | M | — | State | Australian state/territory; code-list ref: States |
| 8 | region | String(80) | — | O | — | Region | Admin region; code-list ref: Regions |
| 9 | lga | String(111) | — | O | — | Local Government Area (LGA) | LGA boundary name |
| 10 | routeNumber | String(40) | — | O | — | Route Number | Road route number |
| 11 | latitude | Decimal(15,6) | — | M | — | Latitude (°) | WGS84 latitude; range [-90,90] |
| 12 | longitude | Decimal(15,6) | — | M | — | Longitude (°) | WGS84 longitude; range [-180,180] |
| 13 | location | String(255) | — | O | — | Location Description | Free-text location description |
| 14 | assetOwner | String(111) | — | M | — | Asset Owner | Owning organisation |
| 15 | managingAuthority | String(111) | — | O | — | Managing Authority | Maintenance responsible party |
| 16 | structureType | String(60) | — | M | — | Structure Type | Code-list ref: StructureTypes |
| 17 | yearBuilt | Integer | — | O | — | Year Built | Construction year; range [1800,2100] |
| 18 | designLoad | String(40) | — | O | — | Design Load | Code-list ref: DesignLoads |
| 19 | designStandard | String(111) | — | O | — | Design Standard | Free text design standard description |
| 20 | clearanceHeight | Decimal(9,2) | — | O | — | Clearance Height (m) | Vertical clearance; range [0,100] |
| 21 | spanLength | Decimal(9,2) | — | O | — | Span Length (m) | Main span length; range [0.1,5000] |
| 22 | material | String(60) | — | O | — | Material | Structural material (concrete, steel, etc.) |
| 23 | spanCount | Integer | — | O | — | Number of Spans | Count of bridge spans; range [1,500] |
| 24 | totalLength | Decimal(9,2) | — | O | — | Total Length (m) | End-to-end length; range [0.1,50000] |
| 25 | deckWidth | Decimal(9,2) | — | O | — | Deck Width (m) | Carriageway width; range [0.5,200] |
| 26 | numberOfLanes | Integer | — | O | — | Number of Lanes | Total traffic lanes; range [1,20] |
| 27 | condition | String(40) | — | O | — | Condition State | Code-list ref: ConditionStates |
| 28 | conditionRating | Integer | — | O | — | Condition Rating (1–10) | Numeric condition score 1-10 |
| 29 | structuralAdequacyRating | Integer | — | O | — | Structural Adequacy Rating (1–10) | Structural adequacy score 1-10 |
| 30 | postingStatus | String(40) | — | M | — | Posting Status | Code-list ref: PostingStatuses |
| 31 | conditionStandard | String(111) | — | O | — | Condition Rating Standard | Standard used for condition rating |
| 32 | seismicZone | String(40) | — | O | — | Seismic Zone | Seismic hazard zone classification |
| 33 | asBuiltDrawingReference | String(111) | — | O | — | As-Built Drawing Reference | Drawing document reference |
| 34 | floodImmunityAriYears | Integer | — | O | — | Flood Immunity (ARI years) | Average recurrence interval for flood immunity |
| 35 | floodImpacted | Boolean | — | O | — | Flood Impacted | Whether bridge is in flood-impacted area |
| 36 | highPriorityAsset | Boolean | — | O | — | High Priority Asset | Priority flag for network management |
| 37 | remarks | LargeString | — | O | — | Remarks | General notes |
| 38 | status | String(40) | — | O | — | Bridge Status | Active/Inactive lifecycle status |
| 39 | lastInspectionDate | Date | — | O | — | Last Inspection Date | Most recent inspection date (denormalised from BridgeInspections) |
| 40 | nhvrAssessed | Boolean | — | O | — | NHVR Assessed | Whether NHVR assessment has been conducted |
| 41 | nhvrAssessmentDate | Date | — | O | — | NHVR Assessment Date | Date of NHVR assessment |
| 42 | loadRating | Decimal(9,2) | — | O | — | Load Rating (t) | Load rating in tonnes; range [0,10000] |
| 43 | pbsApprovalClass | String(40) | — | O | — | PBS Approval Class | Code-list ref: PbsApprovalClasses |
| 44 | importanceLevel | Integer | — | O | — | Importance Level (1–4) | Bridge importance classification; range [1,4] |
| 45 | averageDailyTraffic | Integer | — | O | — | Average Daily Traffic (ADT) | ADT vehicles/day; range [0,9999999] |
| 46 | heavyVehiclePercent | Decimal(5,2) | — | O | — | Heavy Vehicle Percentage (%) | % heavy vehicles; range [0,100] |
| 47 | gazetteReference | String(111) | — | O | — | Gazette Reference | Government gazette citation |
| 48 | nhvrReferenceUrl | String(255) | — | O | — | NHVR Reference URL | NHVR portal URL |
| 49 | freightRoute | Boolean | — | O | — | Freight Route | Designated freight route flag |
| 50 | overMassRoute | Boolean | — | O | — | Over Mass Route | Over-mass route flag |
| 51 | hmlApproved | Boolean | — | O | — | HML Approved | Higher Mass Limit approval flag |
| 52 | bDoubleApproved | Boolean | — | O | — | B-Double Approved | B-double vehicle approval flag |
| 53 | dataSource | String(111) | — | O | — | Data Source | Source system name |
| 54 | sourceReferenceUrl | String(255) | — | O | — | Source Reference URL | URL to source record |
| 55 | openDataReference | String(255) | — | O | — | Open Data Reference | Open data portal reference |
| 56 | sourceRecordId | String(111) | — | O | — | Source Record ID | External source system record ID |
| 57 | restriction | Association to Restrictions | ASSOC | O | — | Linked Restriction | Navigation to primary Restrictions record |
| 58 | capacities | Assoc to many BridgeCapacities | ASSOC | O | — | — | Navigation to capacity records |
| 59 | restrictions | Assoc to many BridgeRestrictions | ASSOC | O | — | — | Navigation to restriction records |
| 60 | inspections | Assoc to many BridgeInspections | ASSOC | O | — | — | Navigation to inspection records |
| 61 | defects | Assoc to many BridgeDefects | ASSOC | O | — | — | Navigation to defect records |
| 62 | attributes | Composition of many BridgeAttributes | COMP | O | — | — | Navigation to legacy EAV attributes |
| 63 | documents | Composition of many BridgeDocuments | COMP | O | — | — | Navigation to document/attachment records |
| 64 | geoJson | LargeString | — | O | — | Bridge Geometry (GeoJSON) | GeoJSON geometry for GIS display |
| 65 | conditionSummary | String(60) | — | O | — | Condition Summary | Code-list ref: ConditionSummaries |
| 66 | conditionAssessor | String(111) | — | O | — | Assessed By | Engineer who assessed condition |
| 67 | conditionReportRef | String(111) | — | O | — | Report Reference | Condition assessment report reference |
| 68 | structuralAdequacy | String(40) | — | O | — | Structural Adequacy | Code-list ref: StructuralAdequacyTypes |
| 69 | conditionNotes | LargeString | — | O | — | Condition Notes | Detailed condition assessment notes |
| **managed** | createdAt, createdBy, modifiedAt, modifiedBy | Timestamp/String | — | auto | — | Audit Trail | CAP managed mixin |

---

## 1.2 `Restrictions` (bridge.management — hierarchical)

| # | Field | CAP Type | Key/Assoc | M/O | Default | UI Label | Business Meaning |
|---|---|---|---|---|---|---|---|
| 1 | ID | UUID (cuid) | KEY | M | — | — | UUID surrogate key |
| 2 | name | String(255) | — | O | — | (hidden) | Auto-set from restrictionRef |
| 3 | descr | LargeString | — | O | — | Description | Free-text description |
| 4 | restrictionRef | String(40) | — | O | — | Restriction No. (auto-generated) | Business key RST-NNNN |
| 5 | bridgeRef | String(40) | — | M | — | Bridge | bridgeId lookup; mandatory on create |
| 6 | bridge | Association to Bridges | ASSOC | O | — | Bridge | FK to Bridges |
| 7 | restrictionCategory | String(20) | — | M | 'Permanent' | Category | Permanent/Temporary; code-list |
| 8 | restrictionType | String(40) | — | M | — | Restriction Type | Code-list ref: RestrictionTypes |
| 9 | restrictionValue | String(60) | — | M | — | Value | Restriction threshold value (free text) |
| 10 | restrictionUnit | String(20) | — | M | — | Unit | Code-list ref: RestrictionUnits |
| 11 | restrictionStatus | String(20) | — | O | 'Active' | Status | Code-list ref: RestrictionStatuses |
| 12 | appliesToVehicleClass | String(40) | — | O | — | Applies to Vehicle Class | Code-list ref: VehicleClasses |
| 13 | grossMassLimit | Decimal(9,2) | — | O | — | Gross Mass Limit (t) | GVM limit |
| 14 | axleMassLimit | Decimal(9,2) | — | O | — | Axle Mass Limit (t) | Axle limit |
| 15 | heightLimit | Decimal(9,2) | — | O | — | Height Limit (m) | Vertical clearance limit |
| 16 | widthLimit | Decimal(9,2) | — | O | — | Width Limit (m) | Width limit |
| 17 | lengthLimit | Decimal(9,2) | — | O | — | Length Limit (m) | Length limit |
| 18 | speedLimit | Integer | — | O | — | Speed Limit (km/h) | Speed restriction; range [0,130] |
| 19 | permitRequired | Boolean | — | O | false | Permit Required | Whether a permit is required |
| 20 | escortRequired | Boolean | — | O | false | Escort Required | Whether escort vehicle required |
| 21 | temporary | Boolean | — | O | false | (hidden) | Auto-derived from restrictionCategory |
| 22 | active | Boolean | — | O | true | Active | Managed by Deactivate/Reactivate actions only |
| 23 | effectiveFrom | Date | — | M | — | Effective From | Restriction validity start |
| 24 | effectiveTo | Date | — | O | — | Effective To | Restriction validity end |
| 25 | approvedBy | String(111) | — | O | — | Approved By | Approving officer name |
| 26 | direction | String(40) | — | O | 'Both' | Direction | Code-list ref: RestrictionDirections |
| 27 | enforcementAuthority | String(111) | — | O | — | Enforcement Authority | Enforcing body |
| 28 | temporaryFrom | Date | — | O | — | Temporary From | Temp restriction start |
| 29 | temporaryTo | Date | — | O | — | Temporary To | Temp restriction end |
| 30 | temporaryReason | LargeString | — | O | — | Temporary Reason | Reason for temporary restriction |
| 31 | approvalReference | String(111) | — | O | — | Approval Reference | Approval document reference |
| 32 | issuingAuthority | String(111) | — | O | — | Issuing Authority | Authority issuing the restriction |
| 33 | legalReference | String(111) | — | O | — | Gazette / Legal Reference | Legal/gazette citation |
| 34 | remarks | LargeString | — | O | — | Notes | General notes |
| 35 | parent | Association to Restrictions | ASSOC | O | — | (hidden) | Self-parent for tree hierarchy |
| 36 | children | Composition of many Restrictions | COMP | O | — | (hidden) | Child nodes in restriction tree |
| **managed** | createdAt, createdBy, modifiedAt, modifiedBy | — | — | auto | — | Audit Trail | CAP managed mixin |

---

## 1.3 `BridgeRestrictions` (bridge.management — flat, bridge-level)

Mirrors Restrictions with the same physical limit fields. Additional fields:

| Field | Type | M/O | UI Label | Business Meaning |
|---|---|---|---|---|
| bridge | Association to Bridges | M | Bridge | FK to Bridges |
| restrictionRef | String(40) | O | Reference (auto-generated) | Business key BR-NNNN |

All physical limit fields are identical to Restrictions (see 1.2 rows 13–18).

---

## 1.4 `BridgeCapacities` (bridge.management)

| # | Field | CAP Type | M/O | UI Label | Business Meaning |
|---|---|---|---|---|---|
| 1 | bridge | Assoc to Bridges | M | Bridge | FK |
| 2 | capacityType | String(40) | M | Capacity Type | AS 5100.7, AS 1170, etc. |
| 3 | grossMassLimit | Decimal(9,2) | M | Gross Mass Limit (t) | GVM; range [0,2000] |
| 4 | grossCombined | Decimal(9,2) | O | Gross Combined (t) | GCM; range [0,3000] |
| 5 | steerAxleLimit | Decimal(9,2) | O | Steer Axle (t) | range [0,200] |
| 6 | singleAxleLimit | Decimal(9,2) | O | Single Axle (t) | range [0,200] |
| 7 | tandemGroupLimit | Decimal(9,2) | O | Tandem Axle Group (t) | range [0,200] |
| 8 | triAxleGroupLimit | Decimal(9,2) | O | Tri-Axle Group (t) | range [0,200] |
| 9 | minClearancePosted | Decimal(9,2) | M | Min Clearance (posted) | range [0,100] |
| 10 | lane1Clearance | Decimal(9,2) | O | Lane 1 Clearance (m) | range [0,100] |
| 11 | lane2Clearance | Decimal(9,2) | O | Lane 2 Clearance (m) | range [0,100] |
| 12 | clearanceSurveyDate | Date | O | Survey Date | Date of clearance survey |
| 13 | clearanceSurveyMethod | String(111) | O | Survey Method | Method used for clearance survey |
| 14 | carriagewayWidth | Decimal(9,2) | O | Carriageway Width (m) | range [0,200] |
| 15 | trafficableWidth | Decimal(9,2) | O | Trafficable Width (m) | range [0,200] |
| 16 | laneWidth | Decimal(9,2) | O | Lane Width (m) | range [0,50] |
| 17 | ratingStandard | String(40) | O | Standard | e.g. AS 5100.7:2017 |
| 18 | ratingFactor | Decimal(9,4) | O | Rating Factor (RF) | range [0,10] |
| 19 | ratingEngineer | String(111) | O | Rating Engineer (NER/CPEng) | Engineer accreditation number |
| 20 | ratingDate | Date | O | Rating Date | Date rating completed |
| 21 | nextReviewDue | Date | O | Next Review Due | Scheduled review date |
| 22 | reportReference | String(111) | O | Report Reference | Assessment report reference |
| 23 | floodClosureLevel | Decimal(9,2) | O | Flood Closure Level (m AHD) | range [0,200] |
| 24 | designLife | Integer | O | Design Life (years) | range [0,200] |
| 25 | consumedLife | Decimal(9,2) | O | Consumed Life (%) | range [0,200] |
| 26 | fatigueSensitive | Boolean | O | Fatigue-Sensitive | Fatigue-sensitive structure flag |
| 27 | criticalElement | String(255) | O | Critical Element | Critical fatigue element description |
| 28 | capacityStatus | String(40) | M | Status | Code-list: CapacityStatuses |
| 29 | lastReviewedBy | String(111) | O | Last Reviewed By | Engineer name + NER/CPEng |
| 30 | statusReviewDue | Date | O | Next Review Due | Status review date |
| 31 | engineeringNotes | LargeString | O | Engineering Notes | Assessment notes |

---

## 1.5 `BridgeInspections` (bridge.management)

| Field | CAP Type | M/O | UI Label | Business Meaning |
|---|---|---|---|---|
| bridge | Assoc to Bridges | M | Bridge | FK |
| inspectionRef | String(40) | O | Inspection Ref | Auto-generated business key |
| inspectionType | String(40) | M | Inspection Type | Principal/Detailed/Routine etc. |
| inspectionDate | Date | M | Inspection Date | Date of inspection |
| inspector | String(111) | M | Inspector | Inspector name |
| accreditationLevel | Integer | O | Accreditation Level (1–4) | Inspector level; range [1,4] |
| conditionRating | Integer | O | Condition Rating | Scale 1-10; range [1,10] |
| structuralRating | Integer | O | Structural Rating | Scale 1-10; range [1,10] |
| overallGrade | String(20) | O | Overall Grade | Summary grade |
| nextInspectionDue | Date | O | Next Inspection Due | Scheduled date |
| inspectionNotes | LargeString | O | Inspection Notes | Detailed notes |
| recommendations | LargeString | O | Recommendations | Recommended actions |
| active | Boolean | O | Active | true = current record |
| defects | Assoc to many BridgeDefects | ASSOC | — | Defects raised from this inspection |

---

## 1.6 `BridgeDefects` (bridge.management)

| Field | CAP Type | M/O | UI Label | Business Meaning |
|---|---|---|---|---|
| bridge | Assoc to Bridges | M | Bridge | FK |
| inspection | Assoc to BridgeInspections | O | Inspection | FK to inspection |
| defectId | String(40) | O | Defect ID | Auto-generated business key |
| defectType | String(60) | M | Defect Type | Type classification |
| severity | Integer | M | Severity (1–4) | 1=Low…4=Critical; range [1,4] |
| urgency | Integer | M | Urgency (1–4) | 1=Low…4=Immediate; range [1,4] |
| defectDescription | LargeString | O | Defect Description | Full description |
| location | String(255) | O | Location | Location on structure |
| elementAffected | String(111) | O | Element Affected | Structural element name |
| recommendedAction | LargeString | O | Recommended Action | Repair/remediation plan |
| status | String(20) | O | Status | Open/In Progress/Closed; default 'Open' |
| targetCompletionDate | Date | O | Target Completion Date | Target closure date |
| active | Boolean | O | Active | true = open; default true |

---

## 1.7 `BridgeDocuments` (bridge.management)

| Field | CAP Type | M/O | UI Label | Business Meaning |
|---|---|---|---|---|
| bridge | Assoc to Bridges | M | — (hidden) | FK |
| documentType | String(60) | O | Attachment Type | Drawing, report, photo, etc. |
| title | String(111) | O | Title | Document title |
| documentUrl | String(500) | O | External URL | URL if externally hosted |
| fileName | String(255) | O | File Name | Uploaded file name |
| mediaType | String(100) | O | Media Type | MIME type |
| fileSize | Integer | O | File Size (bytes) | File size |
| content | LargeBinary | O | (hidden) | Binary content — served via custom API |
| referenceNumber | String(111) | O | Reference Number | Document reference |
| issuedBy | String(111) | O | Issued By | Issuing body |
| documentDate | Date | O | Attachment Date | Document date |
| expiryDate | Date | O | Expiry Date | Document expiry |
| remarks | LargeString | O | Remarks | Notes |

---

## 1.8 Configuration / Registry Entities

### `SystemConfig`

| Field | CAP Type | Business Meaning |
|---|---|---|
| configKey | String(80) KEY | Unique config key |
| category | String(40) | Export/Map/Quality/Upload/Display/Security |
| label | String(255) | Human-readable label |
| value | String(1024) | Current value |
| defaultValue | String(1024) | Factory default |
| dataType | String(20) | string/integer/decimal/boolean |
| description | LargeString | Admin help text |
| isReadOnly | Boolean | Whether UI-editable |
| sortOrder | Integer | Display order |

### `BnacEnvironment`

| Field | CAP Type | Business Meaning |
|---|---|---|
| environment | String(20) KEY | DEV/PREPROD/PROD/TEST |
| baseUrl | String(511) | BNAC system base URL |
| description | String(255) | Description |
| active | Boolean | Whether this env is active |

### `BnacObjectIdMap`

| Field | CAP Type | Business Meaning |
|---|---|---|
| bridgeId | String(40) KEY | BMS bridge business ID |
| bnacObjectId | String(111) | BNAC system object ID |
| bnacUrl | String(511) | Computed full URL |
| loadedAt, loadedBy, loadBatchId | Timestamp/String | Load audit |

---

## 1.9 EAV System Entities (attributes-schema.cds)

### `AttributeDefinitions`

| Field | CAP Type | Business Meaning |
|---|---|---|
| group | Assoc to AttributeGroups | Parent group |
| objectType | String(40) | bridge / restriction / etc. |
| name | String(111) | Display name |
| internalKey | String(80) | Immutable programmatic key |
| dataType | String(20) | Text/Integer/Decimal/Date/Boolean/SingleSelect/MultiSelect |
| unit | String(40) | Unit of measure |
| helpText | String(255) | UI help text |
| minValue, maxValue | Decimal(15,4) | Validation bounds |
| regexPattern | String(255) | Input validation pattern |

### `AttributeValues`

| Field | CAP Type | Business Meaning |
|---|---|---|
| objectType | String(40) | Object type discriminator |
| objectId | String(100) | Object instance ID |
| attributeKey | String(80) | Maps to AttributeDefinitions.internalKey |
| valueText | String(2000) | Value if dataType = Text/SingleSelect/MultiSelect |
| valueInteger | Integer | Value if dataType = Integer |
| valueDecimal | Decimal(15,4) | Value if dataType = Decimal |
| valueDate | Date | Value if dataType = Date |
| valueBoolean | Boolean | Value if dataType = Boolean |

---

## 1.10 `ChangeLog` (bridge.management)

See Section 5 of `00-app-profile.md` for full field list.

Key fields for EAM integration design:
- `objectType`: must be extended to cover EAM-linked objects
- `changeSource`: must add 'EAMSync' value
- `batchId`: can be reused for sync batch tracking
