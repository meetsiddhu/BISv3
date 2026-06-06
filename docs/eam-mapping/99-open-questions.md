# Open Questions — DECISIONS RECORDED

> All 12 open questions answered by product owner on 2026-06-06.  
> Status: **CLOSED — no further stakeholder input required before implementation.**  
> No code files modified. This is a design record only.

---

## OQ-01 — EAM Object Structure: FLOC vs Equipment ✅ DECIDED

**Decision**: **Option 3** — FLOC + Equipment where Equipment is the "deck/superstructure" and FLOC is the "location on the road network".

**Details**:
- A bridge can be linked to a FLOC **or** an Equipment record (flexible; not mandatory to have both).
- An additional `sapId` attribute is needed on the Bridge to store the SAP internal ID regardless of whether it is a FLOC or Equipment reference.
- Both `eamFlocId` and `eamEquipId` fields are needed (Block A1 and A2 confirmed required).

**Impact on gap analysis**:
- Fields A1 (`eamFlocId`) and A2 (`eamEquipId`) remain as proposed.
- Add `eamObjectType` field to Bridges to record whether the bridge is linked as FLOC, Equipment, or both — see updated Block A in gap analysis.

---

## OQ-02 — FLOC Number Range / Key Structure ✅ DECIDED

**Decision**: FLOC number range and key structure will be **mastered and maintained in the SAP system**. The BIS app operates independently of S/4 and does not need to validate or generate TPLNR key formats.

**Details**:
- `eamFlocId` will be a free String(30) field populated by sync or admin; no BIS-side key format validation.
- No structured TPLNR generation logic required in BIS.

**Impact on gap analysis**: Field A1 (`eamFlocId`) remains String(30) with no validation constraint.

---

## OQ-03 — Restriction Cardinality in EAM ✅ DECIDED

**Decision**: **BIS Restrictions are closest in concept to EAM Maintenance Notifications**. Restrictions are BIS-specific; they will be mapped to Notifications in EAM where applicable.

**Details**:
- BIS is the System of Record for Restrictions.
- Integration: when EAM is enabled, a Restriction can be pushed as a Maintenance Notification (similar to how Defects are pushed).
- Full restriction detail stays in BIS; EAM Notification holds a reference and summary only.
- A `eamNotifNumber` and `eamSyncStatus` should be added to `BridgeRestrictions` in Phase 4 (similar to Block D on BridgeDefects).

**Impact on gap analysis**: Add a new Block D2 — EAM reference fields for BridgeRestrictions (analogous to BridgeDefects Block D).

---

## OQ-04 — EAM Plant and Org Structure ✅ DECIDED

**Decision**: Add SAP Plant, Company Code, Controlling Area, and related org attributes to the Bridge object page in a **new Tab called "SAP Org"**.

**Details**:
- These fields are configurable attributes on each Bridge, not global SystemConfig keys only.
- The Admin tile's SystemConfig keys (`EAM_PLANT`, `EAM_COMPANY_CODE`, `EAM_CONTROLLING_AREA`) provide system-wide defaults.
- Bridge-level override fields (per-bridge Plant, per-bridge Org Unit) allow multi-authority deployments.
- The "SAP Org" tab is only visible when `EAM_INTEGRATION_ENABLED = true`.

**Impact on gap analysis**: Add Block A-ORG fields to Bridges — `eamPlant String(4)`, `eamCompanyCode String(4)`, `eamControllingArea String(4)`, `eamOrgUnit String(20)`. These override the SystemConfig defaults per bridge.

---

## OQ-05 — Inspection Type Code Mapping ✅ DECIDED

**Decision**: Code mapping (BIS inspectionType → EAM ILART) will be maintained by the BIS admin in the `EAMCodeMapping` entity (proposed in Phase 4 F1). No hardcoded mapping in integration logic.

**Details**:
- The EAMCodeMapping admin screen will be accessible in the Admin tile.
- Initial seed data: admin manually maps BIS lookup values to EAM ILART codes on first configuration.
- New BIS inspection types added in future are automatically unsupported for sync until admin maps them.

**Impact on gap analysis**: No change — EAMCodeMapping (F1) as proposed covers this.

---

## OQ-06 — Defect / Notification Type Mapping ✅ DECIDED

**Decision**: Notification type is configurable via the `EAM_NOTIFICATION_TYPE` SystemConfig key (default M1). Admin can override per-deployment.

**Details**:
- No custom notification type required initially; M1 (General) as default.
- Future: if a custom type (e.g. M5 Infrastructure Defect) is configured in EAM, admin updates the SystemConfig key.

**Impact on gap analysis**: No change — SystemConfig key `EAM_NOTIFICATION_TYPE` (G2) as proposed covers this.

---

## OQ-07 — Direction of Integration for Inspections ✅ DECIDED

**Decision**: When SAP EAM integration is enabled, **Inspections and Assets (Bridges) will be created and mastered in SAP**. The Create / Edit / mass-upload functions for these entities are only available in BIS when the app is in **STANDALONE mode**.

**Details**:
- `EAM_SYNC_MODE` controls this behaviour globally via SystemConfig.
- Per-entity override is possible via the record-level `eamSyncMode` field (Block A8 on Bridges, future field on BridgeInspections).
- When `EAM_SYNC_MODE != STANDALONE`: the Create and Edit buttons on the Inspections (and Bridges) list/object pages are **hidden or disabled** in the UI.
- Mass-upload functionality is also gated — only available in STANDALONE mode.
- BIS admins have a dedicated **"SAP Field Mapping"** section in the Admin tile to configure which BIS fields map to which EAM fields. This mapping is maintained in the app (no hardcoded field map in code).
- All other roles (view, manage) see SAP-controlled fields as read-only when integration is active.

**Impact on gap analysis**:
- Add Admin tile section: "SAP Field Mapping" — a configurable field-mapping table (entity, bisField, eamObject, eamField, direction, active).
- UI: Create/Edit button visibility driven by `eamSyncMode` or global `EAM_SYNC_MODE`.

---

## OQ-08 — Authentication Method for EAM Destination ✅ DECIDED

**Decision**: **Option 3 — Principal Propagation**. User identity must flow through to EAM for audit.

**Details**:
- Requires that BIS users have corresponding EAM user accounts (managed by SAP Basis).
- BTP Destination configured with `Authentication: PrincipalPropagation` and `ProxyType: OnPremise` (Cloud Connector) or `SAMLAssertion` for S/4HANA Cloud.
- Integration service in BIS passes the JWT to the Destination Service; no credential storage in BIS code.

**Impact on gap analysis**: Destination configuration in Phase 5 uses Principal Propagation. No change to proposed fields.

---

## OQ-09 — BNAC Entity Deprecation Timeline ✅ DECIDED

**Decision**: The BNAC entity (`BnacObjectIdMap`) will be **part of the generic External Entity** design. Additionally, there must be a **config entry (SystemConfig or BnacEnvironment) to maintain the BNAC URL for each environment** (dev, test, prod).

**Details**:
- `BnacObjectIdMap` is not deleted — it is subsumed into the broader `ObjectExternalRef` design.
- A new SystemConfig key (or BnacEnvironment extension) stores the BNAC base URL per environment so admins can switch URLs without code changes.
- Migration of existing BNAC ID map data to `ObjectExternalRef` is included in Phase 6 (P3).

**Impact on gap analysis**: 
- Add SystemConfig keys: `BNAC_BASE_URL`, `BNAC_ENVIRONMENT_ID` (one row per environment entry in BnacEnvironment table).
- `ObjectExternalRef` entity to include `systemType String(20)` (values: BNAC / EAM / GIS / OTHER).

---

## OQ-10 — Data Quality Rules for EAM Completeness ✅ DECIDED

**Decision**: Yes — new `DataQualityRules` should enforce EAM field completeness. Admin can configure these rules in the Admin tile.

**Details**:
- Rules are data-driven (stored in `DataQualityRules` entity), not hardcoded.
- Example rules to be seeded:
  - If `EAM_INTEGRATION_ENABLED = true` and bridge `isActive = true`, then `eamFlocId` must be populated (severity: WARNING).
  - If `eamSyncStatus = ERROR` for > N days (N configured in SystemConfig), raise a DQ alert (severity: CRITICAL).
- Admin can enable/disable/modify rules in the Admin tile without deployment.

**Impact on gap analysis**: Add seeded DataQualityRules rows to the Phase 4 implementation plan. No schema changes needed.

---

## OQ-11 — EAM Short Name Strategy ✅ DECIDED

**Decision**: **Option 4** — Store full bridge name in the EAM **long text object** (LTXT); use a **short code in PLTXT** (the 40-char display field).

**Details**:
- Field B1 `eamShortName String(40)` is confirmed required.
- On sync, BIS pushes: PLTXT/EQKTX ← `eamShortName` (40 chars); EAM long text ← full `bridgeName`.
- If `eamShortName` is null at sync time, auto-populate from `bridgeName[:40]` as a fallback.
- Admin can override `eamShortName` per bridge in the UI.

**Impact on gap analysis**: Field B1 confirmed. Sync logic note: always push long text with full bridgeName.

---

## OQ-12 — GeoJSON in EAM ✅ DECIDED

**Decision**: Add a **config setting** (`EAM_PUSH_GEOJSON`) to control whether BIS pushes GeoJSON coordinates to the EAM GIS system.

**Details**:
- Default: `EAM_PUSH_GEOJSON = false` (GeoJSON stays BIS-LOCAL).
- When enabled and EAM has a GIS integration module, BIS includes geometry in the sync payload.
- The GeoJSON push endpoint/format is configurable via a separate SystemConfig key (`EAM_GIS_ENDPOINT`).
- This keeps BIS GeoJSON ownership intact regardless of EAM capability.

**Impact on gap analysis**: Add SystemConfig keys `EAM_PUSH_GEOJSON` (boolean, default false) and `EAM_GIS_ENDPOINT` (string) to Block G2.

---

## Summary of All Decisions

| OQ | Topic | Decision |
|----|-------|----------|
| OQ-01 | FLOC vs Equipment | Option 3 — FLOC (location) + Equipment (deck); bridge links to either or both; add `eamObjectType` + `sapId` |
| OQ-02 | TPLNR Key Structure | Mastered in SAP; BIS stores free-form; no BIS-side validation |
| OQ-03 | Restriction in EAM | Restrictions → Notifications; BIS is SoR; add eam fields to BridgeRestrictions |
| OQ-04 | Plant / Org Structure | New "SAP Org" tab on Bridge; per-bridge overrides + global SystemConfig defaults |
| OQ-05 | Inspection Type Codes | Admin-maintained EAMCodeMapping; no hardcoded mapping |
| OQ-06 | Notification Type | SystemConfig `EAM_NOTIFICATION_TYPE`; default M1 |
| OQ-07 | Integration Direction | Inspections + Assets mastered in SAP when integrated; Create/Edit/upload gated by sync mode; Admin "SAP Field Mapping" screen |
| OQ-08 | Auth Method | Option 3 — Principal Propagation |
| OQ-09 | BNAC Deprecation | BNAC merged into ObjectExternalRef; URL per environment in SystemConfig/BnacEnvironment |
| OQ-10 | DQ Rules for EAM | Yes — data-driven rules in DataQualityRules entity; admin-configurable |
| OQ-11 | Short Name Strategy | Option 4 — full name in EAM long text; short code in PLTXT (eamShortName field) |
| OQ-12 | GeoJSON in EAM | Config-driven (`EAM_PUSH_GEOJSON`); default false; GeoJSON stays BIS-LOCAL unless enabled |
