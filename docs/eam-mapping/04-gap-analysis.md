# Phase 4 — Gap Analysis

> **UPDATED 2026-06-06** — all 12 open questions answered; proposals below are now CONFIRMED DESIGN DECISIONS.  
> No code files have been modified. Every proposal is additive-only, soft-delete aware,  
> ChangeLog-logged, AppConfig-driven, i18n-labelled, and XSUAA-gated.  
> See `99-open-questions.md` for the full decision record.

---

## 4.1 Design Principles for All Proposals

1. **Additive-only**: New fields extend existing entities; no existing fields removed or renamed.
2. **Soft-delete aware**: New entities use `isActive/isDeleted` or `active` boolean pattern consistent with existing entities.
3. **ChangeLog-logged**: All changes to new fields should be captured in `ChangeLog` with `objectType` extended to cover new entities.
4. **AppConfig-driven**: Integration behaviour controlled by `SystemConfig` keys (e.g. `EAM_INTEGRATION_ENABLED`, `EAM_SYNC_MODE`), not code branches.
5. **i18n-labelled**: All new fields must have entries in `app/_i18n/i18n.properties` following the existing `@title` annotation pattern.
6. **XSUAA-gated**: New integration actions (trigger sync, view EAM refs) must be gated behind existing scope (`manage` or new `integration` scope).

---

## 4.2 ADD NEW FIELDS — Bridges Entity

### Block A: EAM Object Reference Block (CONFIRMED — Bridges)

These fields store the EAM counterpart object identifiers once integration is established.  
**OQ-01 decision**: Equipment = deck/superstructure; FLOC = location on road network. A bridge may link to either or both.  
**OQ-02 decision**: `eamFlocId` is a free String(30); TPLNR key structure mastered in SAP, not validated in BIS.

| # | Field | CAP Type | M/O | Default | i18n Key | Purpose |
|---|---|---|---|---|---|---|
| A1 | eamFlocId | String(30) | O | null | eam_floc_id | EAM Functional Location key (TPLNR); mastered in SAP |
| A2 | eamEquipId | String(18) | O | null | eam_equip_id | EAM Equipment number (EQUNR, zero-padded 18 digits) for deck/superstructure |
| A3 | eamObjectType | String(20) | O | null | eam_object_type | Which EAM object this bridge is linked as: FLOC / EQUIPMENT / BOTH |
| A4 | sapId | String(40) | O | null | sap_id | Generic SAP internal ID (for cases where the exact EAM object type is unknown) |
| A5 | eamSystemId | String(40) | O | null | eam_system_id | EAM system/landscape ID (e.g. 'S4H-PRD'); points to SystemConfig entry |
| A6 | eamSyncStatus | String(20) | O | 'NOT_SYNCED' | eam_sync_status | Values: NOT_SYNCED / PENDING / SYNCED / CONFLICT / ERROR |
| A7 | eamLastSyncAt | Timestamp | O | null | eam_last_sync_at | Timestamp of last successful sync to/from EAM |
| A8 | eamLastSyncBy | String(111) | O | null | eam_last_sync_by | User or process that triggered the last sync |
| A9 | eamSyncDirection | String(10) | O | 'NONE' | eam_sync_direction | Values: NONE / TO_EAM / FROM_EAM / BIDIRECTIONAL |
| A10 | eamSyncMode | String(20) | O | 'STANDALONE' | eam_sync_mode | Values: STANDALONE / PUSH / PULL / BIDIRECTIONAL; overrides AppConfig default at record level |

**Design note**: `eamSyncMode` at record level overrides the global `SystemConfig` key `EAM_SYNC_MODE`, enabling per-bridge integration behaviour.

### Block A-ORG: SAP Org Structure Fields (CONFIRMED — Bridges) — displayed in new "SAP Org" tab

**OQ-04 decision**: SAP Plant and org attributes are per-bridge fields displayed in a dedicated "SAP Org" tab. Global defaults come from SystemConfig; per-bridge values override them. Tab only visible when `EAM_INTEGRATION_ENABLED = true`.

| # | Field | CAP Type | M/O | Default | i18n Key | Purpose |
|---|---|---|---|---|---|---|
| AO1 | eamPlant | String(4) | O | null | eam_plant | SAP Plant (WERKS) — overrides EAM_PLANT SystemConfig |
| AO2 | eamCompanyCode | String(4) | O | null | eam_company_code | SAP Company Code — overrides EAM_COMPANY_CODE SystemConfig |
| AO3 | eamControllingArea | String(4) | O | null | eam_controlling_area | SAP Controlling Area — overrides EAM_CONTROLLING_AREA SystemConfig |
| AO4 | eamOrgUnit | String(20) | O | null | eam_org_unit | SAP Org Unit (e.g. road authority, LGA) |

### Block B: EAM Short Name (CONFIRMED — Bridges)

**OQ-11 decision**: Option 4 — full name pushed to EAM long text (LTXT); `eamShortName` used for PLTXT/EQKTX (40-char display). Fallback: auto-populate from `bridgeName[:40]` if not set.

| # | Field | CAP Type | M/O | Default | i18n Key | Purpose |
|---|---|---|---|---|---|---|
| B1 | eamShortName | String(40) | O | null | eam_short_name | Short display name for EAM PLTXT/EQKTX; full name pushed to EAM long text object |

---

## 4.3 ADD NEW FIELDS — BridgeInspections Entity (CONFIRMED)

**OQ-07 decision**: When EAM is integrated, Inspections are **mastered in SAP**. Create/Edit/mass-upload buttons are hidden/disabled in BIS UI when `EAM_SYNC_MODE != STANDALONE`. Sync mode is configurable per record (eamSyncMode field — add to BridgeInspections, same as Bridges A10).

| # | Field | CAP Type | M/O | Default | i18n Key | Purpose |
|---|---|---|---|---|---|---|
| C1 | eamOrderNumber | String(12) | O | null | eam_order_number | EAM Maintenance Order number (AUFNR, NUMC 12) |
| C2 | eamOrderType | String(20) | O | null | eam_order_type | EAM order type (e.g. PM01 Corrective, PM02 Preventive) |
| C3 | eamSyncStatus | String(20) | O | 'NOT_SYNCED' | eam_sync_status | As per Bridges block A6 |
| C4 | eamLastSyncAt | Timestamp | O | null | eam_last_sync_at | Last sync timestamp |
| C5 | eamSyncMode | String(20) | O | 'STANDALONE' | eam_sync_mode | Per-inspection override of global EAM_SYNC_MODE |

---

## 4.4 ADD NEW FIELDS — BridgeDefects Entity (CONFIRMED)

**OQ-06 decision**: Default notification type = M1 (General), configurable via `EAM_NOTIFICATION_TYPE` SystemConfig key.

| # | Field | CAP Type | M/O | Default | i18n Key | Purpose |
|---|---|---|---|---|---|---|
| D1 | eamNotifNumber | String(12) | O | null | eam_notif_number | EAM Maintenance Notification number (QMNUM, NUMC 12) |
| D2 | eamNotifType | String(10) | O | null | eam_notif_type | EAM notification type code; defaults to EAM_NOTIFICATION_TYPE SystemConfig value |
| D3 | eamSyncStatus | String(20) | O | 'NOT_SYNCED' | eam_sync_status | As per Bridges block A6 |
| D4 | eamLastSyncAt | Timestamp | O | null | eam_last_sync_at | Last sync timestamp |

---

## 4.4b ADD NEW FIELDS — BridgeRestrictions Entity (CONFIRMED — NEW, from OQ-03)

**OQ-03 decision**: BIS Restrictions closest match is EAM Maintenance Notification. BIS is System of Record. When integration enabled, a Restriction can be pushed as a Notification (reference only).

| # | Field | CAP Type | M/O | Default | i18n Key | Purpose |
|---|---|---|---|---|---|---|
| DR1 | eamNotifNumber | String(12) | O | null | eam_notif_number | EAM Notification number for this restriction (reference only) |
| DR2 | eamSyncStatus | String(20) | O | 'NOT_SYNCED' | eam_sync_status | NOT_SYNCED / PENDING / SYNCED / ERROR |
| DR3 | eamLastSyncAt | Timestamp | O | null | eam_last_sync_at | Last sync timestamp |

---

## 4.5 ADD NEW FIELDS — BridgeCapacities Entity

| # | Proposed Field | CAP Type | M/O | Default | i18n Key | Purpose |
|---|---|---|---|---|---|---|
| E1 | eamMeasDocNumber | String(18) | O | null | eam_meas_doc_number | EAM Measurement Document key (MSDOCUMENT, NUMC 18) |
| E2 | eamMeasPointId | String(20) | O | null | eam_meas_point_id | EAM Measurement Point ID (PMKRI) |
| E3 | eamSyncStatus | String(20) | O | 'NOT_SYNCED' | eam_sync_status | As per Bridges block A4 |
| E4 | eamLastSyncAt | Timestamp | O | null | eam_last_sync_at | Last sync timestamp |

---

## 4.6 ADD NEW ENTITY — EAMCodeMapping (PROPOSED)

A configuration-driven code mapping table to translate between BIS code values and EAM code values. Eliminates hardcoded mappings in integration logic.

```cds
// PROPOSED — not applied
entity EAMCodeMapping {
  key bisEntity    : String(60);   // e.g. 'Bridges', 'BridgeInspections'
  key bisField     : String(80);   // e.g. 'inspectionType'
  key bisValue     : String(100);  // BIS code value
  eamTableName     : String(30);   // e.g. 'ILART', 'QMART'
  eamValue         : String(30);   // EAM code value
  description      : String(255);
  active           : Boolean default true;
}
```

- Managed in the `SystemConfig` / Admin tile
- XSUAA-gated: `admin` scope
- ChangeLog-tracked: objectType = 'EAMCodeMapping'

---

## 4.7 ADD NEW ENTITY — EAMSyncLog (PROPOSED)

An append-only log of all EAM sync operations, separate from `ChangeLog`:

```cds
// PROPOSED — not applied
entity EAMSyncLog {
  key ID           : UUID;
  syncAt           : Timestamp;
  syncBy           : String(111);     // user or background job
  operation        : String(20);      // PUSH_FLOC / PUSH_EQUIP / PUSH_ORDER / PULL_NOTIF
  objectType       : String(40);      // Bridge / BridgeInspection / BridgeDefect
  bisObjectId      : String(100);     // BIS primary key
  eamObjectId      : String(30);      // EAM key returned
  eamSystem        : String(40);      // SystemConfig ref
  httpStatus       : Integer;         // HTTP response code
  eamReturnCode    : String(10);      // BAPI/OData return code
  eamMessage       : LargeString;     // Full EAM response message
  duration         : Integer;         // Milliseconds
  batchId          : String(111);     // Groups all syncs in one batch operation
  changeSource     : String(40) default 'EAMSync';
}
```

---

## 4.8 AMEND EXISTING — ChangeLog.objectType Values

The `objectType` String(40) field should document the extended allowed values:

| Existing Values | Proposed Addition |
|---|---|
| Bridge, Restriction, GISConfig, Lookup | EAMSync, EAMCodeMapping, BridgeCapacity, BridgeInspection, BridgeDefect |

No schema change needed (it is a free String). But a corresponding update to the `DataQualityRules` / admin documentation is recommended.

---

## 4.9 AMEND EXISTING — SystemConfig Keys to Add (CONFIRMED)

The following `SystemConfig` key entries should be seeded in the admin tile.  
**OQ-04**: Plant/org keys provide system-wide defaults; per-bridge overrides stored in Block A-ORG fields.  
**OQ-09**: BNAC URL keys added for each environment.  
**OQ-12**: GeoJSON push keys added.  
**OQ-07**: Field mapping managed in new SAP Field Mapping admin section (see 4.12 below).

| configKey | category | dataType | defaultValue | Purpose |
|---|---|---|---|---|
| EAM_INTEGRATION_ENABLED | Integration | boolean | false | Master on/off switch |
| EAM_SYNC_MODE | Integration | string | STANDALONE | Global default: STANDALONE / PUSH / PULL / BIDIRECTIONAL |
| EAM_SYSTEM_ID | Integration | string | — | Identifies the target EAM system |
| EAM_DESTINATION_NAME | Integration | string | — | BTP Destination Service name for the EAM OData endpoint |
| EAM_NOTIFICATION_TYPE | Integration | string | M1 | Default notification type for defects (OQ-06) |
| EAM_ORDER_TYPE | Integration | string | PM02 | Default order type for inspections |
| EAM_PLANT | Integration | string | — | SAP Plant (WERKS) — system-wide default (OQ-04) |
| EAM_CONTROLLING_AREA | Integration | string | — | SAP Controlling Area — system-wide default (OQ-04) |
| EAM_COMPANY_CODE | Integration | string | — | SAP Company Code — system-wide default (OQ-04) |
| EAM_PUSH_GEOJSON | Integration | boolean | false | Whether to push bridge GeoJSON to EAM GIS system (OQ-12) |
| EAM_GIS_ENDPOINT | Integration | string | — | EAM GIS integration endpoint URL (used when EAM_PUSH_GEOJSON=true) (OQ-12) |
| BNAC_BASE_URL | BNAC | string | — | BNAC service base URL for this environment (OQ-09) |
| BNAC_ENVIRONMENT_ID | BNAC | string | — | BNAC environment identifier (dev/test/prod) (OQ-09) |

---

## 4.10 AMEND EXISTING — xs-security.json (PROPOSED)

Add an `integration` scope for EAM sync operations:

```json
// PROPOSED addition — xs-security.json
{
  "name": "$XSAPPNAME.integration",
  "description": "Trigger and manage EAM synchronisation"
}
```

And a corresponding role template:

```json
{
  "name": "BMS_INTEGRATION",
  "description": "EAM synchronisation operator",
  "scope-references": ["$XSAPPNAME.integration", "$XSAPPNAME.view"]
}
```

---

## 4.11b ADD NEW ADMIN SECTION — SAP Field Mapping (CONFIRMED — from OQ-07)

**OQ-07 decision**: A dedicated admin screen in the Admin tile allows BIS admins to configure which BIS fields map to which EAM fields. No hardcoded field mapping in integration code.

### New Entity: EAMFieldMapping

```cds
// CONFIRMED DESIGN — not yet applied
entity EAMFieldMapping {
  key ID            : UUID;
  bisEntity         : String(60);    // e.g. 'Bridges', 'BridgeInspections'
  bisField          : String(80);    // e.g. 'bridgeName', 'inspectionDate'
  eamObject         : String(40);    // e.g. 'FLOC', 'Equipment', 'MaintenanceOrder'
  eamField          : String(80);    // e.g. 'PLTXT', 'ERDAT'
  direction         : String(20);    // TO_EAM / FROM_EAM / BIDIRECTIONAL
  transformRule     : String(255);   // Optional: truncate(40), uppercase, date format, etc.
  active            : Boolean default true;
  notes             : String(500);
}
```

- Managed in Admin tile → "SAP Field Mapping" section
- XSUAA-gated: `admin` scope
- ChangeLog-tracked: objectType = 'EAMFieldMapping'
- When `EAM_INTEGRATION_ENABLED = false`, this section is still visible for pre-configuration
- This entity replaces any hardcoded field mapping in the EAMIntegrationService

### UI Behaviour (OQ-07)

When `EAM_SYNC_MODE != STANDALONE` (i.e. integration is active and data is mastered in SAP):

| UI Element | Behaviour |
|---|---|
| "Create" button on Bridges list | Hidden |
| "Edit" button on Bridge object page | Hidden (view only) |
| "Create" button on Inspections list | Hidden |
| Mass upload function for Bridges/Inspections | Disabled with informational message |
| All fields in "SAP Org" tab | Read-only |
| eamFlocId, eamEquipId, eamOrderNumber fields | Populated by sync; not user-editable |

All other tiles (Defects, Capacities, Documents, Restrictions) remain editable — BIS remains SoR for these.

---

## 4.11c ADD NEW ENTITY — ObjectExternalRef (CONFIRMED — from OQ-09)

Replaces and supersedes `BnacObjectIdMap` with a generic external reference pattern.

```cds
// CONFIRMED DESIGN — not yet applied
entity ObjectExternalRef {
  key ID              : UUID;
  objectType          : String(40);    // Bridge / BridgeInspection / BridgeDefect
  bisObjectId         : String(100);   // BIS primary key
  systemType          : String(20);    // BNAC / EAM / GIS / OTHER
  systemId            : String(40);    // SystemConfig / BnacEnvironment ref
  externalId          : String(100);   // The external system's ID
  externalRef2        : String(100);   // Secondary ref if needed (e.g. FLOC + Equipment)
  syncStatus          : String(20);    // NOT_SYNCED / SYNCED / ERROR
  lastSyncAt          : Timestamp;
  isActive            : Boolean default true;
  notes               : String(500);
}
```

- Existing `BnacObjectIdMap` data migrated to this entity in Phase 6 (P3)
- BNAC rows: `systemType = 'BNAC'`; EAM rows: `systemType = 'EAM'`

---

## 4.11 Summary of Proposals

| # | Type | Entity | Description | Priority | Decision |
|---|---|---|---|---|---|
| A1–A10 | ADD FIELD | Bridges | EAM reference block (FLOC/Equip IDs, object type, SAP ID, sync status, timestamps) | P1 | OQ-01 ✅ |
| AO1–AO4 | ADD FIELD | Bridges | SAP Org tab fields (Plant, CompanyCode, ControllingArea, OrgUnit) | P1 | OQ-04 ✅ |
| B1 | ADD FIELD | Bridges | eamShortName (PLTXT/EQKTX, 40 chars); full name to EAM long text | P2 | OQ-11 ✅ |
| C1–C5 | ADD FIELD | BridgeInspections | EAM Maintenance Order ref + per-record sync mode | P1 | OQ-07 ✅ |
| D1–D4 | ADD FIELD | BridgeDefects | EAM Maintenance Notification reference block | P1 | OQ-06 ✅ |
| DR1–DR3 | ADD FIELD | BridgeRestrictions | EAM Notification ref (Restrictions = closest match to Notifications) | P2 | OQ-03 ✅ |
| E1–E4 | ADD FIELD | BridgeCapacities | EAM Measurement Document reference block | P2 | — |
| F1 | ADD ENTITY | (new) | EAMCodeMapping — admin-maintained code translation table | P1 | OQ-05 ✅ |
| F2 | ADD ENTITY | (new) | EAMSyncLog — append-only sync audit | P1 | — |
| F3 | ADD ENTITY | (new) | EAMFieldMapping — admin-maintained BIS↔EAM field mapping table | P1 | OQ-07 ✅ |
| F4 | ADD ENTITY | (new) | ObjectExternalRef — generic external ref (supersedes BnacObjectIdMap) | P2 | OQ-09 ✅ |
| G1 | AMEND | ChangeLog | Document extended objectType values | P2 | — |
| G2 | AMEND | SystemConfig | Seed 13 EAM+BNAC+GIS integration config keys | P1 | OQ-04,09,12 ✅ |
| G3 | AMEND | xs-security.json | Add integration scope and BMS_INTEGRATION role template | P1 | — |
