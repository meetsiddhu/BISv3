using { cuid, managed } from '@sap/cds/common';

namespace bridge.management;

/**
 * Configurable Attribute Groups — object-type-specific.
 * One group belongs to exactly one object type (bridge | restriction | ...).
 * Two groups with the same name on different object types are independent records.
 */
entity AttributeGroups : cuid, managed {
  objectType   : String(40)  not null;
  name         : String(111) not null;
  internalKey  : String(80)  not null;
  displayOrder : Integer     default 0;
  status       : String(20)  default 'Active';
  definitions  : Composition of many AttributeDefinitions
                   on definitions.group = $self;
}

/**
 * Attribute Definitions — the metadata for each configurable attribute.
 * internalKey is set once and never changed after values are saved.
 * dataType must not change after any AttributeValues exist for this key.
 */
entity AttributeDefinitions : cuid, managed {
  group        : Association to AttributeGroups not null;
  objectType   : String(40)  not null;
  name         : String(111) not null;
  internalKey  : String(80)  not null;
  dataType     : String(20)  not null; // Text|Integer|Decimal|Date|Boolean|SingleSelect|MultiSelect
  unit         : String(40);
  helpText     : String(255);
  displayOrder : Integer     default 0;
  minValue     : Decimal(15,4);
  maxValue     : Decimal(15,4);
  regexPattern : String(255);
  status       : String(20)  default 'Active';
  allowedValues     : Composition of many AttributeAllowedValues
                        on allowedValues.attribute = $self;
  objectTypeConfigs : Composition of many AttributeObjectTypeConfig
                        on objectTypeConfigs.attribute = $self;
}

/**
 * Allowed values for SingleSelect / MultiSelect attributes.
 * Removal is blocked if any AttributeValue references this value.
 */
entity AttributeAllowedValues : cuid {
  attribute    : Association to AttributeDefinitions not null;
  value        : String(255) not null;
  label        : String(255);
  displayOrder : Integer     default 0;
  status       : String(20)  default 'Active';
}

/**
 * Per-object-type configuration for each attribute.
 * Enabled, required, and display-order override are set independently per object type.
 * Disabling does NOT delete stored values — re-enabling restores them.
 */
entity AttributeObjectTypeConfig : cuid, managed {
  attribute    : Association to AttributeDefinitions not null;
  objectType   : String(40) not null;
  enabled      : Boolean    default true;
  required     : Boolean    default false;
  displayOrder : Integer;
}

/**
 * EAV table — current attribute values per object instance.
 * One row per (objectType, objectId, attributeKey).
 * Typed value columns: only the column matching the attribute's dataType is populated.
 */
entity AttributeValues : cuid, managed {
  objectType   : String(40)   not null;
  objectId     : String(100)  not null;
  attributeKey : String(80)   not null;
  valueText    : String(2000);
  valueInteger : Integer;
  valueDecimal : Decimal(15,4);
  valueDate    : Date;
  valueBoolean : Boolean;
}

/**
 * Append-only audit log for every attribute value change.
 * changeSource distinguishes manual edits from bulk imports and API writes.
 */
entity AttributeValueHistory {
  key historyId    : UUID;
  objectType       : String(40);
  objectId         : String(100);
  attributeKey     : String(80);
  oldValueText     : String(2000);
  oldValueInteger  : Integer;
  oldValueDecimal  : Decimal(15,4);
  oldValueDate     : Date;
  oldValueBoolean  : Boolean;
  newValueText     : String(2000);
  newValueInteger  : Integer;
  newValueDecimal  : Decimal(15,4);
  newValueDate     : Date;
  newValueBoolean  : Boolean;
  changedBy        : String(255);
  changedAt        : Timestamp;
  changeSource     : String(20)  default 'manual'; // manual | import | api
}

/**
 * SAP EAM code mapping — translates BIS code values to SAP EAM (S/4HANA) code
 * values for clean-core integration. Admin-maintained; no hardcoded mappings.
 * e.g. BridgeInspections.inspectionType 'Principal' -> ILART 'PM02'.
 */
entity EAMCodeMapping : cuid, managed {
  bisEntity    : String(60)  not null;  // e.g. BridgeInspections
  bisField     : String(80)  not null;  // e.g. inspectionType
  bisValue     : String(100) not null;  // BIS code value
  eamTableName : String(30);            // e.g. ILART, QMART
  eamValue     : String(30);            // SAP EAM code value
  description  : String(255);
  active       : Boolean default true;
}

/**
 * SAP EAM FIELD mapping (EAM-2 / OQ-07) — admin-configurable BIS<->EAM field map so the
 * integration layer NEVER hardcodes mappings. One row per field per direction.
 * e.g. Bridges.bridgeName -> EAM FunctLocation PLTXT, direction TO_EAM.
 */
entity EAMFieldMapping : cuid, managed {
  bisEntity     : String(60)  not null;  // e.g. Bridges
  bisField      : String(80)  not null;  // e.g. bridgeName
  eamObject     : String(40)  not null;  // EAM object e.g. FunctionalLocation / Equipment / Notification
  eamField      : String(40)  not null;  // EAM field e.g. PLTXT
  direction     : String(15)  default 'BIDIRECTIONAL'; // TO_EAM | FROM_EAM | BIDIRECTIONAL | NONE
  transformRule : String(255);           // optional expression/codelist ref
  active        : Boolean default true;
  notes         : String(255);
}

/**
 * SAP EAM SYNC LOG (EAM-3) — append-only audit trail of every EAM sync operation,
 * SEPARATE from business ChangeLog so integration failures are auditable on their own.
 * Read-only in the service. This app COMPLEMENTS EAM — it records the linkage/sync, it
 * does not execute EAM work.
 */
entity EAMSyncLog : cuid {
  syncAt        : Timestamp;
  syncBy        : String(111);
  operation     : String(20);   // PUSH | PULL | LINK | UNLINK
  objectType    : String(40);   // Bridge | Inspection | Defect | Restriction
  bisObjectId   : String(40);
  eamObjectId   : String(40);
  eamSystem     : String(40);
  httpStatus    : Integer;
  eamReturnCode : String(20);
  eamMessage    : String(1000);
  durationMs    : Integer;
  batchId       : String(40);
  changeSource  : String(20) default 'EAMSync';
}
