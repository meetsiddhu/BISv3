// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE PLUGIN: mapping — generic source→target translation store.
// Self-contained + additive (CLAUDE.md §2.1). A domain is a named translation space
// (e.g. EAM_CODE, EAM_FIELD, or any vendor/partner domain). Portable: another app can
// `using` this file + drive the resolver by domainCode. No BIS specifics here.
// ─────────────────────────────────────────────────────────────────────────────
namespace plugins.mapping;
using { cuid, managed } from '@sap/cds/common';

entity MappingDomain : cuid, managed {
  domainCode   : String(40)  not null;                 // business key, e.g. 'EAM_CODE'
  name         : String(111);
  description   : String(255);
  sourceSystem : String(40);                           // e.g. 'BIS'
  targetSystem : String(40);                           // e.g. 'EAM'
  direction    : String(20)  default 'BIDIRECTIONAL';  // TO_TARGET | FROM_TARGET | BIDIRECTIONAL
  active       : Boolean     default true;
  values       : Composition of many MappingValue on values.domain = $self;
}

entity MappingValue : cuid, managed {
  domain        : Association to MappingDomain not null;
  sourceKey     : String(255) not null;                // e.g. 'BridgeInspections:inspectionType:Routine'
  targetKey     : String(255) not null;                // e.g. 'ILART:PM01'
  description   : String(255);
  transformRule : String(255);                         // optional expression / codelist ref
  active        : Boolean     default true;
}
