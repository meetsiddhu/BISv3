# Phase 6 — Third-Party ID & URL Registry Design

> PROPOSED design only — no files modified.  
> All entity definitions are PROPOSED and must go through review/approval before implementation.  
> Design is modelled on the existing BNAC pattern (BnacEnvironment + BnacObjectIdMap) and the  
> Restrictions gold-reference UI pattern.

---

## 6.1 Design Goals

1. Generic cross-reference: any BIS object (Bridge, Restriction, Inspection, Defect) can be linked to any number of external systems.
2. External System registry driven by AppConfig — no hardcoded URLs or system codes.
3. UI pattern modelled on the Restrictions tab (multi-row, inline add/edit/deactivate, validity dates).
4. EAM support: maps to FLOC Alternative Labelling (TPLNR2 / alternative label sets in IS-RE/PM).
5. Graceful standalone-mode behaviour: tab hidden or empty when no systems registered.

---

## 6.2 External System Registry Entity (PROPOSED)

```cds
// PROPOSED — not applied
// namespace bridge.management
entity ExternalSystem {
  key systemCode   : String(40);   // e.g. 'EAM-PRD', 'BNAC-PRD', 'GIS-ARCGIS', 'NHVR-PORTAL'
  displayName      : String(111);  // Human-readable name shown in UI tab and value list
  systemCategory   : String(40);   // EAM / BNAC / GIS / NHVR / OTHER
  baseUrl          : String(511);  // No trailing slash; no hardcoded in code
  environment      : String(20);   // DEV / TEST / PREPROD / PROD
  urlPattern       : String(511);  // URL template, e.g. '{baseUrl}/equipment/{externalId}'
  idLabel          : String(111);  // Label for the ID field in the UI, e.g. 'FLOC ID', 'BNAC Object ID'
  idFormat         : String(20);   // NUMC18 / CHAR30 / UUID / FREE
  active           : Boolean default true;
  sortOrder        : Integer default 0;
  description      : LargeString;
  // Audit
  modifiedAt       : Timestamp;
  modifiedBy       : String(111);
}
```

**Key design decisions**:
- `systemCode` is the stable programmatic key — never renamed after objects are linked.
- `urlPattern` supports simple template substitution: `{baseUrl}`, `{externalId}`, `{bisObjectId}`.
- `idFormat` tells the UI which validation to apply (NUMC18 = digits only, 18 chars; etc.).
- Managed in the Admin tile under a new "External Systems" section (admin-only).
- XSUAA: read: all authenticated; create/update/delete: admin.

---

## 6.3 Object Cross-Reference Entity (PROPOSED)

```cds
// PROPOSED — not applied
// namespace bridge.management
entity ObjectExternalRef : cuid, managed {
  bisObjectType    : String(40) not null;   // 'Bridge' | 'Restriction' | 'BridgeInspection' | 'BridgeDefect' | 'BridgeCapacity'
  bisObjectId      : String(100) not null;  // BIS primary key (bridgeId for Bridges, UUID for others)
  bisObjectName    : String(255);           // Denormalised display name (bridgeName, restrictionRef, etc.)
  externalSystem   : Association to ExternalSystem not null;
  externalId       : String(255) not null;  // The ID in the external system
  externalUrl      : String(1024);          // Computed or manual URL to the external record
  idType           : String(60);            // e.g. 'FLOC', 'EQUIPMENT', 'NOTIFICATION', 'ORDER', 'BNAC_OBJECT'
  idLabel          : String(111);           // Display label override (falls back to ExternalSystem.idLabel)
  validFrom        : Date;                  // When this mapping became valid
  validTo          : Date;                  // When this mapping expires (null = no expiry)
  active           : Boolean default true;
  isDeleted        : Boolean default false;
  syncStatus       : String(20) default 'MANUAL'; // MANUAL | AUTO | SYNCED | CONFLICT | ERROR
  syncedAt         : Timestamp;
  notes            : String(500);
}
```

**Indexes (PROPOSED)**:
```cds
annotate ObjectExternalRef with @(cds.persistence.indexes: [
  { name: 'idx_extref_bis', columns: ['bisObjectType', 'bisObjectId'] },
  { name: 'idx_extref_sys', columns: ['externalSystem_systemCode'] },
  { name: 'idx_extref_active', columns: ['active', 'isDeleted'] }
]);
```

---

## 6.4 EAM Mapping: FLOC Alternative Labelling

In SAP PM/IS-RE, a Functional Location can have multiple **alternative labels** (table IFLOTX / IFLOALT). The `ObjectExternalRef` entity models this as:

| ObjectExternalRef Field | Maps To EAM | Example Value |
|---|---|---|
| externalSystem.systemCode | 'EAM-PRD' | EAM production system |
| idType | 'FLOC' | Functional Location |
| externalId | TPLNR value | '0001-NSW-SYD-BRIDG-00123' |
| externalId (Equipment) | idType='EQUIPMENT', EQUNR | '000000000012345678' |
| externalId (MN) | idType='NOTIFICATION', QMNUM | '000000012345' |
| externalId (MO) | idType='ORDER', AUFNR | '000000012345' |

For FLOC alternative labelling specifically:
- The EAM FLOC has a primary label (TPLNR) and can have alternative labels per label set (EBELN table).
- BIS `bridgeId` maps to the alternative label in EAM label set 'BIS' (to be configured in EAM).
- `ObjectExternalRef` stores the forward mapping: BIS bridgeId → EAM TPLNR.
- This allows FLOC IDs to change in EAM without breaking the BIS record (update TPLNR in ObjectExternalRef, not in Bridges).

---

## 6.5 BNAC Migration (Supersede BnacObjectIdMap with ObjectExternalRef)

The existing `BnacObjectIdMap` entity can be migrated/superseded by `ObjectExternalRef`:

| BnacObjectIdMap field | ObjectExternalRef equivalent |
|---|---|
| bridgeId (KEY) | bisObjectId with bisObjectType='Bridge' |
| bnacObjectId | externalId |
| bnacUrl | externalUrl (computed) |
| loadedAt, loadedBy, loadBatchId | syncedAt, managed fields, notes |
| environment (via BnacEnvironment) | externalSystem.systemCode (EAM-PRD/BNAC-PRD etc.) |

**PROPOSED migration path** (not implemented):
1. Seed `ExternalSystem` records for existing BNAC environments.
2. Migrate `BnacObjectIdMap` rows to `ObjectExternalRef` rows with `bisObjectType='Bridge'`, `idType='BNAC_OBJECT'`.
3. Deprecate `BnacObjectIdMap` (keep read-only for 1 release cycle).
4. Remove `BnacObjectIdMap` in a subsequent release.

---

## 6.6 UI5 Tab Design — "External References" Tab

Modelled on the Restrictions gold-reference pattern (multi-row table, inline actions, validity dates, conditional visibility).

### Placement

On the Bridge Object Page (admin-bridges app), add a new tab after "Data Provenance":

```
Core Identity & Location | Physical Characteristics | NHVR & Traffic Approvals | Data Provenance | [External References ← NEW]
```

### Tab Structure (PROPOSED)

```
Tab: External References
  ┌─────────────────────────────────────────────────────────────────┐
  │ System        │ Type      │ External ID       │ URL  │ Valid  │ Status │ [Add]
  │─────────────────────────────────────────────────────────────────│
  │ EAM-PRD       │ FLOC      │ 0001-NSW-BRIDGE   │ [↗] │ Active │ SYNCED │ [Edit] [Deactivate]
  │ BNAC-PRD      │ BNAC      │ BNAC-00123        │ [↗] │ Active │ MANUAL │ [Edit] [Deactivate]
  │ NHVR-PORTAL   │ NHVR Ref  │ NHVR-REF-2024     │ [↗] │ Active │ MANUAL │ [Edit] [Deactivate]
  └─────────────────────────────────────────────────────────────────┘
```

### UI5 Fiori Elements Design

```cds
// PROPOSED — not applied
annotate AdminService.ObjectExternalRef with @(
  UI.HeaderInfo: {
    TypeName: 'External Reference',
    TypeNamePlural: 'External References',
    Title: { Value: externalId },
    Description: { Value: externalSystem.displayName }
  },
  UI.LineItem: [
    { Value: externalSystem.displayName, Label: 'System' },
    { Value: idType,                     Label: 'Reference Type' },
    { Value: externalId,                 Label: 'External ID' },
    { Value: externalUrl,                Label: 'URL', $Type: 'UI.DataFieldWithUrl', Url: externalUrl },
    { Value: validFrom,                  Label: 'Valid From' },
    { Value: validTo,                    Label: 'Valid To' },
    { Value: syncStatus,                 Label: 'Sync Status' },
    { Value: active,                     Label: 'Active' }
  ],
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', Label: 'Reference Details', Target: '@UI.FieldGroup#ExtRefDetails' },
    { $Type: 'UI.ReferenceFacet', Label: 'Validity',          Target: '@UI.FieldGroup#ExtRefValidity' },
    { $Type: 'UI.ReferenceFacet', Label: 'Sync Status',       Target: '@UI.FieldGroup#ExtRefSync' }
  ]
);
```

### Inline Actions (PROPOSED)

Same Deactivate / Reactivate pattern as Restrictions:

```cds
// PROPOSED
entity ObjectExternalRef ... actions {
  action deactivate() returns ObjectExternalRef;
  action reactivate() returns ObjectExternalRef;
}
```

---

## 6.7 Standalone Mode Behaviour

When `EAM_INTEGRATION_ENABLED = false` AND no `ExternalSystem` records are configured:

- The External References tab is **visible but empty** (with a "No external systems configured" message).
- The [Add] button is visible to `manage` role — allows manual cross-reference entry for BNAC or NHVR links without EAM integration.
- The EAM-specific fields (`eamFlocId`, `eamEquipId` on Bridges) remain hidden.
- This supports the use case where the organisation wants to record NHVR portal URLs or BNAC IDs manually even in standalone mode.

---

## 6.8 Security Model

| Action | Required Scope |
|---|---|
| Read ExternalSystem list | view |
| Read ObjectExternalRef | view |
| Create/update ObjectExternalRef manually | manage |
| Create/update ExternalSystem | admin |
| Delete ExternalSystem | admin |
| Trigger automated sync (populate externalId from EAM) | integration (proposed) |
| Deactivate / reactivate ObjectExternalRef | manage |

---

## 6.9 ChangeLog Integration

Every create/update/deactivate on `ObjectExternalRef` should write to `ChangeLog` with:
- `objectType` = 'ObjectExternalRef'
- `objectId` = the `bisObjectId`
- `objectName` = `bisObjectName` (e.g. bridge name)
- `fieldName` = field changed (externalId, syncStatus, active, etc.)
- `changeSource` = 'OData' (manual) or 'EAMSync' (automated)

---

## 6.10 URL Pattern Computation

The `externalUrl` on `ObjectExternalRef` can be computed at display time from:
```
externalSystem.urlPattern.replace('{baseUrl}', externalSystem.baseUrl)
                          .replace('{externalId}', externalId)
                          .replace('{bisObjectId}', bisObjectId)
```

Example:
- `urlPattern` = `{baseUrl}/pm/FunctionalLocation/{externalId}`
- `baseUrl` = `https://my-eam.example.com`
- Result: `https://my-eam.example.com/pm/FunctionalLocation/0001-NSW-BRIDGE`

This computation happens in the CAP service handler on `READ` — no stored computed URL that can go stale. The stored `externalUrl` field is an override for cases where the pattern doesn't apply.
