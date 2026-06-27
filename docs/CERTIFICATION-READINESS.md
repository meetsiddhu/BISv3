# SAP BTP / Fiori Certification Readiness

> Living assessment of BridgeManagement (BIS) against SAP standards for BTP /
> Fiori app certification. Standing principle: **prefer Fiori Elements
> (annotation-based) over freestyle UI5; use standard SAP ways; call out every
> deviation here.** Last updated **2026-06-28 (v3.55.1)**.

---

## 2026-06-22 update (v3.55.0) — current status (supersedes stale items below)

A council UAT pass (PO·QA·UX·Dev·Security) was run against 3.55.0. **Net verdict unchanged:
strong foundation, not yet certifiable** — but the blocker set has narrowed.

**Closed / improved since v3.19.x:**
- **Dual writable facade (was §2, the #1 blocker) — resolved.** The `BridgeManagementService`
  facade is now **read-only** (verified: `PATCH /bridge-management/Bridges → 405`); **AdminService
  is the single writer**. There is one canonical write path.
- **i18n — gaps closed.** The freestyle BMS-admin screens (SystemConfig/GisConfig/BnacConfig) +
  dashboard/mass-edit tooltips were hardcoded; all externalised to i18n in 3.55.0.
- **Security — audited GOOD.** `@restrict` on every entity, CSV formula-injection escaping, CSRF on
  all mutation routes, ChangeLog on every CUD, no secrets. Plus 3.55.0 sanitises 5xx error responses
  (no internal-detail leakage).
- **Supply-chain HIGH closed (v3.55.1).** A D18 supply-chain audit flagged a HIGH advisory in the
  `xlsx` (SheetJS) dependency — prototype pollution (GHSA-4r6h-8v6p-xvw6) + ReDoS
  (GHSA-5pgg-2g8v-p4x9) — that the **npm registry never patched** (frozen at 0.18.5). This is a live
  exposure because the **mass-upload** feature parses user-supplied spreadsheets via `XLSX.read`.
  **Mitigation applied:** pinned `xlsx` to the vendor's official patched **0.20.3** from
  `cdn.sheetjs.com` (the SheetJS-recommended remediation; above the 0.19.3 / 0.20.2 patch lines),
  with the integrity hash locked in `package-lock.json`. `npm audit --omit=dev` is now **clean**
  (0 vulnerabilities). Defence-in-depth on the parse path is unchanged: auth + `manage` scope + CSRF,
  plus the config-driven 50MB file-size cap (`MAX_UPLOAD_FILE_BYTES`) and row caps. **Build-env note:**
  CI/MTA `npm ci` must be able to reach `cdn.sheetjs.com` (the patched build is not on npm).
- **Tests — 448/448 green** (55 suites); OPA5 journeys + a coverage-regression gate exist.
- `attributes-admin` freestyle duplicate removed.

**Remaining blockers to "certifiable" (priority order):**
1. **Accessibility** (WCAG 2.2 AA / EN 301 549) — still **untested**. Highest-risk on the freestyle
   apps. *Hard requirement for SAP UI certification.*
2. **FE migration** of dashboard + simple bms-admin config screens + bhi-explorer (the rest are
   justified freestyle deviations — §4).
3. **Test rigour** — ~53% coverage / ~58% mutation vs. ~70/75% SAP-grade target.
4. **Horizon theme** consistency confirmation across all apps; broaden OPA5/wdi5 coverage.

**Publishing ≠ code.** SAP Store listing additionally requires **SAP PartnerEdge (Build)** + a formal
**SAP ICC certification** (e.g. *"SAP Certified – Built on SAP BTP"*) + security/data-privacy
attestations + a support/SLA model. Confirm current program names with SAP — these are business/
process gates no code change satisfies.

> The detailed tables in §1–§5 below are retained for history; where they conflict with this block,
> this block (3.55.0) is current.

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

- **2026-06-28 (v3.55.1):** Closed the D18 supply-chain HIGH in `xlsx` (SheetJS) — pinned to the
  vendor's patched **0.20.3** from `cdn.sheetjs.com` (npm's frozen 0.18.5 had prototype-pollution +
  ReDoS advisories with no npm fix). `npm audit --omit=dev` now clean; 558/558 tests green; no code
  or behaviour change (same `xlsx` API). See the supply-chain bullet in the 2026-06-22 block.
  **Also (runtime):** migrated **Node 20 → 22 LTS** (BTP CF Node.js buildpack dropped 20.x; only
  22/24 remained, so deploys failed to stage). Updated the four Node pins + CLAUDE.md §1 recorded
  decision; re-verified 558/558 on Node 22. **Deployed to BTP `dev`** and verified live: `/health`
  reports `version 3.55.1`, app route returns 302→launchpad (the prior 404 was the apps being
  stopped, not a routing fault).
- **2026-06-22 (v3.55.0):** Council UAT pass. Recorded the dual-facade resolution (facade now
  read-only, AdminService the single writer), i18n gap closure on the freestyle admin screens,
  5xx error-message sanitisation, and the GOOD security audit. Restated remaining blockers
  (accessibility, FE migrations, test rigour) + the SAP Store partner/ICC process gate. See the
  "2026-06-22 update" block at the top.
- **2026-06-17:** Removed `attributes-admin` (freestyle duplicate; admin-bridges
  FE + bms-admin AttributeConfig cover it). Documented dual-facade finding and
  the deviation register. Added mutation testing (Stryker, 58% baseline,
  break-gate 50%) and a coverage-regression gate.
