# UAT Fix List — BridgeManagement (BIS) v3.54.0 — 2026-06-22

Expert-council UAT (PO · QA · UX · Dev · Security). Target: code @ 3.54.0 + local `cds watch`
instance (browser automation was blocked in this environment — see Tile Report §Environment).
**No P1 (blocker) findings.** Core flows, security posture, and the 448-test suite are all green.

Priority legend: **P1** blocks core flow / security / data loss · **P2** degrades UX or correctness
(workaround exists) · **P3** polish / hardening / minor.

---

## Resolution — fix pass applied 2026-06-22 (→ v3.55.0)
| ID | Status | What changed |
|---|---|---|
| P2-001 | ✅ FIXED | Added `sendError()` helper (logs full error server-side, returns generic message); migrated **41** 5xx Express handlers in `srv/server.js`. 4xx app-authored validation messages deliberately kept. |
| P2-002 | ✅ FIXED | ~30 hardcoded strings in `bms-admin` SystemConfig/GisConfig/BnacConfig (+ dashboard/mass-edit tooltips, Attachments noData) moved to i18n bundles. |
| P2-003 | ✅ FIXED | GIS Config delete-layer button now has `tooltip="{i18n>gis.deleteLayer}"`. |
| P3-001 | ✅ FIXED | `Axle Mass Limit` added to the canonical `RestrictionTypes` catalog (`restriction-codelists.js`, additive, seeded insert-if-missing → 32 codes). |
| P3-002 | ☑ NOT A CODE BUG | Investigated: `$count=0` is **systematic across ALL `sap.common.CodeList` entities** in local SQLite (CAP localized-CodeList behaviour) — rows still load, values work. Almost certainly dev-only; expected to behave on HANA. No code change (a custom `$count` override would risk breaking value-help). **Confirm on deployed HANA.** |
| P3-003 | ☑ ACCEPTED | By-design scope booleans for UI visibility; safe on BTP HTTPS. No change. |
| P3-004 | ✅ FIXED | Folded into P2-002 (noDataText externalised). |

**Verification:** `cds build --production` clean · eslint clean · **jest 448/448** · live re-test: error-hardening
preserved (`/mass-edit` 200), custom-attr **422 enforcement intact**, new catalog code seeded.

---

### [P2-001] Express error handlers return raw `error.message` to the client
- **File**: `srv/server.js` (~90 `catch` blocks, e.g. `:1503-1504`, `:2614`)
- **Symptom**: `res.status(500).json({ error:{ message: error.message ... }})` returns the raw
  message. For app-thrown strings this is fine, but errors bubbling up from libraries (DB driver,
  xlsx parser, fetch) can leak internal detail (file paths, SQL fragments, internal URLs).
- **Expected**: client gets a generic message; full error logged server-side only.
- **Root cause**: convenience pattern repeated across the freestyle Express routes.
- **Fix**: add one helper `sendError(res, status, friendly, err)` that does `LOG.error(friendly, err)`
  + `res.status(status).json({error:{message:friendly}})`; migrate the catch blocks to it. Keep
  app-authored validation messages (they're intentional).
- **Test**: force a library error (e.g. malformed upload) → response body contains only the friendly
  message; full detail appears in the server log.
- **Persona**: Security auditor
- **Related**: CLAUDE.md §5 (surface, don't leak). Security-thread finding.

### [P2-002] ~30 hardcoded user-facing strings in BMS Admin freestyle views (i18n violation)
- **File**: `app/bms-admin/webapp/view/SystemConfig.view.xml:12,15,17,27,32,34-38`;
  `app/bms-admin/webapp/view/GisConfig.view.xml:14,17-20,29-80,123,169`;
  `app/bms-admin/webapp/view/BnacConfig.view.xml:27,54,73`
- **Symptom**: titles, button texts, column headers, and `noDataText` are literal strings, not
  `{i18n>...}` keys (e.g. `text="System Configuration"`, `noDataText="No settings in this category"`).
- **Expected**: all user-facing text from the per-app i18n bundle (CLAUDE.md §2.6).
- **Root cause**: these admin views were built freestyle and skipped i18n extraction.
- **Fix**: add keys to `app/bms-admin/webapp/i18n/i18n.properties` and replace the literals with
  `{i18n>key}` bindings. Mechanical + additive.
- **Test**: grep the three views for `text="`/`noDataText="` with a literal → none remain; app renders
  unchanged.
- **Persona**: PO/SME, New user (localisation)
- **Related**: [P3-004]. Inventory-thread finding.

### [P2-003] Icon-only delete button missing tooltip
- **File**: `app/bms-admin/webapp/view/GisConfig.view.xml:182`
- **Symptom**: `<Button icon="sap-icon://delete" press=".onDeleteCustomWms"/>` has no `tooltip`/aria —
  a new user can't tell what it does; screen-reader announces only "button".
- **Expected**: `tooltip="{i18n>gis.deleteLayer}"` (accessible name).
- **Fix**: add `tooltip` (i18n key) to the button.
- **Test**: hover shows label; accessibility-tree exposes an accessible name.
- **Persona**: New user, Accessibility user

### [P3-001] One restriction uses an off-catalog `restrictionType`
- **File**: data (local + likely deployed demo set) — entity `Restrictions.restrictionType`
- **Symptom**: 1 of 78 restrictions has `restrictionType = "Axle Mass Limit"`, which is **not** one of
  the 31 `RestrictionTypes` catalog codes (catalog has `Mass Limit`, `Single Axle Limit`, … but not
  that exact string). Other 77 map cleanly.
- **Expected**: every `restrictionType` resolves to an active catalog code (value-help integrity).
- **Fix**: either add `Axle Mass Limit` to the `RestrictionTypes` seed, or remap that row to the
  nearest catalog code (`Mass Limit`/`Single Axle Limit`). Demo-data fix, not code.
- **Test**: distinct `restrictionType` ⊆ catalog codes.
- **Persona**: PO/SME (data quality)

### [P3-002] `$count` returns 0 on code-keyed lookup entities while rows exist
- **File**: OData lookups — `AdminService.AssetClasses`, `AdminService.RestrictionTypes` (code-keyed
  CodeLists)
- **Symptom**: `GET /odata/v4/admin/AssetClasses/$count` → `0`, yet `AssetClasses?$select=code`
  returns 6 rows (and RestrictionTypes 31). `$select=ID` also returns 0 because these entities are
  keyed by `code`, not `ID`.
- **Expected**: `$count` reflects actual row count.
- **Root cause**: likely a projection/key-element interaction on the CodeList; FE value-help dialogs
  using `growing` + `$count` could display a wrong total or suppress paging.
- **Fix**: investigate the CodeList projection/key annotation; confirm value-help "growing" counts
  render correctly in the FE search-help, adjust the projection if it shows 0.
- **Test**: `$count` equals `$select` row count for both entities; FE value-help shows correct totals.
- **Persona**: Power user (value-help), Dev

### [P3-003] `/launchpad/config` exposes JWT scope booleans
- **File**: `srv/server.js:2835-2838`
- **Symptom**: endpoint returns `scopeCheckAdmin/Manage/View` booleans (used to hide/show UI). Minor
  role-enumeration surface.
- **Expected**: acceptable by design on BTP (HTTPS enforced); document + consider rate-limiting.
- **Fix**: no code change required; add a code comment + note in security docs. Accept as-is.
- **Persona**: Security auditor

### [P3-004] Inconsistent `noDataText` i18n across freestyle views
- **File**: `app/bms-admin/webapp/view/SystemConfig.view.xml:32`,
  `app/bms-admin/webapp/view/GisConfig.view.xml:123,169`,
  `app/bms-admin/webapp/view/BnacConfig.view.xml:27,73`,
  `app/admin-bridges/webapp/ext/fragment/Attachments.fragment.xml:30`
- **Symptom**: some tables use `{i18n>...}` for empty-state text, others use literals.
- **Fix**: fold into [P2-002]; route all `noDataText` through i18n.
- **Persona**: New user, PO/SME

---

## Verified PASS (no fix needed)
- Restriction **Custom Attributes** data layer: assign class (200) → save values (200) → **allowed-value
  enforcement (422, clear message)** → persistence (read-back correct) → **audit-history row written**.
  The 3.54.0 fix targets the BTP-only script-load that renders this panel; the API beneath it is sound.
- **Facade read-only**: `PATCH /bridge-management/Bridges` → **405** (AdminService is the sole writer).
- **Security posture GOOD**: `@restrict` gating, CSV formula-injection escaping (`csv-export.js`), no raw
  SQL, no hardcoded secrets, CSRF on all mutation Express routes, ChangeLog on every CUD.
- **Test suite**: 448/448 passing, 55 suites (no regression from 3.54.0).
- Lookup integrity: all 5 bridge `assetClass` values ∈ catalog; 77/78 `restrictionType` ∈ catalog.
