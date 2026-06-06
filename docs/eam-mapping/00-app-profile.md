# Phase 0 — Application Profile

| Item | Value |
|---|---|
| **App Name** | Bridge Management System (BMS / BIS) |
| **CAP Version** | @sap/cds ^9 |
| **Node** | 20.x |
| **DB (prod)** | SAP HANA Cloud |
| **DB (dev)** | SQLite |
| **Auth** | XSUAA (dedicated tenant) |
| **Repo Path** | `/Users/siddharthaampolu/46 Bridge info system V3/BridgeManagement` |
| **Analysis Date** | 2026-06-05 |
| **Analysis Mode** | READ-ONLY — no files modified |

---

## 1. CDS Schema Files

| File | Namespace | Entities |
|---|---|---|
| `db/schema/types.cds` | `nhvr` | Type aliases only |
| `db/schema/core.cds` | `nhvr` | `Bridge` (legacy slim entity) |
| `db/schema/restrictions.cds` | `nhvr` | `Restriction` (legacy slim entity), extends `Bridge` |
| `db/schema/admin.cds` | `nhvr` | `Lookup`, `RoleConfig` |
| `db/schema.cds` | `bridge.management` | **Main barrel** — all 20+ entities listed below |
| `db/attributes-schema.cds` | `bridge.management` | EAV sub-system (5 entities) |

### Main Domain Entities (`bridge.management` namespace)

| Entity | Purpose | Key Type |
|---|---|---|
| `Bridges` | Primary bridge/asset master | Integer (ID) |
| `Restrictions` | Hierarchical restriction tree (self-parent) | UUID (cuid) |
| `BridgeRestrictions` | Flat bridge-level restriction records | UUID (cuid) |
| `BridgeCapacities` | Structural capacity records (AS 5100.7) | UUID (cuid) |
| `BridgeInspections` | Inspection records | UUID (cuid) |
| `BridgeDefects` | Defect records linked to inspections | UUID (cuid) |
| `BridgeDocuments` | Document/attachment store | UUID (cuid) |
| `BridgeAttributes` | Legacy EAV (superseded) | UUID (cuid) |
| `GISConfig` | GIS singleton config | String 'default' |
| `ChangeLog` | Append-only audit trail | UUID |
| `SystemConfig` | Application configuration KV store | String(80) |
| `BnacEnvironment` | External BNAC system environment registry | String(20) |
| `BnacObjectIdMap` | Bridge → BNAC object ID cross-reference | bridgeId String(40) |
| `BnacLoadHistory` | BNAC import batch audit | UUID |
| `MassUploadLog` | Mass upload batch audit | UUID |
| `DataQualityRules` | Configurable DQ rule definitions | UUID |
| `UserActivity` | User session tracking | userId String |
| `ReferenceLayerConfig` | GIS reference layers (WMS/XYZ/ArcGIS/GeoJSON) | UUID (cuid) |

### Code-list Entities (sap.common.CodeList pattern, 14 total)
`AssetClasses`, `States`, `Regions`, `StructureTypes`, `DesignLoads`, `PostingStatuses`, `CapacityStatuses`, `ConditionStates`, `PbsApprovalClasses`, `ConditionSummaries`, `StructuralAdequacyTypes`, `RestrictionTypes`, `RestrictionStatuses`, `VehicleClasses`, `RestrictionCategories`, `RestrictionUnits`, `RestrictionDirections`

### EAV Sub-system (`db/attributes-schema.cds`)

| Entity | Role |
|---|---|
| `AttributeGroups` | Group definitions per object type |
| `AttributeDefinitions` | Attribute metadata (type, validation, help text) |
| `AttributeAllowedValues` | Pick-list values for SingleSelect/MultiSelect attrs |
| `AttributeObjectTypeConfig` | Per-object-type enable/required/order overrides |
| `AttributeValues` | Current values (typed columns) |
| `AttributeValueHistory` | Append-only audit log for EAV changes |

---

## 2. Service Layer

| Service | Path | Entities exposed |
|---|---|---|
| `AdminService` | `/admin-bridges` | Bridges, Restrictions, BridgeRestrictions, BridgeCapacities, BridgeInspections, BridgeDefects, BridgeDocuments, all CodeLists, EAV config, GISConfig, SystemConfig, DataQualityRules, BNAC config, ChangeLog, UserActivity |
| `BridgeManagementService` | `/bridge-management` | Bridges, Restrictions, ActiveRestrictions, BridgeAttributes, BridgeGrid, BridgeLocations, Lookups, AuditLogs, RoleConfigs + KPI/Dashboard functions |

---

## 3. UI5 Applications (Fiori Elements)

| Tile / App Folder | Service | Primary Entity | Purpose |
|---|---|---|---|
| `app/admin-bridges` | AdminService | Bridges + BridgeRestrictions + BridgeCapacities + BridgeInspections + BridgeDefects | Admin bridge management (List Report + Object Page with 8 sub-tabs) |
| `app/attributes-admin` | AdminService | AttributeGroups + AttributeDefinitions | Custom attribute schema admin |
| `app/bms-business-admin/bms-admin` | AdminService | SystemConfig + GISConfig + DataQualityRules | System admin |
| `app/bms-business-admin/mass-edit` | BridgeManagementService | BridgeGrid | Mass edit of condition/posting/approvals |
| `app/bms-business-admin/mass-upload` | BridgeManagementService | (actions) | CSV bulk upload |
| `app/operations/bridges` | BridgeManagementService | Bridges | Operational bridge view |
| `app/operations/dashboard` | BridgeManagementService | KPI functions | Dashboard tile |
| `app/operations/map-view` | BridgeManagementService | BridgeLocations | GIS map view |
| `app/operations/restrictions` | BridgeManagementService | Restrictions | Operational restrictions list |
| `app/restrictions` | AdminService | Restrictions (tree + flat) | Admin restrictions management with tree-view |

### Restrictions Tile — Gold Reference Pattern

The Restrictions object page is the most elaborated UI pattern in the codebase:
- **4-tab layout**: Restriction Classification → Physical Limits → Validity & Approval → Notes
- **Hierarchical tree view** via `@Aggregation.RecursiveHierarchy` (self-parent Restrictions entity)
- **Conditional field visibility**: Temporary sub-section fields hidden when `restrictionCategory != 'Temporary'`
- **Inline actions**: Deactivate / Reactivate with `@Common.SideEffects`
- **Draft support**: `@odata.draft.enabled` + `@fiori.draft.enabled`
- This pattern is the reference for any new integration tab (e.g. EAM References tab)

---

## 4. AppConfig / Configuration Entities

| Entity | Category | Role |
|---|---|---|
| `SystemConfig` | KV store (configKey → value) | Application-level toggles; categories: Export, Map, Quality, Upload, Display, Security |
| `GISConfig` | Singleton | GIS basemap, feature flags, thresholds |
| `BnacEnvironment` | External system registry | DEV/PREPROD/PROD base URLs for BNAC |
| `DataQualityRules` | Rule engine | Configurable DQ rules with JSON config payload |
| `ReferenceLayerConfig` | GIS layers | WMS/XYZ/ArcGIS/GeoJSON layer registry |
| `RoleConfig` (nhvr namespace) | RBAC | Field-level visibility/editability overrides per role |

---

## 5. ChangeLog Entity

```
entity ChangeLog {
  key ID      : UUID;
  changedAt   : Timestamp;
  changedBy   : String(111);
  objectType  : String(40);   // Bridge | Restriction | GISConfig | Lookup
  objectId    : String(111);
  objectName  : String(255);
  fieldName   : String(111);
  oldValue    : LargeString;
  newValue    : LargeString;
  changeSource: String(40);   // OData | MassEdit | MassUpload
  batchId     : String(111);
}
```

Key observations:
- `objectType` is a free String — must be extended for new integration objects
- `changeSource` should gain 'EAMSync' as a value when integration is added
- Exposed as `AuditLogs` in `BridgeManagementService` (manage+admin) and `ChangeLog` in `AdminService` (manage)

---

## 6. XSUAA Scopes and Roles

| Scope | Description |
|---|---|
| `$XSAPPNAME.admin` | Full access including admin tile config |
| `$XSAPPNAME.manage` | Create/edit/delete bridges and restrictions |
| `$XSAPPNAME.view` | Read-only |

| Role Template | Scopes | Role Collection |
|---|---|---|
| `BMS_ADMIN` | admin + manage + view | BMS Administrator |
| `BMS_MANAGER` | manage + view | BMS Manager |
| `BMS_VIEWER` | view | BMS Viewer |

**Gap**: No integration-specific scope (e.g. `$XSAPPNAME.integration`) for EAM sync operations. This would be needed for a proposed `syncEAM` action.

---

## 7. i18n Bundles

| Location | Coverage |
|---|---|
| `app/_i18n/i18n.properties` | Minimal: Age, Lifetime, Details, SubRestrictions, NumCode, validation messages (MANDATORY_FIELD_MISSING, INVALID_INTEGER, etc.) |
| `app/admin-bridges/dist/i18n/i18n.properties` | Compiled/bundled for admin-bridges app |

**Gap**: Field-level labels are almost entirely in `@title` CDS annotations, not in i18n property files. New EAM-related fields must add i18n keys to `app/_i18n/i18n.properties` (and ideally language variants).

---

## 8. External / Integration Code

### Existing: BNAC Integration (partially implemented)

The only external-system integration currently present is with **BNAC** (Bridge Network Asset Condition system):

| Entity | Role |
|---|---|
| `BnacEnvironment` | Stores DEV/PREPROD/PROD base URLs — no hardcoded URLs |
| `BnacObjectIdMap` | `bridgeId → bnacObjectId + bnacUrl` cross-reference |
| `BnacLoadHistory` | Batch import audit trail |

This is a **minimal cross-reference table** — it stores a computed URL and a batch load audit only. There is no OData proxy, no outbound CAP service definition, and no sync status/direction field.

The `BnacObjectIdMap.bnacUrl` is described as "computed: active env baseUrl + bnacObjectId" — assembled at load time, not maintained dynamically.

**This BNAC pattern is the seed for the Third-Party ID Registry design** (Phase 6).

---

## 9. Database Indexes Defined

```
Bridges:      idx_bms_bridge_bridgeId, state, condition, postingStatus
Restrictions: idx_bms_restriction_bridge, status, type
nhvr.Bridge:  idx_bridge_bridgeId, state, condition, isActive, postingStatus
nhvr.Restriction: idx_restriction_bridge, status, type
```

No index on EAV `AttributeValues` (objectType, objectId, attributeKey) — this is a minor gap for large deployments.
