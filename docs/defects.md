# BIS — Defect Register

> Traceability for known defects. Reference the `TC-*` id in any commit that
> changes status. Addresses COUNCIL-REPORT finding **C-9** (no traceability).
> The four `TC-*` ids originate from an external test-case list; mappings to the
> council's internal `C-*` findings are noted.

| TC ID | C-ref | Title | Severity | Status | Fixed in | Evidence / Notes |
|-------|-------|-------|----------|--------|----------|------------------|
| TC-FUNC-001 | C-1 | Create on Defects/Inspections blocked by stale Integer-FK parse error | P1 | **Fixed** | `FkMessageGuard.js` (commit c373535) | Replaced 500 ms poll with event-driven guard hooking core parse/validation errors. Add a UI regression test (see Backlog). |
| TC-DEVOPS-001 | C-2 | No CI/CD; Node 16 vs required 20 (env drift) | P1 | **Fixed** | `.github/workflows/ci.yml`, `deploy.yml`, `.nvmrc`, `.tool-versions`, `docs/RUNBOOK.md` | Repeatable build gate + gated deploy + pinned Node 20. |
| TC-FUNC-008 | C-4 | Admins could hard-delete Bridges/Restrictions (soft-delete rule breach) | P1 | **Fixed** | `srv/admin-service.cds` (commit c373535) | Removed all hard `DELETE` grants; removal via `deactivate` action only. *(TC-FUNC-008↔C-4 mapping inferred — confirm against external test list; alternative candidate was C-3 GIS.)* |
| TC-UX-001 | C-9 | UX / traceability defect (exact symptom undocumented externally) | P2 | **Mitigated** | this register + `CLAUDE.md` | No defect register existed; now created. Confirm the precise UX symptom against the external test case and update this row. |

## Council findings (full list) — status

| C-ref | Title | Severity | Status |
|-------|-------|----------|--------|
| C-1 | Fragile FK parse-error poll → event-driven guard | P1 | ✅ Fixed |
| C-2 | CI/CD + Node 20 pinning | P1 | ✅ Fixed |
| C-3 | GIS CRS/datum undeclared | P1 | ⚙️ Policy + config done; native spatial migration staged (`GIS-CRS-POLICY.md`) |
| C-4 | Hard-delete grants removed | P1 | ✅ Fixed |
| C-5 | `status` controlled vocabulary | P2 | ✅ Already enforced via fixed-value list; DQ note added |
| C-6 | Duplicated FK workaround | P2 | ✅ Fixed (single `FkMessageGuard.js`) |
| C-7 | Missing contract doc | P2 | ✅ Fixed (`CLAUDE.md` / `AGENTS.md`) |
| C-8 | WCAG 2.1 AA not verified | P2 | ⚙️ Checklist + safe ARIA added; full audit staged (`ACCESSIBILITY.md`) |
| C-9 | No defect register | P2 | ✅ Fixed (this file) |
| C-10 | Correlation-ID propagation | P3 | ✅ Fixed (`srv/server.js`) |

## Backlog (follow-ups)

- **UI regression test for TC-FUNC-001** — Playwright: type a bridge name in the
  Defects ComboBox, select, confirm Save succeeds and no stale message remains.
- **C-3 native spatial migration** — HANA `ST_POINT(7844)` + spatial index (gated).
- **C-8 full WCAG audit** — run axe on map-view and dashboard custom controls.

## Multi-modal / risk program — P1/P2/P3 punch-list status (v3.5.0)

| Ref | Item | Status | Evidence |
|-----|------|--------|----------|
| P1.1 | ALP chart bars don't render | ✅ Fixed | Static SUM measure `restrUnit` (`@Analytics.Measure @Aggregation.default:#SUM`) replaces unresolved DynamicMeasure. v3.4.3 |
| P1.2 | Sparse multi-modal data | ✅ Seeded | Rail/LightRail/Pedestrian bridges + networks via draft flow (UAT) |
| P1.3 | Engineer risk override | ✅ Done | "Risk & Strategy" object-page facet (override + consequence/likelihood + justification); SAVE hook honours it. v3.4.3 |
| P2.4 | `/$count` could crash srv | ✅ Mitigated | `process.on('uncaughtException'/'unhandledRejection')` safety net in `srv/server.js` keeps the instance alive + logs |
| P2.5 | Bulk draft-activate 404 | ✅ Cosmetic-confirmed | Records persist; the FE/UI create path returns 204. API bulk path logs a harmless 404 on the unbound activate. No data impact |
| P2.6 | "Dead" bms-admin AttributeConfig | ✅ Retained by design | Not dead — it is the graceful fallback (`Shell.controller.js:48`) when `CrossApplicationNavigation` is unavailable. Removing it would break that fallback |
| P2.7 | Lookup seeding | ✅ Documented | All code-lists seed from `db/data/*.csv` on deploy (HDI). NB: CSV is comma-delimited — lookup descriptions must not contain commas |
| P3.8 | Live S/4 EAM integration runtime | ⏸ Blocked (external) | Needs a reachable S/4 + BTP destination + user credentials. App stays standalone/S/4-compatible; `EAMCodeMapping` + reference fields in place. Runtime untestable without S/4 |
| P3.9 | Native HANA spatial | ➡ Superseded | Portable **GeoJSON `LargeString`** approach delivers Point/Line/Polygon/Polyline in both SQLite dev and HANA without breaking the dev/test path |
| P3.10 | Config-driven risk weights | ✅ Done | `RiskConfig` weights loaded into `deriveRisk(b, weights)`; `recalcRisk` reloads weights. 4 new unit tests |
| P3.11 | WCAG | ⚙️ Heuristic pass | Map canvas/buttons carry `role`/`aria-label`; full axe run remains in backlog |

### GIS geometry (new requirement, v3.5.0)
Bridges store geometry as GeoJSON (`geoJson : LargeString`). Both maps now render
**Point, MultiPoint, LineString (polyline), MultiLineString, Polygon, MultiPolygon
and GeometryCollection** via `L.geoJSON` with type-based styling and popups:
- `app/map-view/.../Main.controller.js` → `_renderGeometry()` / `_geometryStyle()`
- `app/admin-bridges/.../gisMapInit.js` → object-page mini-map renders the bridge's geometry
- Geometry is viewable/editable on the Bridge object page (GeoJSON text field).
