# UAT Fix List — BIS / BMS v3.01 — 2026-06-06

> Machine-actionable findings from the v3.01 acceptance pass.
> **Method**: deployed BTP smoke (health/correlation/asset checks) + full OData V4
> CRUD against the **identical v3.01 code run locally** (Node 20, dummy auth).
> Live deployed CRUD could not be driven because XSUAA SSO requires an interactive
> password login (which the agent must not perform) and a CF/terminal token does
> not carry the app's user scopes (confirmed `HTTP 403`).

Priority legend: **P1** blocks core flow / security / data loss · **P2** degrades UX or robustness, has workaround · **P3** polish.

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
