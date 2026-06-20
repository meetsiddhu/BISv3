# UAT Fix List — BridgeManagement (BIS) — 2026-06-19

**Method:** API-driven end-to-end UAT (expert council: PO/QA/Dev/Security) against the local instance
(`http://localhost:4010`, dummy auth) — created + changed real data via the live OData + Express APIs and
verified persistence, audit, and cross-subsystem flow. DB backed up (R1), synthetic data `DEMO-`-prefixed,
baseline restored (R4: Bridges 0→0, Restrictions 0→0). 417 jest tests pass; eslint 0 errors.

**Verdict:** **Deployable.** Core CRUD, audit, linking, recompute, mass-upload, mode toggle, facade read-only,
and the plugins all work. One finding (P1) explains the "is it saving to HANA?" confusion and should be fixed;
the rest are P3 polish.

Priority: **P1** blocks core flow / data appears lost · **P2** degrades UX, has workaround · **P3** polish.

---

### [P1-001] Bridges loaded without `status` are invisible in register/map/dashboard (looks like data loss)
- **File**: `srv/mass-upload.js` (`importBridgeRows`, ~line 1068) · `srv/admin-service.cds:15,33` (Bridges projection injects `status='Active'`)
- **Symptom**: Upload reported `inserted:15`, raw `bridge_management_Bridges` had 15 rows, but `Bridges/$count` (AdminService) = **0**, map = empty, register = empty. After `UPDATE … SET status='Active'` the count became 15 and dashboard/map populated.
- **Root cause**: AdminService.Bridges injects a `status='Active'` filter on collection reads (the register default), but the mass-upload importer does **not** default `status` — rows load with `status=NULL` and are filtered out everywhere. The demo file also doesn't set `status`.
- **Impact**: This is exactly the user-reported "I uploaded but it didn't save" — it saved, but every read view hides `status≠'Active'` rows.
- **Fix** (two parts):
  1. **App** — in `importBridgeRows`, default `status='Active'` when the row leaves it blank (mirrors the create-path default). Small, additive, behaviour-preserving for rows that already set a status.
  2. **Demo/template data** — add a `status` column = `Active` to `demo-data/Bridges.csv` + `BridgeManagement-DemoData.xlsx` (regenerate via `scripts/generate-demo-data.js`).
- **Test**: upload bridges with blank `status` → `Bridges/$count` increases by N (currently stays 0).
- **Persona**: PO/SME, New user, Dev.

### [P3-002] Mass-upload mode violations double-counted in the per-row results ledger
- **File**: `srv/mass-upload.js` — `modeSkip` (~line 860) + the warning-fold in `importUpload` (~line 475 `ROW_WARN_RE` loop)
- **Symptom**: Create-only upload of 15 existing bridges returned **30** `rowResults` Error entries (2 per row).
- **Root cause**: `modeSkip` records the violation **twice** — once via `recordRow(...)` (per-row ledger) and once via `warnings.push(...)`; then `importUpload` folds every warning into `rowResults` → duplicate Error row per blocked record. Also inflates `failed` counts + the results CSV.
- **Fix**: have `modeSkip` record via `recordRow` only (drop the `warnings.push`), **or** dedupe the warning-fold against rows already in `rowResults` by `(rowNum, dataset)`.
- **Test**: create-only on N existing rows → exactly N Error rows in `rowResults` (not 2N).
- **Persona**: Power user (results CSV), Dev.

### [P3-003] `postingStatus` recompute writes `'CLOSED'` but the lookup/dashboard use `'Closed'`
- **File**: `srv/lib/restriction-codelists.js` (`refreshBridgePostingStatus` / closure derivation) vs `PostingStatuses` lookup (`Closed`) + dashboard `closedBridges` KPI (`srv/server.js` dashboard handler)
- **Symptom**: A bridge with a Full-Closure restriction got `postingStatus='CLOSED'` (uppercase), but the dashboard `closedBridges` KPI showed **0**, and `'CLOSED'` isn't a `PostingStatuses` code (`'Closed'` is).
- **Root cause**: case mismatch between the recompute value and the canonical lookup code.
- **Fix**: align the recompute to write the canonical `'Closed'` (or make the dashboard KPI + lookup match case-insensitively). Prefer writing the lookup's exact code.
- **Test**: load a closure restriction → bridge `postingStatus` = `'Closed'` (a valid lookup code) **and** dashboard `closedBridges` ≥ 1.
- **Persona**: PO/SME (KPI correctness), Dev.

### [P3-004] Mass-upload stores `condition` label as-given (no re-derive from `conditionRating`)
- **File**: `srv/mass-upload.js` (`importBridgeRows`) vs `srv/handlers/mass-edit.js` (which calls `deriveCondition`)
- **Symptom**: Updating `conditionRating` 8→3 via mass-upload left `condition='Good'` (the value in the file), even though rating 3 maps to a poor band. Mass-**edit** re-derives; mass-**upload** does not.
- **Root cause**: the upload writes the file's `condition` verbatim; only the *virtual* `conditionRatingBand` (computed on read) reflects the rating. So the stored label can be inconsistent with the rating if the file is.
- **Fix** (optional): when `conditionRating` is provided but `condition` is blank, derive `condition` via `srv/lib/condition-rating.js` (single source). Otherwise document that the file's `condition` + `conditionRating` must be consistent.
- **Test**: upload `conditionRating=3`, blank `condition` → stored `condition` = derived poor-band label.
- **Persona**: PO/SME, New user.

### [P3-005] Bridges/Restrictions CSV requires the FULL template column set (document it)
- **File**: `srv/mass-upload.js` (sheet-column validation: "Sheet \"Bridges\" must contain a \"ID\"/\"descr\" column.")
- **Symptom**: A partial-column CSV (only the fields you want to change) is rejected; you must supply the full template header (incl. `ID`, `descr`, …).
- **Assessment**: **Not a bug** — error message is clear, and the downloaded template has all columns. But it surprises users hand-building update files.
- **Fix**: documentation only (the `demo-data/LOADING-GUIDE.md` now covers "download the template"); optionally relax to require only key + provided columns for updates (larger change — defer).
- **Persona**: New user, Power user.

---

## Verified working (no action)
- Create + update **persist and commit** (15 bridges, 8 restrictions); **ChangeLog written on every CUD** (grew on create + update).
- **Restriction → bridge linking** (`bridgeRef` → `bridge_ID`) resolves; **closure → posting-status recompute** fires.
- **Map** `/map/api/bridges` returns active bridges (lat/long); **Dashboard** KPIs + condition distribution reflect the data.
- **Mass-upload modes**: Create-only rejects existing keys; Update-only rejects missing keys; upsert default — all enforced (verified on AssetClasses + Bridges).
- **Facade read-only**: `PATCH /bridge-management/Bridges` → **405** (AdminService is the sole writer).
- **Hard delete blocked**: `DELETE /odata/v4/admin/Bridges(1)` → **400** (soft-delete-only via `deactivate`).
- **Change-documents** feed (`/audit/api/changes`) returns merged audit rows.
- **EAM mapping plugin** live (2 MappingDomains); **per-row results + validation** (required-field + lookup-code) work; **`conditionRatingBand`** derived on read.

## Not HTTP-probed (covered elsewhere)
- **HV assessment** (`assessVehicle`/`assessRoute`): probe hit the wrong service path (404); covered by the jest suite (HV module).
- **BTP deployed app**: XSUAA-gated; not browser-automatable without credentials — smoke verified separately (front door 302, OData 401, FE tiles load once the role is on a fresh token).
