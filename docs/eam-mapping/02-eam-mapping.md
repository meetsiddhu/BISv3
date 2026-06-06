# Phase 2 — Clean-Core Mapping to SAP EAM

> Analysis-only — no files modified. PROPOSED mappings are design candidates only.  
> EAM API references: API_FUNCTIONALLOCATION (TPLNR), API_EQUIPMENT (EQUNR),  
> API_MAINTENANCENOTIFICATION (QMNUM), API_MAINTENANCEORDER (AUFNR),  
> API_MEASUREMENTDOCUMENT (MSDOCUMENT).

---

## 2.1 Object-Level Mapping

| BIS Object | EAM Canonical Object | EAM API | EAM Key Field | Rationale |
|---|---|---|---|---|
| `Bridges` (asset) | Functional Location | API_FUNCTIONALLOCATION | TPLNR (30 char) | Bridge is a fixed infrastructure location |
| `Bridges` (physical asset) | Equipment | API_EQUIPMENT | EQUNR (18 char) | Bridges also have serial equipment characteristics (load ratings, material, age) |
| `BridgeInspections` | Maintenance Order (type: inspection) | API_MAINTENANCEORDER | AUFNR (12 char) | Inspection = planned maintenance order |
| `BridgeDefects` | Maintenance Notification | API_MAINTENANCENOTIFICATION | QMNUM (12 char) | Defect = breakdown/malfunction notification |
| `BridgeCapacities` (condition readings) | Measurement Document | API_MEASUREMENTDOCUMENT | MSDOCUMENT | Condition ratings and capacity readings = measurement points |
| `BridgeRestrictions` / `Restrictions` | Classification (class BRIDGE_RESTRICTION) | BAPI_OBJCL_ASSIGN_VB | CLASSNUM | Restrictions = classification on FLOC/Equipment |
| `BridgeDocuments` | Document Management (GOS) | BAPI_DOCUMENT_CREATE2 | DOKAR+DOKNR | Attachments map to SAP DMS/GOS |

**Dual-representation note**: Bridges map to BOTH a Functional Location (for hierarchy/topology) AND an Equipment record (for technical object with rating/material characteristics). In EAM, FLOC is the location; Equipment is the maintainable object installed at that location. Both carry classification characteristics.

---

## 2.2 `Bridges` → Functional Location (API_FUNCTIONALLOCATION)

| # | BIS Field | EAM FLOC Field | API Property | Mapping Type | Notes |
|---|---|---|---|---|---|
| 1 | bridgeId | TPLNR (FuncLocId) | FunctionalLocation | DIRECT | NUMC-padded 30 char; BIS is String(40) — needs truncation check |
| 2 | bridgeName | PLTXT (Description) | FunctLocDescription | DIRECT | String(111) → CHAR(40) — truncation risk |
| 3 | assetClass | FLTYP (FuncLocCategory) | FunctLocCategory | DIRECT | Code mapping required (BIS codes ≠ EAM codes) |
| 4 | structureType | TPLKZ (StrFuncLocationType) | FuncLocSortField | CLASSIFICATION | Map to class characteristic STRUCTURE_TYPE |
| 5 | state | — | — | CLASSIFICATION | Map to characteristic STATE |
| 6 | region | — | — | CLASSIFICATION | Map to characteristic REGION |
| 7 | lga | — | — | CLASSIFICATION | Map to characteristic LGA |
| 8 | assetOwner | INGRP (MainWorkCenter) or BUKRS | CompanyCode / BusinessArea | DIRECT | Partial match; EAM uses org unit codes |
| 9 | managingAuthority | INGRP (PlannerGroup) | MaintenancePlannerGroup | DIRECT | Loose match; EAM planner group |
| 10 | latitude | — (no native FLOC lat/lng) | — | BIS-LOCAL | EAM FLOC has no standard lat/lng field; use Classification or custom |
| 11 | longitude | — | — | BIS-LOCAL | Same as latitude |
| 12 | location | ADRNR (Address) | AddressID | DERIVED | Via address object; not direct |
| 13 | status (Active/Inactive) | IEQUI / USTW (SystemStatus) | StatusObject | DIRECT | EAM uses status profile; mapping: Active=AVLB, Inactive=DLFL |
| 14 | postingStatus | — | — | CLASSIFICATION | No direct EAM equivalent; map to characteristic POSTING_STATUS |
| 15 | highPriorityAsset | — | — | CLASSIFICATION | Map to characteristic HIGH_PRIORITY_IND |
| 16 | floodImpacted | — | — | CLASSIFICATION | Map to characteristic FLOOD_IMPACTED |
| 17 | gazetteReference | — | — | CLASSIFICATION | Map to characteristic GAZETTE_REF |
| 18 | nhvrReferenceUrl | — | — | BIS-LOCAL | URL not storable in standard EAM field |
| 19 | geoJson | — | — | BIS-LOCAL | No EAM equivalent; BIS-only |
| 20 | conditionRating | — (on Equipment, not FLOC) | — | DERIVED | Aggregate from Equipment/Measurement docs |
| 21 | dataSource | — | — | BIS-LOCAL | Provenance field; BIS-only |
| 22 | sourceRecordId | — | — | BIS-LOCAL | Cross-ref to source system |
| 23 | createdAt/modifiedAt | ERDAT/AEDAT | CreationDate/LastChangeDate | DIRECT | Standard managed fields |

---

## 2.3 `Bridges` → Equipment (API_EQUIPMENT)

| # | BIS Field | EAM Equipment Field | API Property | Mapping Type | Notes |
|---|---|---|---|---|---|
| 1 | bridgeId | EQUNR (EquipmentNumber) | Equipment | DIRECT | NUMC 18; BIS String(40) — zero-pad and truncate |
| 2 | bridgeName | EQKTX (Description) | EquipmentName | DIRECT | CHAR(40) — truncation risk |
| 3 | material | MSEHI / HERST | Manufacturer / ManufacturerPartNr | CLASSIFICATION | No exact match; use classification |
| 4 | structureType | EQTYP (EquipmentCategory) | EquipmentCategory | DIRECT | Category code must match SAP category table |
| 5 | yearBuilt | BAUJJ (ConstructionYear) | ConstructionYear | DIRECT | NUMC4 in EAM; Integer in BIS — compatible |
| 6 | spanLength | — | — | CLASSIFICATION | No direct field; use characteristic SPAN_LENGTH |
| 7 | totalLength | — | — | CLASSIFICATION | Characteristic TOTAL_LENGTH |
| 8 | deckWidth | — | — | CLASSIFICATION | Characteristic DECK_WIDTH |
| 9 | clearanceHeight | — | — | CLASSIFICATION | Characteristic CLEARANCE_HEIGHT |
| 10 | spanCount | — | — | CLASSIFICATION | Characteristic SPAN_COUNT |
| 11 | numberOfLanes | — | — | CLASSIFICATION | Characteristic NUMBER_OF_LANES |
| 12 | designLoad | — | — | CLASSIFICATION | Characteristic DESIGN_LOAD |
| 13 | loadRating | — | — | CLASSIFICATION | Characteristic LOAD_RATING (QUAN type) |
| 14 | freightRoute | — | — | CLASSIFICATION | Boolean → CHAR1 |
| 15 | overMassRoute | — | — | CLASSIFICATION | Boolean → CHAR1 |
| 16 | hmlApproved | — | — | CLASSIFICATION | Boolean → CHAR1 |
| 17 | bDoubleApproved | — | — | CLASSIFICATION | Boolean → CHAR1 |
| 18 | nhvrAssessed | — | — | CLASSIFICATION | Boolean → CHAR1 |
| 19 | pbsApprovalClass | — | — | CLASSIFICATION | Characteristic PBS_APPROVAL_CLASS |
| 20 | importanceLevel | — | — | CLASSIFICATION | Characteristic IMPORTANCE_LEVEL (NUMC) |
| 21 | conditionRating | MERIT (from latest inspection) | — | DERIVED | Denormalised from BridgeInspections; EAM uses measurement docs |
| 22 | lastInspectionDate | LETZTDATE (from order completion) | — | DERIVED | From last completed Maintenance Order |
| 23 | assetOwner | BUKRS+KOSTL | CompanyCode+CostCenter | DIRECT | Org mapping required |
| 24 | seismicZone | — | — | CLASSIFICATION | Characteristic SEISMIC_ZONE |
| 25 | floodImmunityAriYears | — | — | CLASSIFICATION | Characteristic FLOOD_IMMUNITY_ARI |

---

## 2.4 `BridgeInspections` → Maintenance Order (API_MAINTENANCEORDER)

| # | BIS Field | EAM MO Field | API Property | Mapping Type | Notes |
|---|---|---|---|---|---|
| 1 | inspectionRef | AUFNR | MaintenanceOrder | DIRECT | NUMC 12; BIS String(40) — format mismatch |
| 2 | bridge | TPLNR / EQUNR | FunctionalLocation / Equipment | DIRECT | Navigation via bridge.bridgeId |
| 3 | inspectionType | ILART | MaintenanceActivityType | DIRECT | Code mapping: Principal→1000, Detailed→2000 |
| 4 | inspectionDate | GSTRP (ScheduledStartDate) | MaintOrdBasicStartDate | DIRECT | EAM Date field; BIS Date — compatible |
| 5 | inspector | PRZNT / ARBID | PersonResponsible | DIRECT | EAM uses work center/person |
| 6 | conditionRating | MERIT (overall assessment) | — | CLASSIFICATION | Measurement document preferred |
| 7 | structuralRating | — | — | CLASSIFICATION | Characteristic on order or measurement |
| 8 | overallGrade | ILART (or user status) | — | CLASSIFICATION | Custom characteristic |
| 9 | nextInspectionDue | GLTRP (ScheduledEndDate) or NPLNR | — | DERIVED | Next order scheduling |
| 10 | inspectionNotes | LTXT (LongText) | MaintenanceOrderLongText | DIRECT | Long text object |
| 11 | recommendations | LTXT | MaintenanceOrderLongText | DIRECT | Separate text ID |
| 12 | active | SYSTATUS (TECO/CLSD) | MaintOrdSystemStatus | DERIVED | Active=CRTD/REL, Inactive=TECO |
| 13 | accreditationLevel | — | — | CLASSIFICATION | No EAM equivalent |

---

## 2.5 `BridgeDefects` → Maintenance Notification (API_MAINTENANCENOTIFICATION)

| # | BIS Field | EAM MN Field | API Property | Mapping Type | Notes |
|---|---|---|---|---|---|
| 1 | defectId | QMNUM | MaintenanceNotification | DIRECT | NUMC 12; BIS String(40) — format mismatch |
| 2 | bridge | TPLNR / EQUNR | FunctionalLocation / Equipment | DIRECT | Via bridge FK |
| 3 | defectType | QMART (NotificationType) | MaintNotifType | DIRECT | Code mapping required |
| 4 | severity | PRIOK (Priority) | MaintenanceNotificationPriority | DIRECT | 1-4 → EAM priority codes (1,2,3,4 or Very High/High/Medium/Low) |
| 5 | urgency | PRIOK (Priority) | — | CLASSIFICATION | BIS has separate urgency; EAM has single priority |
| 6 | defectDescription | QMTXT (ShortText) + LTXT | MaintNotifLongText | DIRECT | Short text CHAR(40); long text for full description |
| 7 | location | QMORT (FunctLocDesc) | FunctLocDesc | DIRECT | Location on structure |
| 8 | elementAffected | OTEIL (ObjectPart) | NotificationObjectPart | DIRECT | Partial match; EAM object part code |
| 9 | recommendedAction | LTXT | — | DIRECT | Long text |
| 10 | status | SYSTATUS (OSNO/INPR/NOCO) | MaintNotifSystemStatus | DERIVED | Open=OSNO, InProgress=INPR, Closed=NOCO |
| 11 | targetCompletionDate | AUFNR→GLTRP or KDAUF | RequiredEndDate | DIRECT | Date type compatible |
| 12 | active | SYSTATUS | — | DERIVED | Same as status mapping |
| 13 | inspection | AUFNR (linked order) | MaintenanceOrder | DIRECT | Inspection order → notification link |

---

## 2.6 `BridgeCapacities` → Measurement Document (API_MEASUREMENTDOCUMENT)

| # | BIS Field | EAM Measurement | API Property | Mapping Type | Notes |
|---|---|---|---|---|---|
| 1 | bridge | TPLNR / EQUNR | FunctionalLocation / Equipment | DIRECT | Via bridge FK |
| 2 | grossMassLimit | Measurement Point LOAD_GVM | MsmtDocValue | DIRECT | QUAN type; needs UoM = T (tonne) |
| 3 | grossCombined | Measurement Point LOAD_GCM | MsmtDocValue | DIRECT | QUAN; UoM = T |
| 4 | loadRating (on Bridge) | Measurement Point LOAD_RATING | MsmtDocValue | DIRECT | QUAN; UoM = T |
| 5 | conditionRating | Measurement Point COND_RATING | MsmtDocValue | DIRECT | Scale 1-10 |
| 6 | ratingFactor | Measurement Point RATING_FACTOR | MsmtDocValue | DIRECT | Decimal(9,4) → DEC |
| 7 | ratingDate | MESFR (ReadingDate) | MsmtDocDate | DIRECT | Date compatible |
| 8 | clearanceHeight / minClearancePosted | Measurement Point CLEARANCE | MsmtDocValue | DIRECT | QUAN; UoM = M |
| 9 | capacityType | PMKRI (Measurement Point) | MsmtPointDescription | DIRECT | Measurement point ID |
| 10 | consumedLife | Measurement Point FATIGUE_CONSUMED | MsmtDocValue | DIRECT | % decimal |
| 11 | designLife | — | — | CLASSIFICATION | Not a measurement; static characteristic |
| 12 | capacityStatus | PMKSTAT (MeasPoint Status) | — | DIRECT | Status code mapping |
| 13 | ratingEngineer | — | — | CLASSIFICATION | No measurement field; use characteristic |
| 14 | engineeringNotes | LTXT | — | DIRECT | Long text |

---

## 2.7 `Restrictions` / `BridgeRestrictions` → Classification

Restrictions have no direct EAM object equivalent. They are modelled as classification characteristics on the FLOC/Equipment:

| BIS Field | EAM Class | Characteristic | Mapping Type |
|---|---|---|---|
| restrictionType | BRIDGE_RESTRICTION | RESTR_TYPE | CLASSIFICATION |
| restrictionCategory | BRIDGE_RESTRICTION | RESTR_CATEGORY | CLASSIFICATION |
| restrictionValue (numeric part) | BRIDGE_RESTRICTION | RESTR_VALUE | CLASSIFICATION (QUAN) |
| restrictionUnit | BRIDGE_RESTRICTION | RESTR_UNIT | CLASSIFICATION (UoM) |
| grossMassLimit | BRIDGE_RESTRICTION | RESTR_GVM | CLASSIFICATION (QUAN+T) |
| axleMassLimit | BRIDGE_RESTRICTION | RESTR_AXLE | CLASSIFICATION (QUAN+T) |
| heightLimit | BRIDGE_RESTRICTION | RESTR_HEIGHT | CLASSIFICATION (QUAN+M) |
| widthLimit | BRIDGE_RESTRICTION | RESTR_WIDTH | CLASSIFICATION (QUAN+M) |
| lengthLimit | BRIDGE_RESTRICTION | RESTR_LENGTH | CLASSIFICATION (QUAN+M) |
| speedLimit | BRIDGE_RESTRICTION | RESTR_SPEED | CLASSIFICATION (QUAN+KMH) |
| effectiveFrom | BRIDGE_RESTRICTION | RESTR_VALID_FROM | CLASSIFICATION (DATS) |
| effectiveTo | BRIDGE_RESTRICTION | RESTR_VALID_TO | CLASSIFICATION (DATS) |
| restrictionStatus | BRIDGE_RESTRICTION | RESTR_STATUS | CLASSIFICATION (CHAR) |
| direction | BRIDGE_RESTRICTION | RESTR_DIRECTION | CLASSIFICATION (CHAR) |
| permitRequired | BRIDGE_RESTRICTION | RESTR_PERMIT_REQ | CLASSIFICATION (CHAR1 boolean) |
| escortRequired | BRIDGE_RESTRICTION | RESTR_ESCORT_REQ | CLASSIFICATION (CHAR1 boolean) |
| legalReference | BRIDGE_RESTRICTION | RESTR_LEGAL_REF | CLASSIFICATION (CHAR) |
| issuingAuthority | BRIDGE_RESTRICTION | RESTR_ISSUING_AUTH | CLASSIFICATION (CHAR) |

**Note**: Classification is one-value-per-characteristic per FLOC. BIS allows multiple restrictions per bridge with different types and validity periods. This creates a **1:N cardinality mismatch** — a limitation of EAM classification for restriction history. PROPOSED workaround: create one Equipment record per active restriction, or use separate Maintenance Orders as the restriction record.

---

## 2.8 BIS-LOCAL and UNMAPPED Fields

Fields with no EAM equivalent (remain in BIS as system-of-record):

| Entity | Field | Reason |
|---|---|---|
| Bridges | geoJson | GIS geometry; EAM has no GeoJSON storage |
| Bridges | nhvrReferenceUrl | URL; EAM stores text not URLs |
| Bridges | sourceReferenceUrl, openDataReference | Data provenance; BIS-specific |
| Bridges | latitude, longitude | No standard EAM FLOC geo-coordinate |
| Bridges | nhvrAssessed, nhvrAssessmentDate | NHVR-specific regulatory assessment |
| Bridges | freightRoute, overMassRoute, hmlApproved, bDoubleApproved | Australian heavy vehicle approvals; no EAM standard |
| Bridges | pbsApprovalClass | PBS specific to Australian regulation |
| BridgeInspections | accreditationLevel | Australian inspector certification level |
| All | BnacObjectIdMap | Third-party system; BIS-local cross-reference |
| All | DataQualityRules | BIS-specific DQ engine |
| All | SystemConfig, GISConfig | BIS configuration; no EAM equivalent |
| All | ReferenceLayerConfig | GIS layer config; BIS-specific |
| All | UserActivity | BIS-specific usage analytics |

---

## 2.9 Mapping Summary Counts

| Category | Count (approx.) |
|---|---|
| DIRECT | ~45 field pairs |
| CLASSIFICATION | ~40 field pairs |
| BIS-LOCAL (no EAM equiv.) | ~25 fields |
| DERIVED (computed from EAM data) | ~8 fields |
| UNMAPPED/OPEN | ~5 fields requiring further clarification |

**Total BIS fields inventoried**: ~165 (across Bridges, Restrictions, BridgeRestrictions, BridgeCapacities, BridgeInspections, BridgeDefects)
