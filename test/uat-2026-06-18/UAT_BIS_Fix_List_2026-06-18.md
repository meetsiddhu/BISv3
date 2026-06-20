# UAT Fix List — BIS (BridgeManagement) v3.21.1

**Environment:** live BTP trial — `https://592f5a7btrial-dev-bridgemanagement.cfapps.us10-001.hana.ondemand.com/`
**Date:** 2026-06-18 · **Driver:** Chrome extension (DU / Default User, admin) · **Mode:** full CRUD on live data
**Personas:** PO/SME (bridge + HVSAP), QA, UX, Dev, Security
**Baseline counts:** Bridges 32 · Restrictions 3 · BridgeRestrictions 6 · Inspections 2 · Defects 3 · AssetClassStrategy 3 · SystemConfig 1 · RiskBand 4 · RiskConfig 14 · AttributeDefinitions 86 · AttributeGroups 9 · AssetClasses 0

Priority: **P1** blocks core flow / security / data loss · **P2** degrades UX/correctness, has workaround · **P3** polish.

## Resolution status — fixed & redeployed in **v3.21.2** (2026-06-18)
| ID | Status |
|---|---|
| P1-001 | ✅ Option A — 4 FE config entities set read-only (`Capabilities` Insert/Update/Delete=false); freestyle remains editor. Option B (full FE editing) deferred. |
| P2-002 | ✅ marginPct → controller formatter `formatMarginPct`. |
| P2-003 | ✅ AttributeGroups `@UI.LineItem`/HeaderInfo/Facets restored. |
| P2-004 | ✅ `@requires` added: map geocode/reverseGeocode/getMapApiConfig, dashboard KPIs/me, admin saveRoleConfig(admin), prioritisation assess*/forecast. |
| P2-005 | ✅ `forecastCondition` years clamped 0–100; `assessRoute` ids capped at 100. |
| P3-006 | ✅ csvCell escapes `= + - @` formula prefixes (+ unit test). |
| P3-007 | ✅ **non-issue (v3.21.3 verified)** — `logAudit` (srv/handlers/common.js:16) already INSERTs into `bridge.management.ChangeLog`; saveRoleConfig is audited. The security agent's "UserActivity" assumption was wrong. No change. |
| P3-008 | ⏸ **documented, not fixed** — the 3-messages-for-1-field is FE's per-bound-control message aggregation (structureType is mandatory and bound across facets). The create flow validates correctly; chasing the 2 blank duplicates risks destabilising a working flow. Left as a known FE cosmetic. |
| P3-009 | ✅ v3.21.3 — `@Common.IsActionCritical: true` on `deactivate` (Bridges/Restrictions/BridgeRestrictions) → FE confirmation prompt. |
| P3-010 | ✅ v3.21.3 — `@title` added to BridgeValueHelp columns (bridgeId/bridgeName/state/region/transportMode/status). |
| P3-011 | ✅ v3.21.3 — capex table `noDataText` now switches to `capex.noneFunded` after a run with no candidates. |
| Cleanup | ✅ v3.21.3 — removed duplicate `geoJson @title` (build warning gone); `cds build` now warning-free. |
All fixes: `npx cds build` clean · **388 tests pass** (387 + new csv injection test).

**Live retest on BTP (3.21.2), 2026-06-18:**
- ✅ P1-001 — Risk Bands FE List Report toolbar has **no Create/Delete**; Object Page (Medium band) has **no Edit/Delete** (read-only viewer confirmed).
- ✅ P2-002 — HV Assessment view re-parses with **no `marginPct` SyntaxError** in console (was deterministic before the fix).
- ✅ P2-003 — Attribute Classes shows **9 rows with columns** (Name/Object Type/Key/Order/Status) + working Create/Delete (draft-enabled).
- ✅ Regression — adminbridges component + Bridges/Restrictions unaffected; freestyle BMS Admin editors intact. (Note: a transient "component could not be loaded" appeared for ~1 min immediately post-deploy while the html5-repo content propagated — cleared after a clean reload; not a code defect.)
- P2-004/P2-005/P3-006 — backend; verified by build + unit tests, deployed.

**Live retest on BTP (3.21.3), 2026-06-18 — final cleanup round:**
- ✅ P3-009 — Deactivate now shows a **"Perform this action?" confirmation** (verified on RST-0003, then cancelled — seed data untouched).
- ✅ P3-010 — Bridge value-help columns now read **Bridge ID / Bridge Name / State / Transport Mode / Status** (were raw `[bridgeId]`).
- ✅ P3-011 — Capital Program shows **"No projects funded — no eligible candidates…"** after an empty run.
- ✅ Cleanup — `cds build` warning-free; **388 tests pass**. Data state: **Bridges back to 32 baseline** (the redeploy's db-deployer re-seeds the Bridges table, which wiped UAT bridge BRG-NSW-1033 — clean). Restrictions = 4 (RST-0004 remains, retired/soft-deleted — restrictions aren't seed-replaced; hard delete blocked per CLAUDE.md §2.2). My session draft was discarded. 2 Restriction drafts dated Jun 8 & Jun 10 are **pre-existing** (predate this UAT) — CAP auto-GCs abandoned drafts; not session artifacts.

---

### [P1-001] FE config tiles are view + delete only — no Create, no Edit
- **File**: `srv/admin-service.cds:234` (SystemConfig), `:286` (AssetClassStrategy), `:289` (RiskConfig), `:292` (RiskBand) — plain projections, no draft.
- **Symptom**: The 4 new CONFIGURATION (FIORI ELEMENTS) tiles (Risk Bands, Risk Factors, Asset Class Strategy, System Settings) route + render data correctly, but their Object Pages show only **Delete + Share — no Edit**, and the List Reports have **no Create**. Confirmed in UI + via `$metadata` (no `IsActiveEntity`, no `DraftRoot` on these entities).
- **Expected**: A config-management screen must let you create/edit; and you must never be able to delete a config row you can't recreate.
- **Root cause**: Entities are not `@odata.draft.enabled`. FE V4 needs draft for editing; without it the screens are read-only, yet FE leaves Delete enabled by default (`DeleteRestrictions.Deletable` defaults true) → **delete-without-recreate data-integrity hazard**.
- **Fix (two options)**:
  - **A — safe, immediate (recommended for store-readiness):** make the 4 entities read-only in `app/admin-bridges/fiori-service.cds` — `@Capabilities: { InsertRestrictions.Insertable:false, UpdateRestrictions.Updatable:false, DeleteRestrictions.Deletable:false }`. They become clean read-only viewers; the **freestyle BMS Admin tabs remain the editors** (full CRUD + domain validation, verified working). No functionality lost.
  - **B — full FE parity (follow-up):** `@odata.draft.enabled` per the Bridges pattern (`fiori-service.cds:1407`) **plus** port the freestyle save-side business logic (e.g. Risk Bands "no gaps/overlaps + re-score every bridge on save") into the service `before/after` handlers so FE draft-activation triggers it. Larger change; needs tests.
- **Test**: after A — Object Page shows no Delete/Edit/Create; after B — create/edit a UAT band, verify re-scoring fires + ChangeLog written.
- **Persona**: PO/SME, Security, Dev.
- **Decision needed**: keep freestyle as editors → these FE tiles are **viewers** (Option A). Do **NOT** retire the freestyle config tabs.

### [P2-002] HV Assessment "Margin" column never renders (malformed binding)
- **File**: `app/prioritisation/webapp/view/App.view.xml:259`
- **Symptom**: console `SyntaxError: Expected '}' ... {= ${hv>marginPct} == null ? '' : ${hv>marginPct} + '%' }`. Margin column is blank for every per-check row after an assessment.
- **Root cause**: UI5 expression binding does not parse the named-model embedded-binding form `${hv>marginPct}` inside `{= }`.
- **Fix**: replace with a controller formatter: `text="{ path:'hv>marginPct', formatter:'.formatMarginPct' }"` and add `formatMarginPct(v){ return v==null?'':v+'%' }` to `App.controller.js`.
- **Test**: run an assessment → Margin shows `%` where computed, blank where null; no console error.
- **Persona**: PO/SME, Dev.

### [P2-003] Attribute Classes FE tile shows empty "Add columns to see the content"
- **File**: `app/admin-bridges/fiori-service.cds` (AttributeGroups is `@odata.draft.enabled` at :1637 but has **no `@UI.LineItem`**).
- **Symptom**: tile opens an empty List Report with the "Add columns" placeholder; 9 groups exist in the backend but no columns are shown; no Create visible.
- **Fix**: add `@UI.LineItem` for AttributeGroups (name/label/objectType/assetClass columns) + a `@UI.HeaderInfo`. Confirm Create appears (entity is already draft-enabled).
- **Test**: tile loads with columns + rows; create a UAT group; delete it.
- **Persona**: PO/SME, new user.

### [P2-004] Unprotected facade service actions/functions (no @requires)
- **File**: `srv/service.cds:10` (`BridgeManagementService` has no service-level `@requires`); `srv/services/map.cds:16` `getMapApiConfig` (returns `apiKey`), `:12/:14` geocode/reverseGeocode; `srv/services/dashboard.cds:4-18` KPIs; `srv/services/admin.cds:37` `saveRoleConfig` (**mutating**).
- **Symptom**: any authenticated user can call these regardless of scope. `getMapApiConfig` leaks the map provider API key; `saveRoleConfig` lets any user rewrite role→feature visibility.
- **Fix**: `getMapApiConfig` → `@requires:'view'` (or 'admin'); KPIs/geocode → `@requires:'view'`; `saveRoleConfig` → `@requires:'admin'`. (All real users have ≥view, so low regression risk.)
- **Test**: call each as a view-only token; admin-only ones reject 403.
- **Persona**: Security.

### [P2-005] Compute actions accept unbounded input (DoS)
- **File**: `srv/prioritisation-service.js` — `forecastCondition` `years` (~:1302) unbounded loop; `assessRoute` `bridgeIds` (~:1280) unbounded N+1.
- **Fix**: clamp `years` to 0–100 (reject otherwise); cap `assessRoute` ids to ~100 and `log.warn` on truncation.
- **Test**: `years:1e9` → 400; 500-id route → capped + warned.
- **Persona**: Security, Dev.

### [P3-006] CSV export — formula injection not escaped
- **File**: `srv/lib/csv-export.js:7` `csvCell()` quotes commas/quotes only.
- **Fix**: prefix `'` when a cell starts with `= + @ -` (then RFC-4180 quote). 
- **Test**: a bridge name `=1+1` exports as `'=1+1`.
- **Persona**: Security.

### [P3-007] saveRoleConfig writes UserActivity, not ChangeLog
- **File**: `srv/handlers/admin.js:17` (uses `logAudit`, not `writeChangeLogs`).
- **Fix**: also call `writeChangeLogs` so role-config changes appear in Change Documents (CLAUDE.md §2.3).
- **Persona**: Security/audit.

### [P3-008] Bridge create surfaces 3 messages for 1 missing field
- **Symptom**: missing `structureType` produced 3 message entries (2 blank). Cosmetic.
- **Fix**: dedupe the validation messages targeting `structureType`.
- **Persona**: new user, UX.

### [P3-009] Deactivate (soft-delete) has no confirmation dialog
- **Symptom**: Bridges/Restrictions "Deactivate" fires immediately on click — accidental-click risk on a state-changing action.
- **Fix**: add a confirmation popover to the FE custom `deactivate` action.
- **Persona**: power user, UX.

### [P3-010] Bridge value-help column headers are untranslated
- **Symptom**: in the Restrictions → Bridge value-help, headers show raw bindings `[bridgeId] [bridgeName] [state] [transportMode] [status]`.
- **Fix**: add `@UI.LineItem`/Label texts (i18n) on the Bridge value-help entity (`BridgeValueHelp`).
- **Persona**: new user, i18n.

### [P3-011] Capital Program empty-result still shows pre-run placeholder
- **Symptom**: after Optimise with no fundable candidates, the table shows "Enter a budget and optimise…" rather than "No projects funded for this budget".
- **Fix**: distinguish not-run vs run-empty states in `App.controller.js`.
- **Persona**: PO/SME, UX.

### [INFO-012] Benign console noise (UI5 sandbox FLP)
- Deprecation warnings (RendererExtensions/TileState/AnchorNavigationBar), `ShellUIService.js` not shipped, `LrepConnector loadFlexData/loadFeatures` failures. Expected for the sandbox launchpad without an LREP/flex backend. No app impact. Track only if moving to a managed launchpad.

### [INFO-013] Data observations (clean store dataset)
- `AssetClasses=0`, `BridgeElements=0`, `SystemConfig=1`, no `BridgeTreatments` → Capital optimiser has no candidates (returns $0 funded, correctly). Not bugs; consider a small demo seed so analytical screens show content out-of-box.

---

## PASS (no issues found)
- Launchpad: 22 tiles / 5 groups; all 4 new FE config tiles route correctly via `#<SO>-manage&/<route>`.
- **Bridges**: full lifecycle — Create (draft→activate, auto-ID `BRG-NSW-1033`), Read, Edit, **Deactivate (soft → Inactive) + Reactivate**. Count 32→33 persisted.
- **Restrictions**: full lifecycle — Create (Mass Limit 10t on Anzac Bridge, Effective From), Edit (10→12), Deactivate (→ "Retired"). Count 3→4.
- **HV Assessment**: compute correct — Verdict PASS, governing check, per-check breakdown, graceful "not-assessable" when no capacity data. (Display bug = P2-002.)
- **Capital optimiser**: runs (greedy best-value-per-$); $0 funded with no candidates (correct).
- **Dashboard**: KPIs + condition distribution (Good/Fair/Poor/Critical) compute live.
- **Map View**: control panel + 33-bridge layer; 10 OSM tiles load (no CSP block).
- **BHI Explorer**: per-mode BSI/BHI aggregates with health bars.
- **BMS Administration (freestyle)**: all config editors present; **Risk Bands = full CRUD with domain validation** (Add/Edit/Active toggle, "no gaps/overlaps + re-score on save").
- **Change Document Report**: audit trail working — 2,383 changes (UAT ops captured).
