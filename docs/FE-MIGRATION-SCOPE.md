# Fiori Elements Migration — Scoped Plan

> Concrete, evidence-based plan to reach "annotation-based where possible" for
> certification. Supersedes the earlier "canonicalise on the facade" idea — the
> facade stack turned out to be dead/incomplete (see Finding). 2026-06-17.

## Finding (corrects the earlier recommendation)

A full per-app audit shows the codebase is **not** two clean stacks. It is:

- **Working deployed Fiori Elements apps on the scattered services** — `admin-bridges`,
  `restrictions` (both on `/odata/v4/admin`), `prioritisation-report`
  (`/odata/v4/prioritisation-analytics`). These prove FE works on the real services.
- **Dead facade-bound UI apps** — `operations/*` and `bms-business-admin/*` (FE apps
  on `/bridge-management`): **not deployed, not in the launchpad, referenced
  nowhere**, several viewer-only. *(Removed in Phase 0.)* **Note:** the
  `BridgeManagementService` facade *service itself* is **live** — it backs the
  deployed bulk-edit/upload actions and is test-covered — so it was kept. Only the
  unused UI apps were dead.

**Therefore the canonical target is: scattered services (`AdminService` /
`PrioritisationService`) + Fiori Elements** — extend the pattern the working FE
apps already use. Retire the dead facade stack rather than adopt it.

## Per-screen scope (deployed apps)

Legend — Effort: S ≤1d · M 2–4d · L 1–2wk. Risk: Low/Med/High.

| Deployed app | Now | Target | FE-able? | Effort | Risk | Notes |
|---|---|---|---|---|---|---|
| admin-bridges | FE | — | ✅ keep | — | — | Canonical register + Attribute Classes |
| restrictions | FE | — | ✅ keep | — | — | Canonical |
| prioritisation-report | FE | — | ✅ keep | — | — | Canonical analytics |
| **dashboard** | free | FE Overview/ALP | ✅ yes | M | Low | Build OVP on existing KPI entities |
| **bhi-explorer** | free | FE Object Page | ◑ partly | M | Med | Calc-transparency; or justify as viz |
| **bms-admin → RiskBands** | free | FE List Report | ✅ yes | S | Low | `RiskBand` entity |
| **bms-admin → RiskFactors** | free | FE List Report | ✅ yes | S | Low | `RiskConfig` entity |
| **bms-admin → AssetStrategy** | free | FE LR+OP | ✅ yes | M | Low | `AssetClassStrategy` |
| **bms-admin → SystemConfig** | free | FE List Report | ✅ mostly | M | Low | key/value list |
| **bms-admin → ChangeDocuments** | free | FE List Report (RO) | ✅ yes | S | Low | `ChangeLog`, read-only |
| **bms-admin → BnacConfig** | free | FE LR+OP | ✅ yes | S | Low | config entity |
| **bms-admin → GisConfig** | free | FE Object Page | ✅ yes | S | Low | small CRS form |
| **bms-admin → DemoMode** | free | FE OP + actions | ✅ yes | S | Low | 2 action buttons |
| **bms-admin → PrioritisationModels** | free | FE + custom action | ◑ partly | L | Med | criteria/weights tabs OK in FE; template-instantiate + matrix editing need custom sections |
| **bms-admin → AttributeConfig** | free | FE (admin-bridges) | ◑ overlap | M | Med | class-scope config; partly covered by admin-bridges FE |
| **bms-admin → BhiConfig** | free | **deviation** | ❌ no | — | — | weight-matrix editor — keep freestyle (§deviation) |
| **bms-admin → Shell** | free | dissolves | n/a | — | — | nav host; replaced by FLP when screens become apps |
| **prioritisation → Worklist** | free | FE List Report | ✅ yes | M | Med | banded run list |
| **prioritisation → Assess/HV/Capital** | free | **deviation** | ❌ no | — | — | interactive calculators — keep freestyle |
| **map-view** | free | **deviation** | ❌ no | — | — | geospatial — keep freestyle |
| **mass-edit** | free | **deviation** | ❌ no | — | — | bulk action — keep freestyle |
| **mass-upload** | free | **deviation** | ❌ no | — | — | CSV file upload — keep freestyle |

### Tally
- **Cleanly FE-able now:** 9 screens (dashboard + RiskBands, RiskFactors, AssetStrategy, SystemConfig, ChangeDocuments, BnacConfig, GisConfig, DemoMode) + Worklist. Mostly S/M, Low risk.
- **Partial / needs custom sections:** 3 (bhi-explorer, PrioritisationModels, AttributeConfig). M–L, Med.
- **Justified deviations (stay freestyle):** 6 (BhiConfig, prioritisation Assess/HV/Capital, map-view, mass-edit, mass-upload). Documented in CERTIFICATION-READINESS.md.

## Phased plan

**Phase 0 — Retire dead UI apps (DONE 2026-06-17, zero functionality loss)**
Deleted `app/operations/*` and `app/bms-business-admin/*` (7 dead Fiori-Elements UI
apps: not deployed, not in the launchpad, referenced nowhere). Archived externally.
**Correction (verified):** the `BridgeManagementService` facade (`srv/service.cds` +
`srv/service.js` + `srv/services/*`) is **NOT dead — it is live and load-bearing**:
it implements the `massEditBridges` / `massUploadBridges` bulk actions that back the
deployed mass-edit/mass-upload apps, is secured by `srv/access-control.cds`, and is
covered by `test/bulk-operations.test.js`. It was therefore **kept**. Only the
unused UI apps that *bound to* the facade were removed. Validated: 387 tests pass
(incl. bulk-operations), `cds build` + `mbt build` clean.

**Phase 1 — Quick FE wins (IN PROGRESS)**
Discovery: the `admin-bridges` FE app already hosts FE versions of GISConfig,
ChangeDocuments (`ChangeDocumentReportList`), EAM mappings and report ALPs — and
`RiskBand`, `RiskConfig`, `AssetClassStrategy` already carry full `@UI.LineItem`
annotations. So Phase 1 is mostly *wiring*, not new apps.
- ✅ **Done (2026-06-17):** added FE List Report + Object Page **targets/routes**
  for `RiskBand`, `RiskConfig`, `AssetClassStrategy` into `admin-bridges` +
  `crossNavigation` inbounds. UI build + `cds build` + `mbt build` + 387 tests all
  pass. They are now annotation-based FE screens in the canonical FE app, running
  in parallel with the freestyle originals (no regression).
- ☐ **Remaining (needs deployed instance + browser UAT):** surface FLP tiles in
  `fioriSandboxConfig`, validate the tiles route to the correct FE page in the
  launchpad, then **retire the freestyle `bms-admin` tabs** (RiskBands, RiskFactors,
  AssetStrategy). Add `SystemConfig` annotations + target. *Retiring working
  freestyle screens is deferred until UAT confirms the FE versions — per the
  zero-functionality-loss rule, we do not delete a working screen on unvalidated
  routing.*

**Phase 2 — Dashboard + DemoMode + Worklist (≈1 wk, Low–Med)**
dashboard → FE Overview Page; DemoMode → FE OP with actions; prioritisation
Worklist → FE List Report. Leaves only the genuine interactive screens custom.

**Phase 3 — Partial/complex (≈1–2 wk, Med)**
PrioritisationModels and AttributeConfig → FE with custom action sections (or fold
AttributeConfig into admin-bridges). bhi-explorer → FE OP or sign off as viz.

**Phase 4 — Certification hardening (≈1–2 wk)**
WCAG 2.2 AA accessibility pass (axe + manual) on all remaining apps incl. the 6
deviations; OPA5/wdi5 smoke tests for critical journeys; confirm Horizon theme;
finalise the deviation register sign-off.

## Effort summary

| Phase | Scope | Effort | Risk |
|---|---|---|---|
| 0 | Retire dead facade stack | S (~1d) | Low |
| 1 | 7 config lists → FE | ~1 wk | Low |
| 2 | dashboard + DemoMode + Worklist → FE | ~1 wk | Low–Med |
| 3 | PrioritisationModels, AttributeConfig, bhi-explorer | ~1–2 wk | Med |
| 4 | Accessibility + OPA5 + theme + sign-off | ~1–2 wk | Med |
| **Total** | to certifiable | **≈5–7 wk** | Mostly Low–Med |

After Phase 3 the deployed surface is **~75% Fiori Elements** with 6 documented,
justified freestyle deviations — a defensible certification posture.
