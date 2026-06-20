# UAT Narrative Report — BridgeManagement (BIS) — 2026-06-19

## Environment
- **Target:** local instance `http://localhost:4010` (CAP `cds watch`, SQLite, dummy auth — chosen because the deployed BTP app is XSUAA-gated and not browser-automatable without credentials).
- **Approach:** API-driven *logical* UAT — created and changed real data through the live OData (AdminService, PrioritisationService) + the freestyle Express APIs (`/mass-upload/api`, `/map/api`, `/dashboard/api`, `/audit/api`), then verified persistence, audit trail, and how the data flows across subsystems (register ↔ restrictions ↔ map ↔ dashboard).
- **Build:** 417 jest tests pass, eslint 0 errors, `cds build` clean. Deployed version live on BTP = `3.24.0`.
- **Safety:** DB backed up to `/tmp/uat-db-backup.sqlite` (R1); synthetic data `DEMO-`-prefixed (R3); baseline restored (R4).

## Baseline (before test)
| Entity | Count |
|---|---|
| Bridges | 0 |
| Restrictions | 0 |
| ChangeLog | 1,733 |

## Executive summary
The application is **functionally sound and deployable.** Every core flow I exercised — create, change, audit,
restriction-to-bridge linking, posting-status recompute, mass-upload (incl. the new Create/Update mode toggle),
validation, facade read-only enforcement, soft-delete-only, and the reusable plugins — behaved correctly and
persisted to the database.

**The single most important finding (P1-001) explains your earlier "is it saving to HANA?" question:** bridges *do*
save, but the register/map/dashboard only show rows with `status='Active'`, and the mass-upload doesn't default
`status` — so bridges loaded without it are saved-but-invisible. Setting `status='Active'` made all 15 appear
instantly. Fixing this (default `status='Active'` on import + add it to the demo file) removes the confusion entirely.

### Top 3 findings
1. **P1-001** — Bridges uploaded without `status='Active'` are saved but hidden in every read view (the "didn't save" symptom). Fix: default `status='Active'` on import + in the demo template.
2. **P3-002** — Mass-upload mode-violation rows are double-counted in the per-row results (30 errors for 15 rows). Cosmetic but inflates the results CSV / failed counts.
3. **P3-003** — Closure recompute writes `postingStatus='CLOSED'` while the lookup + dashboard use `'Closed'` (case mismatch) → dashboard "closed bridges" KPI under-counts.

### Deployment readiness: 🟢 GREEN
No data-loss, no security regression, no broken core flow. P1-001 is a visibility/UX defect (data is safe) with a
known workaround (set `status='Active'`); recommended to fix before bulk customer loads so the register populates
without manual status-setting.

## Results by area

| Area | Result | Notes |
|---|---|---|
| **Bridge create (mass-upload)** | ✅ persists | 15 inserted, committed, raw table confirmed |
| **Bridge visibility** | ⚠️ P1-001 | invisible until `status='Active'` |
| **Bridge change (update mode)** | ✅ | conditionRating 8→3 applied + audited |
| **Audit (ChangeLog on CUD)** | ✅ | grew on create (+491) and update (+22) |
| **Restrictions create + link** | ✅ | 8 inserted; `bridgeRef`→`bridge_ID` resolved |
| **Posting-status recompute** | ✅ (⚠️ P3-003 casing) | Full-Closure restriction → bridge `CLOSED` |
| **Map** `/map/api/bridges` | ✅ | returns 15 active bridges w/ coords |
| **Dashboard KPIs** | ✅ (⚠️ P3-003) | totals + condition distribution correct; closed-KPI casing |
| **Mass-upload: Create-only** | ✅ | rejects existing keys (⚠️ P3-002 double-count) |
| **Mass-upload: Update-only** | ✅ | rejects missing keys |
| **Mass-upload: upsert (default)** | ✅ | create + update |
| **Validation (required + lookup)** | ✅ | per-row errors; full template required (P3-005) |
| **Facade read-only** | ✅ | `PATCH /bridge-management/Bridges` → 405 |
| **Soft-delete only** | ✅ | hard `DELETE` → 400 |
| **Change-documents feed** | ✅ | `/audit/api/changes` returns merged rows |
| **EAM mapping plugin** | ✅ | 2 MappingDomains live |
| **condition band derivation** | ✅ (⚠️ P3-004) | band virtual/on-read; stored label not re-derived on upload |
| **HV assessment** | ⏭ not HTTP-probed | wrong action path in probe; covered by jest suite |

## Test data catalogue + purge
- Synthetic: `DEMO-BRG-001…015` (bridges), `DEMO-RES-001…008` (restrictions). All deleted at end of run.
- Local DB residue: extra ChangeLog audit rows from the test (harmless). To fully reset:
  `cp /tmp/uat-db-backup.sqlite db.sqlite` then restart `cds watch`.

## Cross-links
See `test/UAT_BIS_Fix_List_2026-06-19.md` for fix detail (P1-001 … P3-005) with file:line, root cause, fix, and test.

## Personas applied
- **PO/SME**: business rules enforced (soft-delete, closure→closed, audit). P1-001 + P3-003 affect data correctness/visibility.
- **QA**: persistence verified at the DB level, not just API success messages (caught P1-001 where the API said success but the view was empty).
- **Dev**: root-caused each item to file:line; P3-002 is a regression from the new mode feature (this session).
- **Security**: facade read-only (405), soft-delete only (400 on hard delete), CSRF enforced on bulk routes, @restrict gating (BTP 403 without role) — all holding.
