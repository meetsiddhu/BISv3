# Bridge Management System — SAP EAM Integration Mapping Report

| Item | Value |
|---|---|
| **Application** | Bridge Management System (BMS / BIS) |
| **Version** | 1.0.0 (package.json) |
| **CAP Version** | @sap/cds ^9 |
| **Repo Path** | `/Users/siddharthaampolu/46 Bridge info system V3/BridgeManagement` |
| **Analysis Date** | 2026-06-05 |
| **Mode** | READ-ONLY — zero application files modified |

---

## 1. Executive Summary

### Mapping Counts

| Category | Count |
|---|---|
| DIRECT field pairs | ~45 |
| CLASSIFICATION characteristic pairs | ~40 |
| BIS-LOCAL (no EAM equivalent) | ~25 |
| DERIVED (computed from EAM data) | ~8 |
| UNMAPPED / OPEN | ~5 |
| **Total BIS fields inventoried** | **~165** |

### Proposals Generated

| Type | Count |
|---|---|
| ADD NEW FIELD (on existing entities) | 17 |
| ADD NEW ENTITY | 4 |
| AMEND EXISTING | 3 |
| NEW TAB | 1 |
| CONFIG (SystemConfig keys) | 11 |
| INTEGRATION actions/service | 1 service + 5 actions |

### Top 3 Integrity Risks

1. **NUMC key format mismatch** (HIGH): EAM EQUNR (18-digit), QMNUM (12-digit), AUFNR (12-digit) are zero-padded numeric. BIS defectId/inspectionRef are String(40) alphanumeric. Transform layer required.

2. **Bridge name truncation to 40 chars** (HIGH): BIS bridgeName is String(111). EAM PLTXT/EQKTX is CHAR(40). A mandatory eamShortName field or smart truncation is required before any sync.

3. **Restriction 1:N cardinality in EAM classification** (MEDIUM): BIS allows unlimited restrictions per bridge. EAM classification stores one value per characteristic per FLOC. Multiple active restrictions will overwrite each other without a separate design (restriction-as-Equipment or multi-value class).

---

## 2. Phase Narratives

### Phase 0 — App Profile

The BMS is a mature SAP BTP CAP application with two services (AdminService at /admin-bridges, BridgeManagementService at /bridge-management), ten UI5 Fiori Elements tiles, XSUAA with three role collections, and a full draft-enabled Object Page for bridges and restrictions.

The BNAC pattern (BnacEnvironment + BnacObjectIdMap) is the only existing external-system integration. No EAM-related field, entity, or outbound service exists in the codebase — this is a greenfield integration design.

The Restrictions tile is the gold-reference UI pattern: 4-tab layout, recursive hierarchy tree, conditional field visibility, inline Deactivate/Reactivate actions. New integration tabs must replicate this pattern.

### Phase 1 — Field Inventory

165+ fields catalogued across 7 primary entities. BridgeCapacities implements the Australian AS 5100.7 load rating standard (31 fields). The EAV system (AttributeDefinitions / AttributeValues) is the right vehicle for EAM classification characteristics not yet in BIS. i18n coverage is thin — labels are in @title CDS annotations only.

### Phase 2 — EAM Mapping

| BIS Object | EAM Canonical Object |
|---|---|
| Bridges (as location) | Functional Location (TPLNR) |
| Bridges (as technical object) | Equipment (EQUNR) |
| BridgeInspections | Maintenance Order (AUFNR) |
| BridgeDefects | Maintenance Notification (QMNUM) |
| BridgeCapacities (readings) | Measurement Document |
| Restrictions | Classification characteristics |
| BridgeDocuments | Document Management (GOS/DMS) |

~45 DIRECT, ~40 CLASSIFICATION, ~25 BIS-LOCAL.

### Phase 3 — Type Reconciliation

Four issue categories: (1) NUMC zero-padding HIGH, (2) String truncation HIGH, (3) QUAN+UoM pairing MEDIUM, (4) Boolean→CHAR1 MEDIUM. Date fields (DATS) and most numeric fields are compatible.

### Phase 4 — Gap Analysis

Minimum linkage fields proposed on Bridges: eamFlocId (String 30), eamEquipId (String 18), eamSystemId, eamSyncStatus, eamLastSyncAt, eamLastSyncBy, eamSyncDirection, eamSyncMode. Similar reference blocks on BridgeInspections, BridgeDefects, BridgeCapacities. Two new entities: EAMCodeMapping and EAMSyncLog. Eleven SystemConfig keys. New XSUAA integration scope.

### Phase 5 — Dual-Mode Design

Four modes (STANDALONE / PUSH / PULL / BIDIRECTIONAL) controlled entirely by SystemConfig keys — no code branches. Integration topology: BTP Destination Service → Cloud Connector → S/4HANA PM released OData APIs. Proposed EAMIntegrationService orchestrates sync. Field ownership matrix defines SoR per field group per mode.

### Phase 6 — Third-Party ID Registry

Generic ExternalSystem registry (no hardcoded URLs) + ObjectExternalRef entity (bisObjectType, bisObjectId → externalSystem, externalId, externalUrl). Supersedes BnacObjectIdMap. UI: new External References tab on Bridge Object Page, modelled on Restrictions gold-reference pattern. EAM maps to FLOC alternative labelling.

---

## 3. Mapping Summary Table

| BIS Field | EAM Target | EAM API Property | Mapping Class | Compatible? |
|---|---|---|---|---|
| bridgeId | TPLNR | FunctionalLocation | DIRECT | PARTIAL (format) |
| bridgeName | PLTXT/EQKTX | FunctLocDescription | DIRECT | PARTIAL (40-char) |
| assetClass | FLTYP | FunctLocCategory | DIRECT | Code mapping needed |
| structureType | Classification STRUCTURE_TYPE | — | CLASSIFICATION | Y |
| yearBuilt | BAUJJ | ConstructionYear | DIRECT | Y |
| condition | Classification COND_STATE | — | CLASSIFICATION | Y |
| conditionRating | Measurement Doc | MsmtDocValue | DIRECT | Y |
| postingStatus | Classification POSTING_STATUS | — | CLASSIFICATION | Y |
| loadRating | Measurement Doc LOAD_RATING | MsmtDocValue | DIRECT | Y (QUAN+T) |
| hmlApproved | Classification HML_APPROVED | — | CLASSIFICATION | Y (Bool→CHAR1) |
| status | USTW system status | StatusObject | DIRECT | Code mapping needed |
| latitude/longitude | No EAM field | — | BIS-LOCAL | N |
| geoJson | No EAM field | — | BIS-LOCAL | N |
| nhvrReferenceUrl | No EAM field | — | BIS-LOCAL | N |
| inspectionRef | AUFNR | MaintenanceOrder | DIRECT | PARTIAL (NUMC 12) |
| inspectionDate | GSTRP | MaintOrdBasicStartDate | DIRECT | Y |
| inspectionType | ILART | MaintenanceActivityType | DIRECT | Code mapping needed |
| defectId | QMNUM | MaintenanceNotification | DIRECT | PARTIAL (NUMC 12) |
| severity | PRIOK | NotificationPriority | DIRECT | Y (1-4) |
| defectDescription | QMTXT+LTXT | MaintNotifLongText | DIRECT | Y |
| grossMassLimit | Measurement Doc | MsmtDocValue | DIRECT | Y (QUAN+T) |
| ratingFactor | Measurement Doc RF | MsmtDocValue | DIRECT | Y (Decimal) |

---

## 4. Next Steps Checklist (all PROPOSED)

| # | Item | Tag | Priority | Effort | Key Dependency |
|---|---|---|---|---|---|
| 1 | Add EAM reference block (eamFlocId, eamEquipId, eamSyncStatus, eamLastSyncAt, eamSyncMode, +3) to Bridges | [ADD] | P1 | S | OQ-01, OQ-02 |
| 2 | Add EAM order reference block to BridgeInspections | [ADD] | P1 | S | OQ-07 |
| 3 | Add EAM notification reference block to BridgeDefects | [ADD] | P1 | S | OQ-06 |
| 4 | Add EAM measurement doc reference block to BridgeCapacities | [ADD] | P2 | S | — |
| 5 | Add eamShortName (String 40) to Bridges | [ADD] | P2 | S | OQ-11 |
| 6 | Add EAMCodeMapping entity and seed initial inspection/defect code maps | [ADD] | P1 | M | OQ-05, OQ-06 |
| 7 | Add EAMSyncLog entity | [ADD] | P1 | S | — |
| 8 | Add ExternalSystem registry entity | [ADD] | P1 | S | OQ-09 |
| 9 | Add ObjectExternalRef entity | [ADD] | P1 | M | OQ-09 |
| 10 | Seed 11 EAM integration SystemConfig keys | [CONFIG] | P1 | S | OQ-04, OQ-08 |
| 11 | Add integration XSUAA scope + BMS_INTEGRATION role to xs-security.json | [AMEND] | P1 | S | OQ-08 |
| 12 | Build BTP Destination for EAM OData APIs | [INTEGRATION] | P1 | M | OQ-08 |
| 13 | Design and implement EAMIntegrationService (sync actions) | [INTEGRATION] | P2 | L | All OQ resolved |
| 14 | Add External References tab to Bridge Object Page | [NEW-TAB] | P2 | M | Items 8, 9 |
| 15 | Add i18n property keys for all new EAM fields | [AMEND] | P1 | S | Items 1–5 |
| 16 | Migrate BnacObjectIdMap data to ObjectExternalRef | [AMEND] | P3 | M | Item 9, OQ-09 |
| 17 | Add EAM-completeness DataQualityRules | [CONFIG] | P2 | S | OQ-10 |
| 18 | Document EAM characteristic class BRIDGE_RESTRICTION in EAM | [INTEGRATION] | P1 | M | OQ-03 |
| 19 | Resolve OQ-01 (FLOC vs Equipment dual-representation) | [CONFIG] | P1 | S | EAM architect |
| 20 | Add index on AttributeValues (objectType, objectId, attributeKey) | [AMEND] | P3 | S | — |

**Summary**: ADD=12, AMEND=4, NEW-TAB=1, CONFIG=3, INTEGRATION=3 | P1=11, P2=6, P3=3

---

## 5. Open Questions (12 total — see 99-open-questions.md)

| # | Question | Impact |
|---|---|---|
| OQ-01 | FLOC-only vs FLOC+Equipment for bridges | eamEquipId field necessity |
| OQ-02 | TPLNR key format/structure | eamFlocId validation |
| OQ-03 | Multiple restrictions per bridge in EAM classification | Restriction mapping design |
| OQ-04 | SAP Plant, Company Code, Controlling Area | SystemConfig seed values |
| OQ-05 | Inspection type → ILART code mapping | EAMCodeMapping data |
| OQ-06 | EAM notification type for defects (QMART) | SystemConfig EAM_NOTIFICATION_TYPE |
| OQ-07 | Direction of integration for inspections | BridgeInspections ownership |
| OQ-08 | EAM Destination authentication method | BTP Destination config |
| OQ-09 | BNAC entity deprecation timeline | Phase 6 migration scope |
| OQ-10 | DQ rules for EAM completeness | DataQualityRules seeding |
| OQ-11 | Bridge name > 40 chars strategy | eamShortName or truncation logic |
| OQ-12 | EAM GIS integration module availability | GeoJSON sync scope |
