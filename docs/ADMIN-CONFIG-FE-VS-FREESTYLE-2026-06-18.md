# Admin Config — Fiori Elements vs Freestyle Guide
**Date:** 2026-06-18 · **Scope:** the BIS admin/configuration surface · **Audience:** product owner, future maintainers, certification reviewers

## TL;DR
- There is **one config store**, two editing front-ends. Every config screen — freestyle (`bms-admin`) and Fiori Elements (`admin-bridges`) — and the runtime engines all read/write the **same `bridge.management.*` tables** through `AdminService`. Editing in either UI hits the same data; they cannot diverge.
- **4 config areas are clean Fiori Elements candidates** (already built as FE List Report/Object Page, currently read-only): Risk Bands, Risk Factors, Asset Class Strategy, System Settings.
- **Attribute Classes is now fully FE-editable** (v3.22.0): class → characteristics → allowed values, plus SAP-EAM class/characteristic mapping fields.
- **5 areas must stay freestyle** (interactive / multi-entity / file-upload / live-validation): BSI/BHI weight editor, Prioritisation Models, BNAC CSV loader, GIS layer library, advanced Change Documents, Demo Mode.
- **A single "one tile + side panel" admin already exists** — the `bms-admin` `sap.tnt.ToolPage` + `SideNavigation` shell. Pure Fiori Elements **cannot** render a side-nav by itself; it always needs a hosting shell (freestyle ToolPage or `sap.f.FlexibleColumnLayout`). Consolidation is deferred by decision (see below).

---

## 1. Architecture — one source of truth, two editors
```
        BMS Administration (freestyle)            Configuration (Fiori Elements)
        sap.tnt ToolPage + SideNavigation         admin-bridges List Report / Object Page
                  │  writes via                              │  reads/writes via
                  │  _svc.create/update + /system/api        │  OData V4 (annotation-driven)
                  ▼                                          ▼
                 ┌──────────────────────────────────────────────┐
                 │   AdminService  (srv/admin-service.cds)        │  projections on ↓
                 └──────────────────────────────────────────────┘
                 ┌──────────────────────────────────────────────┐
                 │   bridge.management.*  (db tables)             │  ← single source of truth
                 │   RiskBand · RiskConfig · AssetClassStrategy   │
                 │   SystemConfig · AttributeGroups · …           │
                 └──────────────────────────────────────────────┘
                  ▲ runtime engines read the SAME tables:
                  admin-service.js (BHI/risk scoring), prioritisation-service.js,
                  system-config.js (getConfig), mass-upload.js
```
**Implication:** the FE screens did **not** create a parallel config. Whichever surface an admin uses, the runtime reads the same rows. Integrity (RiskBand ladder, AssetClassStrategy bounds, `@assert.range`) is enforced at the **service layer**, so every write path is governed regardless of UI. See [docs/DECISION-CONFIG-SCREENS-2026-06-18.md](DECISION-CONFIG-SCREENS-2026-06-18.md) and the memory note *cap-capabilities-server-enforced* (CAP Node enforces `@Capabilities.*Restrictions` server-side, which is why FE config is made read-only via **Delete-only** restriction rather than full read-only — full read-only would block the freestyle editors writing to the same projection).

---

## 2. Classification — per config area

Legend: **FE-ready** = standard List Report/Object Page fits as-is · **Hybrid** = FE for the core, custom/freestyle for an advanced sub-feature · **Freestyle** = keep custom (FE would lose function or fight the framework).

| # | Config area | Backing entity / endpoint | UI today | Verdict | Why |
|---|---|---|---|---|---|
| 1 | **Risk Factors** | `RiskConfig` (OData /admin) | freestyle table+dialog **+** FE read-only LR/OP | **FE-ready** ✅ | single-entity CRUD, numeric-range validation only |
| 2 | **Risk Bands** | `RiskBand` | freestyle table+dialog **+** FE read-only LR/OP | **FE-ready** ✅ | single entity; ladder invariant already enforced server-side (`admin-service.js` after-CREATE/UPDATE) |
| 3 | **Asset Class Strategy** | `AssetClassStrategy` | freestyle table+dialog **+** FE read-only LR/OP | **FE-ready** ✅ | single entity + value-help comboboxes; uniqueness/bounds → service layer |
| 4 | **System Settings** | `SystemConfig` (+ `/system/api`) | freestyle category tabs **+** FE read-only LR/OP | **FE-capable** ⚠️ | key-value CRUD fits FE; category tabs → FE filter facets; deployed-constant rows need editable-binding care |
| 5 | **Attribute Classes** (classes + characteristics) | `AttributeGroups` → `AttributeDefinitions` → `AttributeAllowedValues` | FE draft LR/OP (**now full create**, v3.22.0) + freestyle 3-panel editor | **FE-ready** ✅ (core) / **Hybrid** (advanced) | draft composition tree = class→characteristics→allowed-values editable in FE; **bulk import/export + per-class scope (`AttributeObjectTypeConfig`)** stay in the freestyle 3-panel editor |
| 6 | **Prioritisation Models** | `Models / ModelCriteria / ModelClassWeights / ModelRules` | freestyle 4-tab editor | **Hybrid** | could be Model OP + sub-OPs, but the model selector-cascade + "Use Template" copy action are custom |
| 7 | **GIS Config** | `GISConfig` (singleton) + `ReferenceLayerConfig` | freestyle multi-panel form + WMS table | **Hybrid** | base form is FE-able; custom-WMS inline-array + conditional visibility + JSON serialization → child OP / freestyle |
| 8 | **Change Documents** (audit) | `ChangeLog` / `ChangeDocumentReport` | freestyle filtered+grouped + KPIs (basic FE read-only LR exists) | **Freestyle** (FE LR as lite view) | advanced filters + KPI tiles + grouped field-level diff exceed stock FE LR |
| 9 | **BSI / BHI Config** | `/system/api/bhi-config` (`srv/lib/bhi.js`) | freestyle 3-tab weight/coefficient editor, live ∑=1.0 validation | **Freestyle** | cross-product mode×bucket grid + live sum-validation + dirty-tracking — no FE template fit |
| 10 | **BNAC Config** | `/bnac/api/*` | freestyle env table + CSV upload + load history | **Freestyle** | file upload + multi-stream + non-OData submission |
| 11 | **Demo Mode** | unbound actions `loadDemoData` / `clearDemoData` | freestyle action panel | **Freestyle** | operational control panel with destructive actions, not data-CRUD |

**Net:** 4 clean FE candidates (already built) + Attribute Classes now FE-editable (5 total leaning FE) · 2 hybrids · 4 must-stay-freestyle.

---

## 3. "Nothing-lost" mapping (if/when areas migrate to FE)
For each area, what would need to be preserved so a migration loses no function:

- **Risk Bands / Factors / Asset Strategy / System Settings** → already mirrored in FE. To make FE the *editor* (not just viewer) you must (a) retire the freestyle editor for that entity so there is one write path, and (b) handle the CAP draft/`@Capabilities` constraint (today they are FE-read-only by deliberate decision). Server-side guards already cover integrity.
- **Attribute Classes** → done in FE for class+characteristic+allowed-value CRUD. Still needs the freestyle editor for **bulk Excel import/export** and **per-(objectType, assetClass) scope** (`AttributeObjectTypeConfig`) — those are custom-action / matrix UIs.
- **Prioritisation Models** → would need a Model Object Page with sub-Object-Pages for Criteria/Weights/Rules and a **custom bound action** for "Use Template" (copy).
- **GIS Config** → base form maps to an OP; custom-WMS layer library needs a child OP or stays a freestyle inline table; preset-lock + JSON-array handling are custom.
- **Change Documents** → FE LR can show the flat list; the **KPI header + grouped-by-object diff + advanced source filters** would need an OP extension or stay freestyle.
- **BSI/BHI, BNAC, Demo Mode** → no FE equivalent is worthwhile; keep freestyle (documented engineering/ops tools).

---

## 4. Single "one tile + side panel" admin — feasibility
- **It already exists.** `app/bms-admin/webapp/view/Shell.view.xml` is a `sap.tnt.ToolPage` + `SideNavigation` + `NavContainer` with 11 config sections in one tile. This is the proven precedent for the UX "one admin tile, left side panel, all configs inside."
- **Fiori Elements cannot do a side-nav alone.** FE List Report/Object Page are per-entity and routed individually (one tile or one route each). A unified left-nav shell requires a **hosting container**: a freestyle `sap.tnt.ToolPage` or `sap.f.FlexibleColumnLayout` that embeds the FE components (`ComponentContainer`). That hybrid is technically possible (UI5 1.136) but adds routing/state/test integration cost and is a non-standard pattern for cert review.
- **Decision (this session):** consolidation is **deferred**. Options when revisited: (A) reuse the `bms-admin` ToolPage shell and fold the split-out config tiles into its side-nav (fast, freestyle); (B) hybrid shell embedding FE components (cert-leaning, more effort). Pure-FE separate tiles is the current state.

---

## 5. Attribute Classes — what changed in v3.22.0 (this session)
**User report:** the *Attribute Classes* tile "goes to the Bridges register instead of letting me create classes & characteristics."

**Findings:**
1. **Routing:** verified live — on the healthy deployment the tile correctly opens the *Attribute Classes* (AttributeGroups) List Report. The earlier "lands on Bridges register" was a symptom of the **broken deployment state** (manifest-v2 / html5-runtime cache fault) where the cross-app deep-link fell through to the default route; it resolves correctly now (no config change needed).
2. **Real gap:** the class Object Page had only a *Class* header facet — **no Characteristics table** — so you could create a class but not its characteristics. Fixed by adding FE annotations:
   - A **Characteristics** table facet on the class OP (`definitions/@UI.LineItem`), inline-creatable within the class draft.
   - Full FE annotations on `AttributeDefinitions` (characteristics) incl. an **Allowed Values** table (`allowedValues/@UI.LineItem`).
   - Result: create a class → add characteristics → add allowed values, saved as one draft document.
3. **SAP EAM mapping (additive):** new optional fields `AttributeGroups.eamClass` and `AttributeDefinitions.eamCharacteristic` (free-text codes, same lightweight pattern as `EAMCodeMapping.eamValue` / `EAMFieldMapping.eamField`), exposed in the FE forms so each BIS class/characteristic maps to its SAP EAM (S/4) class/characteristic. Complements EAM per CLAUDE.md §4b — it records the linkage, it does not replicate EAM.

Files: `db/attributes-schema.cds` (2 additive fields), `app/admin-bridges/fiori-service.cds` (FE annotations). No routing/FLP-config change.
