# Bridge Information System (BIS) — Functionality & Field Reference

> Client-handover reference for the NSW Bridge Asset-Management System on SAP BTP.
> **Positioning:** a bridge-**engineering specialist** register that **complements** the
> SAP S/4HANA EAM system of record (it does not replicate maintenance execution).
> Version: v3.9.3. Stack: SAP CAP (Node 20, OData V4), Fiori Elements V4 + freestyle UI5,
> HANA Cloud, XSUAA, standalone approuter launchpad.

---

## 1. Applications (Fiori launchpad tiles)

| App / Tile | Type | Purpose | Roles |
|---|---|---|---|
| **Bridges — Asset Registry** | FE List Report + Object Page (draft) | Core multi-modal bridge register; create/change/display with audit | view / manage |
| **Dashboard — Portfolio Insights** | Freestyle UI5 | KPIs across the portfolio | view |
| **Map View — Geographic Explorer** | Freestyle UI5 + Leaflet | GIS map: point/line/polygon geometry, layers, clustering, heatmap, proximity, spatial select | view |
| **Restrictions** | FE | Active & scheduled restrictions/postings | view / manage |
| **Inspections / Defects / Bridge Capacity** | FE | Inspection events, defects (state machine), load/capacity assessments | view / manage |
| **Bridge Risk** | FE ALV (read-only) | Risk-prioritised worklist (mode-aware, RUL, expected-value, overdue) | view |
| **Network Restrictions** | FE ALV | Holistic cross-modal restriction grid (slice & dice) | view |
| **Restrictions Dashboard** | FE Analytical List Page | Multi-mode analytics (filters + chart + grouping) | view |
| **Asset Class Strategy / Risk Bands / Risk Factors** | FE | Risk + inspection governance config | admin |
| **Bridge Elements** | FE (draft) | NSW Level-2 element hierarchy (deck/pier/bearing…) + OTEIL mapping | manage |
| **Attribute Classes** | FE (draft) | Configurable custom attributes (SAP-EAM-style classification/characteristics) | admin |
| **Change Documents** | FE ALV (read-only) | Unified audit trail (field + attribute history) | admin |
| **EAM Code Mapping / EAM Field Mapping / EAM Sync Log** | FE | S/4 EAM integration config + audit (complement layer) | admin |
| **Mass Upload / Mass Edit** | Freestyle UI5 | CSV/XLSX import + in-grid bulk edit (durable audit) | manage |
| **BMS Administration** | Freestyle UI5 | System config, data quality, user activity, GIS config, BNAC | admin |

---

## 2. Core entity: **Bridges** (the asset register)

| Group | Key fields | Notes |
|---|---|---|
| **Identity** | `bridgeId` (auto BRG-…), `bridgeName`, `assetClass`, `structureType`, `status`, `postingStatus`, `highPriorityAsset` | bridgeId auto-generated per state |
| **Mode & Network** | `transportMode` (Road/Rail/LightRail/Pedestrian/Active/Marine/Multi), `secondaryModes`, `network` (→Networks), `networkOperator`, `corridor` | validated: mode must match the network's mode |
| **Risk** | `riskConsequence` (1-5), `riskLikelihood` (1-5), `riskScore` (0-100), `riskPriority` (→RiskBand), `riskOverride`+`riskOverrideReason`, `riskAssessedAt/By`, `assetClassStrategy` | mode-aware; engineer override with reason + audit |
| **Capital planning** | `likelyFailureCostAud`, `mitigationCostAud`, `riskReductionPct`, `expectedValueAud` (derived), `estimatedRulYears` (derived, assumption-flagged) | ISO 55000 monetisation (planning proxy) |
| **Inspection signal** | `lastInspectionDate`, `nextInspectionDue` (derived from strategy), `inspectionOverdue` (derived) | decision-support; EAM owns scheduling |
| **Geographic** | `latitude`, `longitude` (decimal), `geoJson` (GeoJSON: Point/Line/Polygon/Multi), `state`, `region`, `lga`, `route`, `routeNumber`, `location` | GDA2020/EPSG:7844 declared; geometry validated on ingress |
| **Ownership** | `assetOwner`, `managingAuthority`, `gazetteReference`, `dataSource`, `sourceReferenceUrl` | provenance |
| **Structure** | `yearBuilt`, `designLoad`, `designStandard`, `material`, `spanCount`, `spanLength`, `totalLength`, `deckWidth`, `clearanceHeight`, `numberOfLanes`, `designLife` | engineering attributes |
| **Condition** | `conditionRating` (legacy 1-10, 10=best), `condition` (TfNSW label), `structuralAdequacyRating`, `conditionSummary`, `conditionNotes` | single canonical mapping (`srv/lib/condition-rating.js`) |
| **NHVR / heavy-vehicle** | `importanceLevel` (1-4), `averageDailyTraffic`, `heavyVehiclePercent`, `loadRating`, `pbsApprovalClass`, `nhvrAssessed`, `hmlApproved`, `bDoubleApproved`, `freightRoute`, `overMassRoute` | NSW NHVR alignment |
| **EAM reference (complement)** | `eamFlocId`, `eamEquipId`, `eamObjectType` (FLOC/EQUIPMENT/BOTH), `eamSystem`, `eamSyncStatus`, `eamSyncMode`, `eamLastSyncAt/By`, `eamPlant`, `eamCompanyCode`, `eamControllingArea` (KOKRS), `eamOrgUnit` (ORGID) | links to EAM master/work objects; EAM is system of record |

**Operations:** draft create/edit; `deactivate`/`reactivate` (soft-delete only — no hard delete); `changeCondition`, `closeForTraffic`, `reopenForTraffic` actions; every CUD writes `ChangeLog`.

---

## 3. Restrictions & multi-modal network

**BridgeRestrictions** (holistic posting record): `restrictionType`, `restrictionValue/Unit`, `restrictionCategory`, `restrictionStatus`, `restrictionSeverity` (Critical/Major/Minor); dimensions `grossMassLimit`, `axleMassLimit`, `heightLimit`, `widthLimit`, `lengthLimit`, `speedLimit`; lanes `laneAvailability` (→LaneAvailabilityTypes), `lanesOpen/Total`, `laneWidthLimit`; multi-modal `transportMode`, `network`; lifecycle `effectiveFrom/To`, `temporaryFrom/To`, `approvalReference`, `issuingAuthority`, `legalReference`; EAM `eamNotificationId`, `eamSyncStatus`.

**Reports:** `NetworkRestrictionReport` (cross-modal join view; ALV + ALP with `$apply` group-by on mode/network/type/severity/status/risk/state); `BridgeRiskReport` (risk worklist with strategy/RUL/EV/overdue columns).

---

## 4. Inspection lifecycle (NSW Level-2)

- **BridgeInspections** — `inspectionType`, `accreditationLevel` (1-4), `inspector`, `inspectionDate`, condition/structural ratings, `nextInspectionDue`; EAM `eamOrderId`, `eamSyncStatus`.
- **BridgeDefects** — `defectType`, `severity`/`urgency` (1-4), `status` (Open→InProgress→OnHold→Completed/Cancelled — **enforced state machine**), `element` (→BridgeElements, same-bridge validated), `targetCompletionDate`; EAM `eamNotificationId`, `eamWorkOrderId`.
- **BridgeElements** — hierarchy (parent/children), `elementCode`, `elementType` (→ElementTypes codelist w/ OTEIL), `material`, `conditionRating`, `eamEquipId`.
- **BridgeCapacities** — load-rating/capacity assessment (AS 5100.7 etc.); EAM `eamMeasDocId`, `eamMeasPointId`.
- **AssetClassStrategy** — engineering policy: `inspectionIntervalMonths`, `targetConditionRating`, `interventionThreshold`, `reviewCycleMonths`, `degradationRatePerYear`, `eamMaintenancePlan`. Drives `nextInspectionDue`/`inspectionOverdue` (decision-support); maps to an EAM maintenance plan.

---

## 5. Risk engine (`srv/lib/risk.js`, unit-tested)

`score = consequence(1-5) × likelihood(1-5) × 4` → band. Consequence = weighted importance + high-priority + heavy-traffic + **transport-mode criticality** (config: `RiskConfig.mode_<Mode>`). Likelihood = worse of condition/structural. **Override** keeps manual values. **RUL** + **expected value** are advisory (documented in `docs/risk-model/METHODOLOGY.md`). Bands (`RiskBand`) carry `rationale`/`reviewedBy`/`reviewedAt`/`reviewSource` for auditable calibration. `recalcRisk` admin action re-scores the register.

---

## 6. Cross-cutting

- **Custom attributes (EAV):** `AttributeGroups`/`AttributeDefinitions`/`BridgeAttributes` + `AttributeValueHistory` — admin-configurable per object type (SAP-EAM classification analogue).
- **GIS:** geometry stored as portable GeoJSON `LargeString` (Point/Line/Polygon/Multi); GDA2020 declared; HANA spatial storage SRID + compute config-driven; map renders all geometry types; clustering/proximity/heatmap config-driven.
- **EAM integration:** `EAMCodeMapping` (value map), `EAMFieldMapping` (field map — no hardcoded mappings), `EAMSyncLog` (append-only integration audit). Boundary locked in `CLAUDE.md`.
- **Audit & governance:** `ChangeLog` on every CUD (durable — bulk failures fail the operation), soft-delete only, `SystemConfig`/`GISConfig`/`DataQualityRules` config-driven, XSUAA scopes view/manage/admin, i18n.
- **Bulk:** Mass Upload (CSV/XLSX, GeoJSON validated, ZIP-bomb guard, durable audit), Mass Edit (in-grid, durable diff'd audit).
