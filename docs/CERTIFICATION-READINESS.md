# SAP BTP / Fiori Certification Readiness

> Living assessment of BridgeManagement (BIS) against SAP standards for BTP /
> Fiori app certification. Standing principle: **prefer Fiori Elements
> (annotation-based) over freestyle UI5; use standard SAP ways; call out every
> deviation here.** Last updated 2026-06-17 (v3.19.x).

---

## Verdict

**Not yet certifiable; strong foundation, UI-layer gaps.** The backend (CAP,
OData V4, HANA, XSUAA, MTA→CF, audit logging, additive schema, clean-core
EAM-complement) is standards-aligned. The blockers are at the UI/architecture
layer: **(1) dual service facade + parallel app sets, (2) freestyle apps where
Fiori Elements would qualify, (3) accessibility untested, (4) no UI automation.**

---

## 1. Standards checklist

| Area | Standard | Status |
|---|---|---|
| Backend framework | SAP CAP, OData V4 | ✅ Met |
| Database | HANA Cloud (prod) / SQLite (dev) | ✅ Met |
| AuthN/AuthZ | XSUAA, 3 scopes, `@restrict` on every entity | ✅ Met |
| Audit logging | `@cap-js/audit-logging` + ChangeLog on every CUD | ✅ Met |
| Deployment | MTA → Cloud Foundry, html5-repo, app-router | ✅ Met |
| Clean core | Standalone, S/4-compatible, EAM-complement boundary | ✅ Met |
| i18n | Per-app resource bundles | ✅ Met |
| Secrets | None in repo (scanned) | ✅ Met |
| Schema discipline | Additive-only | ✅ Met |
| **UI technology** | **Fiori Elements where possible** | ⚠️ **Partial** (§3) |
| **Single app set** | One canonical implementation per screen | ❌ **Gap** (§2) |
| **Accessibility** | WCAG 2.2 AA / EN 301 549 | ⚠️ **Untested** |
| **UI test automation** | OPA5 / wdi5 | ❌ **Gap** |
| Theme | SAP Horizon | ⚠️ Confirm across all apps |
| Test rigour | Coverage / mutation | ⚠️ 50% cov / 58% mutation (gated; below SAP-grade) |

---

## 2. Architecture finding — dual facade + parallel app sets (top blocker)

The codebase carries **two complete stacks** that grew in parallel:

| | Stack A — DEPLOYED | Stack B — parallel (mostly un-deployed) |
|---|---|---|
| Service | `AdminService` `/odata/v4/admin`, `PrioritisationService` `/odata/v4/prioritisation` (scattered) | `BridgeManagementService` `/bridge-management` — a **single facade** aggregating `services/*` |
| Apps | Freestyle: bms-admin, prioritisation, dashboard, map-view, mass-edit, mass-upload, bhi-explorer | Fiori Elements: `operations/*`, `bms-business-admin/*` (bridges, restrictions, map-view, mass-edit/upload) |
| FE deployed from Stack B | `admin-bridges`, `restrictions`, `prioritisation-report` | — |

A certifiable solution needs **one** service facade and **one** app per screen.
**Decision required (product owner):** canonicalise on the `BridgeManagementService`
facade + Fiori Elements apps (preferred for certification), retiring the
duplicate freestyle/scattered stack — or formally retire Stack B. Until then,
the duplication is the #1 certification blocker.

---

## 3. FE-vs-freestyle register (deployed apps)

| App (deployed) | UI tech | Certification action |
|---|---|---|
| admin-bridges (register + Attribute Classes) | **FE ✅** | Keep — canonical |
| restrictions | **FE ✅** | Keep |
| prioritisation-report | **FE ✅** | Keep |
| dashboard | Freestyle | **Migrate** → FE Overview Page / Analytical List Page |
| bms-admin: RiskBands, AssetClassStrategy, lookups, Change Documents, SystemConfig | Freestyle | **Migrate** simple ones → FE List Report + Object Page over config entities |
| bms-admin: BhiConfig (weight matrix) | Freestyle | **Deviation (justified)** — §4 |
| prioritisation: Assess / Worklist / HV / Capital | Freestyle | **Deviation (justified)** — §4 |
| map-view | Freestyle | **Deviation (justified)** — §4 |
| mass-edit | Freestyle | **Deviation (justified)** — §4 |
| mass-upload | Freestyle | **Deviation (justified)** — §4 |
| bhi-explorer | Freestyle | **Migrate** → FE Object Page (or justify as calc viz) |
| ~~attributes-admin~~ | ~~Freestyle~~ | **REMOVED** this session — duplicate of admin-bridges FE |

---

## 4. Deviation register (freestyle that is justified — FE cannot do it cleanly)

Per the standing principle, each freestyle screen that remains must be justified
here. SAP certification permits freestyle with a written rationale.

| Screen | Why FE is not a fit | Standard-aligned mitigation |
|---|---|---|
| **map-view** | Geospatial rendering (Leaflet/tiles, clustering) — no FE template | Use `sap.ui.vbm`/`sap.ui.vk` or keep freestyle with WCAG audit |
| **prioritisation Assess** | Live client-side scoring preview that mirrors the engine as the user edits dimensions | Freestyle; cite as interactive-calculator exception |
| **HV Assessment / Capital Program tabs** | Interactive engineering calculators invoking actions and rendering computed result tables | Freestyle; could become FE Object Page + custom action sections later |
| **BhiConfig** | Per-mode weight **matrix editor** with live Σ-validation | Freestyle; no FE table-matrix template |
| **mass-edit** | Multi-row **bulk action** (`massEditBridges`) over a selection | FE List Report supports inline mass-edit on an *editable* entity; `BridgeGrid` is a read projection + action — keep freestyle OR expose an editable draft entity + FE |
| **mass-upload** | **CSV file upload → action** (`massUploadBridges`) — FE has no native file-upload-to-action pattern | Freestyle file-upload control; the FE "UploadLogs" app is only a *log viewer*, not a replacement |

> Note: the parallel FE `mass-edit`/`mass-upload` apps in `bms-business-admin/*`
> are **List-Report viewers** over `BridgeGrid`/`UploadLogs` — they do **not**
> invoke the bulk-edit / file-upload actions, so swapping to them would *lose*
> functionality. They are therefore not adopted; the freestyle versions are kept
> as the justified deviations above.

---

## 5. Migration plan (staged, to reach certifiable)

1. **Consolidation (in progress)** — remove duplicate/dead apps.
   - ✅ Deleted `attributes-admin` (duplicate of admin-bridges FE).
   - ☐ Product-owner decision on the dual facade (§2), then retire one stack.
2. **FE migrations (annotation-based)** — dashboard, and the simple bms-admin
   config screens (RiskBands, AssetClassStrategy, lookups, Change Documents,
   SystemConfig) → FE List Report + Object Page on the config entities.
3. **Accessibility pass** — WCAG 2.2 AA / EN 301 549 audit (axe + manual) on
   every remaining app; freestyle apps are highest risk.
4. **UI automation** — OPA5/wdi5 smoke tests for the critical journeys.
5. **Theme + polish** — confirm Horizon theme across all apps; consistent shell.
6. **Test rigour** — raise coverage ≥ 70% and mutation ≥ 75% on `srv/lib`.

---

## 6. Change history

- **2026-06-17:** Removed `attributes-admin` (freestyle duplicate; admin-bridges
  FE + bms-admin AttributeConfig cover it). Documented dual-facade finding and
  the deviation register. Added mutation testing (Stryker, 58% baseline,
  break-gate 50%) and a coverage-regression gate.
