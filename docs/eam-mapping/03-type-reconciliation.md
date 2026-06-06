# Phase 3 — Type Reconciliation

> Analysis-only — no files modified.  
> EAM ABAP type notation used: DATS (date), TIMS (time), CHAR(n), NUMC(n), DEC(p,s), QUAN, CURR, LANG.

---

## 3.1 Date Fields

| BIS Field | BIS CAP Type | EAM ABAP Type | EAM API Type | Compatible? | Issue / Action |
|---|---|---|---|---|---|
| inspectionDate | Date | DATS | Edm.Date | YES | Both ISO 8601 YYYY-MM-DD |
| nextInspectionDue | Date | DATS | Edm.Date | YES | |
| effectiveFrom | Date | DATS | DATS | YES | |
| effectiveTo | Date | DATS | DATS | YES | |
| temporaryFrom | Date | DATS | DATS | YES | |
| temporaryTo | Date | DATS | DATS | YES | |
| ratingDate | Date | DATS | DATS | YES | |
| clearanceSurveyDate | Date | DATS | DATS | YES | |
| nhvrAssessmentDate | Date | DATS | Edm.Date | YES | |
| lastInspectionDate | Date | DATS | Edm.Date | YES | Denormalised field; sync requires source inspection |
| conditionRatingDate (nhvr.Bridge) | Date | DATS | DATS | YES | |
| documentDate | Date | DATS | DATS | YES | |
| expiryDate | Date | DATS | DATS | YES | |
| targetCompletionDate | Date | DATS | DATS | YES | |
| gazettePublicationDate (nhvr.Restriction) | Date | DATS | n/a — classification | CLASSIFICATION | Store as CHAR in classification |

**No TIMS (time) fields in BIS** — no reconciliation needed.

---

## 3.2 Numeric Key Fields (NUMC Zero-Padded)

Critical: SAP EAM key fields are zero-padded NUMC. BIS uses String/Integer without zero-padding.

| EAM Key | ABAP Type | Width | BIS Equivalent | BIS Type | Risk | Required Transform |
|---|---|---|---|---|---|---|
| TPLNR (Functional Location) | CHAR | 30 | bridgeId | String(40) | MEDIUM — TPLNR allows structure separators (e.g. AA-BB-CC); BIS bridgeId is flat alphanumeric | Agree on TPLNR structure with EAM; truncate if > 30 chars |
| EQUNR (Equipment) | NUMC | 18 | bridgeId (Equipment key) | String(40) | HIGH — NUMC = digits only, zero-padded | If using EQUNR as key, BIS must store zero-padded 18-digit string; or use external number range |
| QMNUM (Maintenance Notification) | NUMC | 12 | defectId / inspectionRef | String(40) | HIGH — must zero-pad | Proposed `eamNotifNumber` field stores NUMC(12) |
| AUFNR (Maintenance Order) | NUMC | 12 | inspectionRef | String(40) | HIGH — must zero-pad | Proposed `eamOrderNumber` field stores NUMC(12) |
| MSDOCUMENT (Measurement Doc) | NUMC | 18 | (no current field) | — | MEDIUM — capacity sync only | Proposed measurement doc reference field |

**Action required** (PROPOSED):
- Add `eamFlocId` String(30) to Bridges for TPLNR
- Add `eamEquipId` String(18) to Bridges for EQUNR (zero-padded NUMC)
- Add `eamNotifNumber` String(12) to BridgeDefects for QMNUM
- Add `eamOrderNumber` String(12) to BridgeInspections for AUFNR

---

## 3.3 Decimal / Quantity Fields

| BIS Field | BIS Type | EAM ABAP Type | UoM Required | Compatible? | Issue |
|---|---|---|---|---|---|
| grossMassLimit | Decimal(9,2) | QUAN | T (tonnes) | YES — after UoM attachment | EAM QUAN requires explicit UoM field; BIS has none |
| axleMassLimit | Decimal(9,2) | QUAN | T | YES — after UoM | Same issue |
| heightLimit | Decimal(9,2) | QUAN | M (metres) | YES — after UoM | |
| widthLimit | Decimal(9,2) | QUAN | M | YES — after UoM | |
| lengthLimit | Decimal(9,2) | QUAN | M | YES — after UoM | |
| loadRating | Decimal(9,2) | QUAN | T | YES — after UoM | |
| spanLength | Decimal(9,2) | QUAN | M | YES — after UoM | |
| totalLength | Decimal(9,2) | QUAN | M | YES — after UoM | |
| deckWidth | Decimal(9,2) | QUAN | M | YES — after UoM | |
| clearanceHeight | Decimal(9,2) | QUAN | M | YES — after UoM | |
| ratingFactor | Decimal(9,4) | DEC | — (dimensionless) | YES | |
| consumedLife | Decimal(9,2) | DEC | % | YES | % not an SI unit in EAM but stored as DEC |
| heavyVehiclePercent | Decimal(5,2) | DEC | % | YES | |
| latitude | Decimal(15,6) | DEC | — | YES | EAM GIS extension uses same precision |
| longitude | Decimal(15,6) | DEC | — | YES | |

**Pattern**: All QUAN fields that map to EAM require a paired UoM string. BIS stores units in a separate `unit` field on Restrictions (String(20)) or encodes them in the field name. EAM characteristic type QUAN requires `<CHAR>_UNIT` alongside the value characteristic.

---

## 3.4 Boolean Fields (CHAR1 in EAM Classification)

EAM classification characteristics have no Boolean type. Boolean values must be stored as CHAR(1) with values 'X' (true) / ' ' (false).

| BIS Field | BIS Type | EAM Characteristic Type | Conversion Rule |
|---|---|---|---|
| highPriorityAsset | Boolean | CHAR(1) | true→'X', false→'' |
| floodImpacted | Boolean | CHAR(1) | true→'X', false→'' |
| freightRoute | Boolean | CHAR(1) | true→'X', false→'' |
| overMassRoute | Boolean | CHAR(1) | true→'X', false→'' |
| hmlApproved | Boolean | CHAR(1) | true→'X', false→'' |
| bDoubleApproved | Boolean | CHAR(1) | true→'X', false→'' |
| nhvrAssessed | Boolean | CHAR(1) | true→'X', false→'' |
| permitRequired | Boolean | CHAR(1) | true→'X', false→'' |
| escortRequired | Boolean | CHAR(1) | true→'X', false→'' |
| fatigueSensitive | Boolean | CHAR(1) | true→'X', false→'' |

---

## 3.5 Status / Code Fields

| BIS Field | BIS Values (examples) | EAM Mapping | Risk |
|---|---|---|---|
| status (Bridges) | Active / Inactive | FLOC/Equipment user status (AVLB, DLFL) | MEDIUM — custom status profile needed |
| condition (Bridges) | GOOD / FAIR / POOR / CRITICAL | No standard EAM field; classification CHAR | LOW — BIS-defined |
| postingStatus | UNRESTRICTED / RESTRICTED / CLOSED | Classification characteristic | LOW |
| restrictionStatus | Active / Inactive / Expired | Classification characteristic | LOW |
| restrictionCategory | Permanent / Temporary | Classification characteristic | LOW |
| capacityStatus | Current / Under Review / Superseded | Measurement point status | LOW |
| defect.status | Open / In Progress / Closed | MN system status (OSNO/INPR/NOCO) | MEDIUM — SAP system status is complex |
| inspectionType | Principal/Detailed/Routine | Maintenance Activity Type ILART | MEDIUM — code table mapping |

---

## 3.6 String Length Truncation Risks

| BIS Field | BIS Length | EAM Field | EAM Length | Risk |
|---|---|---|---|---|
| bridgeName | 111 | PLTXT (FLOC description) | 40 | HIGH — must truncate or use long text |
| bridgeName | 111 | EQKTX (Equipment name) | 40 | HIGH |
| inspectionRef / defectId | 40 | AUFNR / QMNUM (NUMC) | 12 | HIGH — format incompatible |
| bridgeId | 40 | TPLNR (FLOC ID) | 30 | MEDIUM |
| bridgeId | 40 | EQUNR (Equipment) | 18 | HIGH — not just truncation; NUMC format |
| legalReference | 111 | Classification CHAR | 60–120 | LOW if char is defined wide enough |
| defectDescription | LargeString | QMTXT short text | 40 | HIGH — must use long text for full description |
| inspectionNotes | LargeString | Order long text | unlimited | LOW — long text object |
| engineeringNotes | LargeString | Measurement doc text | limited | MEDIUM |

---

## 3.7 Language-Dependent Text

| BIS Field | BIS Handling | EAM Handling | Issue |
|---|---|---|---|
| bridgeName | Single language string | EQKTX is language-dependent (multiple EQUKT rows) | BIS has no language variant |
| structureType (code description) | sap.common.CodeList with name/descr | ABAP text table per language | Code-list descriptions need language mapping |
| restrictionType (code description) | sap.common.CodeList | Classification characteristic text | EAM characteristic values have language texts |

**Recommendation**: BIS is single-language (en-AU). EAM by default uses EN. No immediate multi-language risk, but be aware if the organisation goes multi-lingual.

---

## 3.8 Timestamp / Audit Fields

| BIS Field | BIS Type | EAM Equivalent | Compatible? |
|---|---|---|---|
| createdAt | Timestamp | ERDAT (DATS) + ERUHR (TIMS) | PARTIAL — EAM splits date/time; BIS combines |
| modifiedAt | Timestamp | AEDAT (DATS) + AEUHR (TIMS) | PARTIAL |
| createdBy | String(111) | ERNAM (CHAR12) | TRUNCATION — BIS 111 chars vs EAM 12 chars |
| modifiedBy | String(111) | AENAM (CHAR12) | TRUNCATION |

---

## 3.9 Integer Ranges

| BIS Field | BIS Type | Range Constraint | EAM Equivalent | Issue |
|---|---|---|---|---|
| yearBuilt | Integer | [1800, 2100] | BAUJJ (NUMC4) | Compatible — NUMC4 is 0000–9999 |
| importanceLevel | Integer | [1, 4] | Classification NUMC | Compatible |
| conditionRating | Integer | [1, 10] | Measurement value | Compatible |
| speedLimit | Integer | [0, 130] | Classification QUAN | Compatible |
| severity | Integer | [1, 4] | PRIOK NUMC1 | Compatible — EAM priority 1-4 |
| accreditationLevel | Integer | [1, 4] | (no EAM equiv.) | BIS-LOCAL |
| spanCount | Integer | [1, 500] | Classification | Compatible |
| numberOfLanes | Integer | [1, 20] | Classification | Compatible |

---

## 3.10 Summary of Type Issues

| Severity | Issue | Count | Action Required |
|---|---|---|---|
| HIGH | NUMC key format mismatch (EQUNR 18, QMNUM 12, AUFNR 12) | 4 fields | Add eam*Number fields; zero-pad transform |
| HIGH | String truncation for EAM 40-char name fields | 3 fields | Add short-name fields or truncation logic |
| MEDIUM | UoM missing on QUAN fields | ~10 fields | Document UoM assumption per characteristic |
| MEDIUM | Boolean → CHAR1 conversion | 10 fields | Conversion function in integration layer |
| MEDIUM | Timestamp → DATS+TIMS split | 4 fields | Split/merge transform in sync layer |
| LOW | Code table mapping (BIS codes ≠ EAM codes) | ~8 code lists | Mapping table in SystemConfig or separate entity |
| LOW | Language-dependent text | 2 fields | Accept EN-only for now |
