# Classification & Characteristics — SAP EAM Alignment

How BIS's configurable classes/characteristics map to SAP classification (ECC + S/4HANA), what
we deliver, the ECC/S4 limitations we deliberately overcome, and the no‑code extensibility model.

## 1. SAP classification model → BIS model

| SAP (ECC / S/4HANA) | Transaction(s) | BIS equivalent |
|---|---|---|
| **Class** (with a **Class Type** — 002 Equipment, 003 FLOC, …) | CL01/CL02 (CL6BN) | `AttributeGroups` (+ `objectType` = the class type: Bridge / Restriction) |
| **Characteristic** (CABN) — data type, length, value table | CT04 | `AttributeDefinitions` (`dataType`, `unit`, `min/maxValue`, `regexPattern`, `displayType`) |
| **Characteristic allowed values** (CAWN) | CT04 | `AttributeAllowedValues` (value, label, status) |
| **Single / multiple value, entry required** | CT04 flags | `dataType` SingleSelect vs MultiSelect; `AttributeObjectTypeConfig.required` |
| **Object classification** — assign class(es) to an object | CL20N / CL24N | `ObjectClassAssignment` (objectType, objectId → class) |
| **Characteristic values for an object** (AUSP) | CL20N | `AttributeValues` (typed EAV per object) |
| **Class/characteristic where‑used + reporting** | CL30N, CL6Q, table joins AUSP/CABN/CAWN | OData `AttributeValues`, Change Documents report, mass‑upload export (XLSX) |

The conceptual chain is identical to EAM: **Class Type → Class → Characteristics (typed, with
allowed values, required) → assign class(es) to an object → fill characteristic values.**

## 2. What BIS delivers (feature parity + beyond)

- **Characteristic data types:** Text, Integer, Decimal, Date, Boolean, SingleSelect, MultiSelect.
- **Allowed values** with active/inactive (disabled values are rejected on entry **and** import).
- **Single vs multiple value** (SingleSelect / MultiSelect).
- **Entry required (mandatory):** a `required` characteristic in an **assigned** class must be
  filled when the object is saved — enforced server‑side (422) on the form **and** validated on
  mass‑import. An unclassified object has no required fields.
- **Display/control hint** (beyond CT04): `displayType` = Auto / Dropdown / RadioGroup / Checkbox /
  MultiComboBox / Input — the data‑entry control adapts. (ECC has no per‑characteristic UI control.)
- **Object classification UX:** a **searchable, multi‑select** class picker (scales to hundreds/
  thousands of classes) replaces ECC's modal CL20N grid. An **unclassified** object shows **no**
  characteristics (true EAM behaviour) — pick class(es) and only those characteristics appear.
- **Min/max + regex validation** per characteristic (server‑enforced).
- **Object‑type + asset‑class scoping** (`AttributeObjectTypeConfig`) so a characteristic can be
  enabled/required differently per class type and asset class.
- **Full change history** per characteristic value (`AttributeValueHistory`) → Change Documents report.

## 3. ECC / S/4 limitations we overcome

| ECC / S/4 pain | BIS |
|---|---|
| Classification UI (CL20N) is a heavy modal transaction; assigning classes is clunky | Inline panel on the object page + searchable multi‑select dialog |
| No per‑characteristic display control (always input/dropdown) | `displayType` (radio / checkbox / multi‑combo / …) |
| Characteristic values live in AUSP keyed by internal counters — reporting needs CABN/CAWN/AUSP joins | Typed `AttributeValues`, OData‑queryable, one‑click XLSX export |
| Mass maintenance needs LSMW / BAPIs / eCATT | Built‑in **mass upload + mass update** (create & change) with a generated template |
| New characteristic/class = config + **transport** across landscapes | **No code, no transport** — admin adds a class/characteristic and it is live immediately |
| Required not enforced consistently outside the dialog | Enforced on the form **and** the bulk import path (one rule) |

## 4. No‑code, fully dynamic extensibility

Adding or changing what data is collected is **pure configuration** — no code, no deployment:
1. **Attribute Classes** tile → create a **Class** (set Object Type = Bridge/Restriction, Status).
2. Add **Characteristics** (data type, display type, allowed values, min/max/regex, **Required**).
3. Scope per class type / asset class via **Object‑Type Scoping** (enabled/required).
4. On an object → **Edit** → **Select Classes…** → its characteristics appear for data entry.

The register, the class picker, mass‑upload template/import, and validation all read the **same**
config (`classification.resolve`) — one source of truth, so they never drift.

## 5. Reportable · downloadable · mass upload/update

- **Save:** characteristic values persist in `AttributeValues` (audited in `AttributeValueHistory`).
- **Report:** the **Change Documents** report carries every characteristic change (old/new/when/who);
  `AttributeValues` is OData‑queryable for custom reports/tiles.
- **Download:** **Mass‑upload Export** produces an XLSX with per‑object‑type **Attributes sheets** —
  every object and its current characteristic values.
- **Mass upload / update:** the same workbook is re‑imported to **create or change** values in bulk;
  the import honours the active config (enabled characteristics, allowed values) and the language of
  create/change is selectable (Create‑only / Update‑only / Upsert).

## 6. Boundary (per CLAUDE.md §4b)

This is the bridge‑**engineering** specialist + classification layer; it **complements** SAP EAM,
it does not replicate the maintenance‑execution / asset‑master system of record. `eamClass` /
`eamCharacteristic` map a BIS class/characteristic to its S/4 counterpart for integration.
