# UAT Fix List — BIS / BMS v3.01 — 2026-06-06

> Machine-actionable findings from the v3.01 acceptance pass.
> **Method**: deployed BTP smoke (health/correlation/asset checks) + full OData V4
> CRUD against the **identical v3.01 code run locally** (Node 20, dummy auth).
> Live deployed CRUD could not be driven because XSUAA SSO requires an interactive
> password login (which the agent must not perform) and a CF/terminal token does
> not carry the app's user scopes (confirmed `HTTP 403`).

Priority legend: **P1** blocks core flow / security / data loss · **P2** degrades UX or robustness, has workaround · **P3** polish.

---

### [P1-000] Deployed launchpad surfaces NO BMS apps — ✅ FIXED & VERIFIED LIVE (v3.0.3)
**Status update**: Fixed by inlining the sandbox config in `app/router/fiori-apps.html` (commit af4c948, MTA 3.0.3). Verified live: launchpad now shows all 10 BMS tiles in 3 groups; Dashboard, Bridges create/edit, and soft-delete all work through the UI. Original finding retained below for the record.

---

### [P2-004] Sub-entity tiles (Defects / Inspections / Bridge Capacity) open the Bridges list in the sandbox shell
- **File**: `app/router/fiori-apps.html` (FLP **sandbox** shell); `app/admin-bridges/webapp/manifest.json` (routes/inbounds ARE correctly defined)
- **Symptom**: Clicking the Defects (or Inspections / Bridge Capacity) tile sets the title to "Defects" but shows the **Bridges** list-report; top-level Create makes a Bridge, and drilling into a bridge shows no Defects section.
- **Root cause**: All three intents resolve to the same component (`BridgeManagement.adminbridges`) with no differentiating parameter. The FLP **sandbox** (`sandbox.js`) does not forward the intent action to the Fiori Elements router, so FE starts on its root route (Bridges) instead of the entity route. The manifest **does** define `BridgeDefects-manage` inbound + `BridgeDefectsList` route — so a **managed SAP launchpad** would route correctly; this is a sandbox-shell limitation.
- **NOT introduced by the P1-000 fix**: the pre-fix config (`HEAD~2`) had byte-identical inbound mappings.
- **Verified**: backend entities work (local OData CRUD passes; `BridgeDefects`/`BridgeInspections` have own keys/refs). Only the sandbox tile deep-link is affected.
- **Fix options**: (a) deploy on a managed SAP Build Work Zone / FLP instead of the sandbox shell; or (b) give each sub-entity its own FE app (separate component) or pass a manifest startup parameter that FE maps to the entity route; or (c) add an explicit `defaultedParameterNames`/route hint in the inbound so the sandbox lands on the right page.
- **Test**: launching `#BridgeDefects-manage` shows the BridgeDefects list with its own Create.
- **Persona**: PO/SME, Dev.

---

### [P1-000-original] Deployed launchpad surfaced NO BMS apps — config XHR returned Login HTML
- **File**: `app/router/xs-app.json` route 1 (`^/appconfig/fioriSandboxConfig\.json$` → rewrite `/launchpad/config` → `srv-api`); `app/fiori-apps.html:11-14` (synchronous XHR + `JSON.parse`)
- **Symptom**: On the live deployment the launchpad "My Home" shows the **stock SAP Fiori sandbox sample apps** (Default Application, AppNavSample, …) and opening any BMS intent errors: *"The navigation target '#Dashboard-display' could not be resolved."* Runtime `ushell` `getLinks()` returns **25 intents, all samples, 0 BMS**.
- **Root cause**: `fiori-apps.html` issues a **synchronous XHR** to `/appconfig/fioriSandboxConfig.json`; the approuter rewrites it to the protected backend route `/launchpad/config`. That request returns the **XSUAA Login page** (`content-type: text/html`, `<title>Login</title>`, HTTP 200) instead of JSON. `JSON.parse(html)` throws, the bootstrap script aborts before `window['sap-ushell-config']` is set, and `sandbox.js` falls back to its built-in sample catalog.
- **Verified**: (a) error dialog in UI; (b) `getLinks()` → 0 BMS intents; (c) `fetch('/appconfig/fioriSandboxConfig.json')` and `/launchpad/config` both `content-type text/html`; (d) terminal `curl` of the path → `<title>Login</title>`.
- **NOT caused by v3.01**: `xs-app.json`, `fiori-apps.html`, `launchpad.js` were not modified in this release. Pre-existing or environment/auth-timing.
- **Fix (recommended)**: Serve the sandbox config as a **static, already-authenticated** resource instead of a backend round-trip. The file exists at `app/router/appconfig/fioriSandboxConfig.json`. Change route 1 to `{"source":"^/appconfig/fioriSandboxConfig\\.json$","localDir":".","authenticationType":"xsuaa"}` (drop the `target`/`destination` rewrite) so the static JSON is delivered within the authenticated shell. Trade-off: loses dynamic `isAdmin` tile gating from `buildSandboxConfig()`; if that gating is required, instead make `fiori-apps.html` fetch **asynchronously** with credentials and follow the auth redirect, or expose `/launchpad/config` as a non-redirecting JSON endpoint. Rebuild MTA + redeploy + re-verify `getLinks()` shows the BMS intents.
- **Test**: After redeploy, `fetch('/appconfig/fioriSandboxConfig.json')` returns `application/json`; ushell `getLinks()` includes `#Bridges-manage`, `#Dashboard-display`, etc.; My Home shows BMS tiles.
- **Persona**: PO/SME (app unusable via launchpad), Dev, DevOps.

---

### [P2-001] `GET /<Entity>/$count` (path-segment count) crashes the server process
- **File**: `node_modules/@sap/cds/libx/odata/middleware/read.js:129` (`_getCountFromResult`); surfaced via `srv/admin-service.cds` entities
- **Symptom**: A request to `…/odata/v4/admin/States/$count` throws an uncaught `TypeError: Cannot read properties of undefined (reading '$count')` and the Node process **shuts down** (`server shutdown …`). Reproduced twice locally on `@sap/cds` v9.9.1.
- **Expected**: Return the integer count (or a 4xx), never crash the process.
- **Root cause**: CAP v9.9.1 read middleware dereferences an undefined result for the path-segment `$count` form on certain (lookup) entities. Note: the inline form `?$top=0&$count=true` works fine, and `Bridges/$count` returned `0` in one early call — so it is entity/timing dependent.
- **Fix**: (a) Pin/upgrade `@sap/cds` to a patch where this is resolved, or (b) add a global `srv` error guard so an uncaught handler error returns 500 instead of exiting, and (c) prefer inline `$count=true` in any custom callers. Verify against the deployed instance.
- **Test**: `curl …/States/$count` returns 200 with a number and the server stays up.
- **Persona**: Security auditor (availability / DoS), Dev.
- **Related**: BTP would auto-restart the crashed instance (brief downtime); a single crafted request can bounce an instance.

---

### [P3-002] No seed/sample data for local dev → empty dropdowns on a fresh checkout
- **File**: `db/` (no `db/data/*.csv` for lookups); `db/schema.cds` lookup entities
- **Symptom**: A freshly-deployed local SQLite DB has **0 rows** in every lookup (States, Regions, AssetClasses, StructureTypes, RestrictionTypes, VehicleClasses, …), so value-help dropdowns are empty in local dev.
- **Expected**: Local dev should have minimal seed data so dropdowns and demo flows work out-of-the-box. (Production/BTP has data; this is a dev-experience gap.)
- **Root cause**: Lookups are seeded operationally (mass-upload / admin), not via committed CSV fixtures.
- **Fix**: Add `db/data/bridge.management-<Lookup>.csv` seed files (or a `cds.requires` init script) with a few canonical rows, gated to dev. Keep additive.
- **Test**: After `cds deploy --to sqlite`, lookup counts > 0.
- **Persona**: New user, Dev.

---

### [P3-003] Mixed draft model across sibling entities
- **File**: `app/admin-bridges/fiori-service.cds:1192-1198`
- **Symptom**: `Bridges`, `BridgeCapacities`, `BridgeInspections`, `BridgeDefects` are `@odata.draft.enabled`; `Restrictions` and `BridgeRestrictions` are **not** (they create directly as active). This is a correctness-neutral inconsistency but affects API ergonomics and test tooling (different create path per entity).
- **Expected**: Consistent create semantics, or documented rationale.
- **Fix**: Document the rationale in `CLAUDE.md` (likely intentional: restrictions are simpler/child records), or align if drafts are desired everywhere.
- **Test**: n/a (documentation).
- **Persona**: Dev, Power user.

---

## Verified-GOOD (no action — recorded as evidence)

| Ref | Check | Result |
|-----|-------|--------|
| TC-FUNC-001 (UI) | `FkMessageGuard.js` served by **deployed** app | `HTTP 200` ✅ |
| TC-FUNC-001 (backend) | Inspection create with integer `bridge_ID` FK → activate | PASS (ref `INS-0001`) ✅ |
| TC-FUNC-001 (backend) | Defect create with `bridge_ID` + UUID `inspection_ID` FK; severity/urgency integers persist | PASS (sev 3→4 edit OK) ✅ |
| C-4 | Soft-delete: `deactivate` sets status=Inactive, record **hidden from default list** but still retrievable by key; `reactivate` restores (count 1→0→1) | PASS ✅ |
| C-4 | No hard-DELETE: removal path is the `deactivate` action only | PASS ✅ |
| C-10 | Correlation ID on deployed `/health` (`x-correlation-id` mirrors inbound `x-vcap-request-id`) | PASS ✅ |
| KPI | `/dashboard/api/overview` returns all KPIs (totalBridges, activeRestrictions, closedBridges, deficient, sufficiencyPct, conditionDistribution) | `HTTP 200` ✅ |
| Map | `/map/api/bridges` | `HTTP 200` ✅ |
| Validation | Mandatory-field enforcement on activate (latitude/longitude/assetOwner/structureType/postingStatus) | PASS ✅ |
| Data | `bridgeId` auto-generated `BRG-{state}-{ID}` (user input intentionally overridden) | By design ✅ |
| CRUD | Bridges / Inspections / Defects / Capacities / BridgeRestrictions create + edit + read | PASS ✅ |
