# Facade Consolidation — Verification Spike (decision artifact)
**Date:** 2026-06-19 · **Status:** investigation complete → **Option C (read-only variant) EXECUTED 2026-06-19** (product-owner go-decision: "go with recommended approach"). Option B still pending.

## ✅ EXECUTED 2026-06-19 — Option C, read-only variant (mta 3.23.2)
Per the recommended safe-first-move, all BMS business-entity projections were made `@readonly`:
`Bridges` + `BridgeAttributes` (`services/bridges.cds`), `Restrictions` (`services/restrictions.cds`),
`BridgeGrid` (`services/mass-edit.cds`), and the config projections `Lookups` / `AttributeDefinitions` /
`AttributeAllowedValues` / `RoleConfigs` (`services/admin.cds`). **AdminService is now the single OData
WRITER** of these entities — the dual-facade write overlap (the cert blocker) is removed.
- **Why it's safe (pre-verified):** every BMS handler writes the *raw* `bridge.management.*` / `nhvr.*`
  entities via `db.run`/`tx.run` — **none** write through the service projections — so `@readonly` cannot
  touch any write path. The bound actions (`changeCondition`, `disableRestriction`, …) + `massEditBridges`
  + `massUploadRestrictions` are unaffected.
- **Verified:** `cds build` clean; **all 416 tests green** (incl. the 4 BMS action suites that drive the
  write-paths); deployed + smoke (srv clean boot, front door 302, endpoints gated). Fully reversible
  (remove the `@readonly` lines).
- **Remaining (future increment):** full removal of the dormant projections + their orphaned entity-CRUD
  handlers (Option C "remove" variant), and **Option B** (extract a shared `editBridgeRow` core for
  `massEditBridges` + `server.js saveMassEditBridges`). Both still test-gated + deploy-verified.

---
### Original spike (investigation, pre-execution)

## Question
Is the `BridgeManagementService` (`/bridge-management`) ↔ `AdminService` (`/odata/v4/admin`) overlap an **active** dual-write hazard (high-risk to consolidate) or **dormant** (low-risk)? And where is bulk-edit/upload logic actually duplicated?

## Findings (evidence-backed)
1. **No UI consumes the BMS facade.** Zero references to `/bridge-management` in `app/` or `test/`. Deployed apps' OData dataSources are only: `/odata/v4/admin` (×3), `/odata/v4/prioritisation` (×3), `/odata/v4/prioritisation-analytics` (×1). → The BMS facade's `Bridges`/`Restrictions`/lookup **entity projections are dormant** (redundant with AdminService, not consumed). The "two live write paths to Bridges" risk is **latent, not active**.
   - Caveat: CAP entity-scoped handlers (on `'Bridges'`, `'Restrictions'`) fire regardless of which service projects, so a hypothetical write via `/bridge-management` *would* run the same guards — the risk is theoretical while no client uses it.
2. **Bulk edit/upload logic is genuinely duplicated across two live entry points:**
   - **Express** `/mass-edit/api` → `saveMassEditBridges` / `saveMassEditRestrictions` (`srv/server.js:483, 851`). **This is what the mass-edit UI calls** (`app/mass-edit/webapp/controller/MassEdit.controller.js` fetches `/mass-edit/...`). Same for the mass-upload UI → `/mass-upload/api`.
   - **OData actions** `massEditBridges` (`srv/handlers/mass-edit.js:11`, def `srv/services/mass-edit.cds:17`) and `massUploadBridges` (`srv/handlers/upload.js:75`, def `srv/services/upload.cds:5`). **Exercised only by tests** (`test/bulk-operations.test.js`).
   - ⇒ Two implementations of bulk-edit/upload; the UI uses the Express one, the tests cover the OData one. (Open item for the consolidation: confirm whether they share underlying logic or fully duplicate — if separate, that's the real duplication to unify.)

## Consolidation options
- **Option A — canonicalise on AdminService + OData actions (cert/clean-core target).** Retire/read-only the redundant BMS entity projections; migrate the bulk UI from the Express routes to the OData actions; retire the Express bulk implementations. *Pros:* one OData facade, cert-aligned, tests already cover the OData actions. *Cons:* UI rewrite of mass-edit/mass-upload (fetch → OData action invocation), highest effort/risk.
- **Option B — canonicalise on the Express bulk impl (least UI churn).** Keep `/mass-edit/api`+`/mass-upload/api` (UI unchanged); make the OData actions thin delegates to the same `saveMassEdit*` functions (or retire the OData actions + move their test coverage onto the Express path); retire the dormant BMS entity projections. *Pros:* no UI change, removes the duplicate logic, lowest risk. *Cons:* keeps non-OData bulk endpoints (a cert deviation, but freestyle bulk is already a documented deviation).
- **Option C — leave bulk as-is, only retire the dormant BMS entity projections.** Smallest change: make `BridgeManagementService` Bridges/Restrictions/lookup projections read-only or remove them (no consumer), keeping its actions/functions. *Pros:* removes the dual-facade entity overlap (the cert blocker) with near-zero risk. *Cons:* leaves the bulk-logic duplication.

## Recommendation
**Phase the consolidation, lowest-risk first:** do **Option C now** (retire the dormant BMS entity projections — kills the cert "dual facade" blocker with negligible risk since nothing consumes them), then evaluate **Option B** (unify the two bulk implementations behind one function, UI unchanged). Defer Option A (full OData-action UI migration) unless cert review specifically requires OData-only bulk — and note SAP Build Work Zone + clean-core may reframe it anyway.

## Decision needed (gated)
Product-owner go/no-go + which option. Verification + full regression (`npm test` + bulk-op tests + live UAT of every write path + audit-trail parity) required before any change. **No code touched in this spike.**

---

## Refined findings (implementation inspection, 2026-06-19) — scope is bigger than the initial framing
Product owner chose **Option C then B**. A deeper read before executing revised the risk/effort upward — these are real backend refactors, not "delete dormant config":
1. **The BMS facade is a complete parallel service, not just projections.** `srv/service.js` registers a full handler stack (`srv/handlers/{common,dashboard,bridges,restrictions,upload,admin,mass-edit}.js`) on the BMS-projected entities. Removing a projection breaks its handler registration, so Option C must also retire/rewire those handlers (which duplicate logic already in `admin-service.js`).
2. **CONFIRMED: the BMS facade is NOT publicly reachable.** `app/router/xs-app.json` has these routes only: `/fiori-apps.html`, `/appconfig/*`, `/launchpad/debug`, `/odata/(.*)`, `/(map|dashboard|health|mass-upload|mass-edit|admin-bridges|bnac|quality|system|access|attributes|audit)(.*)`, and a catch-all `/(.*)` → html5 repo. **There is no `/bridge-management` route** (grep count = 0), and BMS is published at `@path:'/bridge-management'` (not under `/odata`), so an external call hits the html5 catch-all → 404. BMS is reached only by tests via `cds.connect.to('BridgeManagementService')`. **Implication: the "dual facade" cert blocker is largely already moot — the public OData surface is effectively single-facade (AdminService).** The consolidation is therefore code-hygiene (remove the internal/test-only parallel stack), not a live cert fix — lower urgency. Tests (`bulk-operations.test.js`, `handlers.test.js`) depend on BMS and must be migrated as part of retiring it.
3. **The two bulk impls are asymmetric (Option B):** OData `massEditBridges` (`handlers/mass-edit.js`) is a focused ~40-line bridges-only action; Express `saveMassEditBridges` (`server.js:483`) is a ~370-line **multi-entity** editor (bridges + restrictions + inspections + defects + capacities). Unifying means extracting a shared bridges-row core + reconciling field/audit differences without regressing the live UI path (thin test coverage on the Express side).

## Safe staged execution plan (recommended as a dedicated, deploy-verified effort)
1. **Confirm reachability:** prove `/bridge-management` is not externally routed (xs-app.json + a live 404 probe). If confirmed test-only, the cert "dual facade" concern is largely moot already.
2. **Option C (staged):** migrate `bulk-operations.test.js` + `handlers.test.js` off `BridgeManagementService` onto `AdminService` (or the Express bulk path) → then retire the BMS entity projections + their now-orphaned handlers → keep only what the actions need → `npm test` green + `cds build` + **deploy + live UAT of every write path** at each step.
3. **Option B:** extract a shared `editBridgeRow` core used by both `massEditBridges` and `saveMassEditBridges`; reconcile editable-field lists + audit format; add a test for the Express bridges-edit path before refactoring it.

## Status / honest call
**Not executed in this session.** This is a multi-day, deploy-verified backend refactor; the deploy pipeline has been intermittently fragile this session and the service layer is high-blast-radius, so rushing it would risk the backend with no safe rollback path. Recommend scheduling it as a focused unit of work with the staged plan above. The two phases above are independently shippable and test-gated.

## Consumption audit (2026-06-19, follow-up) — DE-RISKS the staged plan
Ran a full consumer audit before any change. Findings materially reduce uncertainty:
1. **No UI consumes `BridgeManagementService` (`/bridge-management`) at all.** Every app's
   manifest dataSource binds to `/odata/v4/admin` (Fiori Elements ×3), `/odata/v4/prioritisation`,
   or an Express route (`/mass-upload/api`, `/dashboard/api`, `/admin-bridges/api`, `/attributes/api`,
   `/audit/api`, `/bnac/api`, `/system/api`). `grep -r "bridge-management" app/*/webapp` → **0 hits.**
   The live write paths run through the Express routes (`server.js`) + `AdminService` — **not** the BMS facade.
2. **The only consumers are 4 test suites** (`bulk-operations`, `handlers`, `restrictions-fix`,
   `unified-restrictions`), and they invoke **actions/functions only** (`massEditBridges`,
   `massUploadRestrictions`, `getNetworkKPIs`, `getRestrictionSummary`) via `srv.send('action', …)` —
   **never direct entity CRUD** on the BMS projections.
3. **Implication:** the BMS *entity projections* are effectively dormant (no UI, no direct-CRUD test).
   Option C's residual risk is concentrated in (a) the bound-action ↔ entity coupling (actions are
   bound to `Bridges`/`Restrictions`, so the entities can't simply be deleted without unbinding), and
   (b) whether a write-restriction (`@readonly`/`@Capabilities`) on those entities would block the
   **action handlers' own** writes — a known hazard here (see `memory/cap-capabilities-server-enforced.md`:
   FE `@Capabilities.*Restrictions` block ALL OData writes and previously broke the freestyle config
   editors). That hazard is exactly why this slice must be validated with the full suite **and** a
   deploy + write-path smoke, not annotated blind.

**Revised recommendation:** the staged plan stands, but step 1 is now cheap — there are no UI write
paths to UAT, only the 4 action-based test suites to keep green. Safe first move when scheduled:
either (i) make the BMS business-entity projections `@readonly` and confirm all 416 tests stay green
(proves the action handlers still write), then deploy + smoke; or (ii) repoint the 4 test suites onto
`AdminService`/Express equivalents, then delete the BMS service barrel + `srv/services/*.cds` +
`srv/service.js` + the orphaned `srv/handlers/*.js`. Both are test-gated and reversible at the commit
level. **Deferred from this batch by judgment** — the directive was "don't break anything," and a
no-rollback service-layer change does not belong in the tail of a multi-change session.
