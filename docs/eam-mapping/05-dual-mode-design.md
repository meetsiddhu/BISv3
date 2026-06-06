# Phase 5 — Dual-Mode Design

> PROPOSED design — no files modified.  
> Mode switching is entirely AppConfig-driven (SystemConfig entity).  
> No code branches; behaviour determined at runtime by configuration.

---

## 5.1 Mode Definitions

| Mode | Description | EAM Reference Fields | Data Flow |
|---|---|---|---|
| **STANDALONE** | BIS is the sole System of Record (SoR). EAM does not exist or is not reachable. | Empty / null | All CRUD in BIS only |
| **EAM-INTEGRATED (PUSH)** | BIS is SoR. Changes in BIS are pushed to EAM. EAM read-only. | Populated after first push | BIS → EAM; EAM confirmations stored in eamSyncStatus |
| **EAM-INTEGRATED (PULL)** | EAM is SoR for master data. BIS reads from EAM; local enrichment only. | Populated on pull | EAM → BIS; BIS fields for local data only |
| **BIDIRECTIONAL** | Both systems can update; conflict resolution required. | Always populated | BIS ↔ EAM; conflict strategy from AppConfig |

---

## 5.2 Mode Switch — AppConfig Keys

All mode control is via `SystemConfig` entity (key-value store, admin-only, no redeploy):

```
EAM_INTEGRATION_ENABLED  = false          → STANDALONE mode
EAM_INTEGRATION_ENABLED  = true
  EAM_SYNC_MODE          = PUSH           → Push mode
  EAM_SYNC_MODE          = PULL           → Pull mode
  EAM_SYNC_MODE          = BIDIRECTIONAL  → Bidirectional mode
  EAM_DESTINATION_NAME   = <BTP dest>     → Destination Service pointer
  EAM_SYSTEM_ID          = <system code>  → Which EAM landscape
  EAM_PLANT              = <WERKS>        → SAP Plant for all objects
```

At runtime, the integration service layer reads these keys on each sync operation. No `if/else` in application code; integration adapters check the config before any outbound call.

### Per-Record Override

Each `Bridges` record has `eamSyncMode` (proposed, see Phase 4). This allows:
- Specific bridges to be excluded from integration (`eamSyncMode = 'STANDALONE'`)
- Test bridges to use pull-only (`eamSyncMode = 'PULL'`)
- Global default from `SystemConfig.EAM_SYNC_MODE` applies when `eamSyncMode = null`

---

## 5.3 Standalone Mode Behaviour

```
EAM_INTEGRATION_ENABLED = false
```

| Aspect | Behaviour |
|---|---|
| EAM reference fields | All null / empty — hidden from UI (UI annotation `@UI.Hidden: { $edmJson: { $Eq: [eamSyncStatus, null] } }` pattern) |
| Sync actions (triggerSync, pullFromEAM) | Return 400 / info message: "EAM integration not enabled" — AppConfig check |
| ChangeLog | Only BIS changes logged; no EAMSync entries |
| EAMSyncLog | No entries created |
| DQ Rules | DQ rules that reference EAM fields are disabled (rule.config = {"requireEam": false}) |
| Data | All data is BIS-owned; no external dependencies |

---

## 5.4 EAM-Integrated Mode — Integration Topology

```
┌────────────────────────────────────────────────────────────────┐
│   SAP BTP (Cloud Foundry)                                      │
│                                                                │
│  ┌──────────────┐    OData        ┌──────────────────────────┐ │
│  │  BIS CAP app │ ─────────────→  │ Destination Service      │ │
│  │  (Node.js)   │                 │ (named destination:       │ │
│  │              │ ←──────────────  │  EAM_DESTINATION_NAME)   │ │
│  └──────┬───────┘    OData resp   └──────────┬───────────────┘ │
│         │                                    │                 │
│         │ HANA Cloud                         │ Cloud Connector │
│         ▼                                    ▼                 │
│  ┌──────────────┐              ┌─────────────────────────────┐ │
│  │  SAP HANA    │              │  On-Premise / Private Cloud  │ │
│  │  (BIS data)  │              │  SAP S/4HANA or EAM system   │ │
│  └──────────────┘              │  (PM module)                 │ │
│                                │                              │ │
│                                │  Released APIs:              │ │
│                                │  API_FUNCTIONALLOCATION      │ │
│                                │  API_EQUIPMENT               │ │
│                                │  API_MAINTENANCENOTIFICATION │ │
│                                │  API_MAINTENANCEORDER        │ │
│                                │  API_MEASUREMENTDOCUMENT     │ │
│                                └─────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

**Key components**:
1. **BTP Destination Service**: Stores EAM endpoint URL, credentials (OAuth2 or Basic), SSL certs. Name stored in `SystemConfig.EAM_DESTINATION_NAME`. No URL hardcoded in code.
2. **Cloud Connector / Connectivity Service**: If EAM is on-premise, Cloud Connector tunnels the connection.
3. **Released OData APIs**: All integration uses SAP API Business Hub released APIs only (clean-core). No RFC/BAPI direct calls.
4. **BIS Integration Service** (to be designed — PROPOSED): A new CAP service `EAMIntegrationService` that orchestrates sync operations, handles error/retry, and writes to `EAMSyncLog`.

---

## 5.5 Integration Service Design (PROPOSED)

```cds
// PROPOSED — not applied
service EAMIntegrationService @(path: '/eam-integration') {
  @requires: 'integration'
  action syncBridgeToEAM(bridgeId: String) returns EAMSyncResult;

  @requires: 'integration'
  action pullBridgeFromEAM(eamFlocId: String) returns EAMSyncResult;

  @requires: 'integration'
  action syncInspectionToEAM(inspectionId: UUID) returns EAMSyncResult;

  @requires: 'integration'
  action syncDefectToEAM(defectId: UUID) returns EAMSyncResult;

  @requires: 'integration'
  action batchSyncTrigger(filter: String) returns { queued: Integer; message: String };

  @requires: ['manage', 'integration']
  @readonly
  entity EAMSyncLog as projection on bridge.management.EAMSyncLog;

  type EAMSyncResult {
    bisId        : String;
    eamId        : String;
    status       : String;   // SUCCESS | CONFLICT | ERROR
    message      : String;
    syncedAt     : Timestamp;
  }
}
```

---

## 5.6 Field Ownership / Precedence Matrix

This matrix defines which system OWNS each data field in each mode. When a field is EAM-owned, BIS treats it as read-only; when BIS-owned, EAM should not overwrite it on pull.

| Field Group | Standalone | EAM Push | EAM Pull | Bidirectional |
|---|---|---|---|---|
| **Bridge Identity** (bridgeId, bridgeName, bridgeId) | BIS | BIS | EAM (TPLNR/PLTXT) | BIS (last-write-wins; conflict on PLTXT) |
| **Location** (lat/lng, state, region, lga) | BIS | BIS | BIS-local (EAM has no lat/lng) | BIS |
| **Structural** (material, structureType, yearBuilt) | BIS | BIS → EAM (Classification push) | EAM Classification pull | EAM primary; BIS override in BIS-LOCAL fields |
| **Condition** (condition, conditionRating) | BIS | BIS → Measurement Document | Measurement Document → BIS | EAM primary (measurement doc is SoR) |
| **Approvals** (hmlApproved, bDoubleApproved, freightRoute) | BIS | BIS | BIS-LOCAL (no EAM equiv.) | BIS |
| **Restrictions** (all Restriction/BridgeRestriction fields) | BIS | BIS → Classification | Classification → BIS | Conflict-prone (1:N EAM limitation) |
| **Inspections** (BridgeInspections fields) | BIS | BIS → Maintenance Order | MO → BIS | Bidirectional with conflict timestamp |
| **Defects** (BridgeDefects fields) | BIS | BIS → Maintenance Notification | MN → BIS | EAM primary (QMNUM is authoritative) |
| **Capacities** (BridgeCapacities fields) | BIS | BIS → Measurement Docs | Measurement Docs → BIS | EAM primary (measurement doc SoR) |
| **EAM Ref fields** (eamFlocId, eamEquipId, etc.) | null/hidden | BIS-generated on push | Populated on pull | Always BIS-local (key store) |
| **Audit** (createdAt, modifiedAt, createdBy) | BIS | BIS | BIS | BIS |
| **GIS / Documents** | BIS | BIS-LOCAL | BIS-LOCAL | BIS-LOCAL |

---

## 5.7 Conflict Resolution Strategy

For BIDIRECTIONAL mode, the following rules apply:

| Conflict Type | Resolution | Config Key |
|---|---|---|
| BIS modifiedAt > EAM AEDAT | BIS wins | EAM_CONFLICT_STRATEGY = BIS_WINS |
| EAM AEDAT > BIS modifiedAt | EAM wins | EAM_CONFLICT_STRATEGY = EAM_WINS |
| Timestamps equal | Flag as CONFLICT; require manual resolution | EAM_CONFLICT_STRATEGY = MANUAL |
| EAM field deleted | Keep BIS value; log warning | Always |
| BIS soft-deleted (isDeleted=true) | Do not push delete to EAM; set eamSyncStatus=RETIRED | Always |

Conflict records are stored in `EAMSyncLog` with `eamReturnCode = 'CONFLICT'` and require `integration` scope to resolve.

---

## 5.8 UI Behaviour per Mode

All UI behaviour is declarative — no JavaScript code branches. Uses CAP `@UI.Hidden` with `$edmJson` expressions that read the `eamSyncStatus` and `eamSyncMode` fields.

| UI Element | Standalone | EAM Integrated |
|---|---|---|
| EAM Reference tab on Bridge Object Page | Hidden (eamFlocId is null) | Visible |
| EAM sync action buttons (Push to EAM, Pull from EAM) | Hidden | Visible (gated by `integration` scope) |
| eamSyncStatus badge | Hidden | Visible in Object Page header |
| EAM IDs on Inspection Object Page | Hidden | Visible |
| EAM IDs on Defect Object Page | Hidden | Visible |
| Integration admin tile | Always visible to `admin` (shows config keys) | Same |
