# CLAUDE.md — BIS Engineering Contract

> Authoritative rules for anyone (human or agent) changing the Bridge Information
> System (BIS / BridgeManagement). These are **locked**: do not violate without an
> explicit, recorded decision from the product owner.

## 1. Stack

- **Backend**: SAP CAP (Node.js), `@sap/cds` v9, OData V4, Fiori Elements V4 (draft-enabled).
- **DB**: SAP HANA Cloud (prod) / SQLite (dev). Spatial data currently stored as
  `Decimal` lat/long + GeoJSON `LargeString` (see CRS policy below).
- **Auth**: XSUAA (prod), dummy (dev). Three scopes: `view` / `manage` / `admin`.
- **Runtime**: **Node 20.x** (pinned in `.nvmrc` / `.tool-versions` / `package.json`).
  Node 16/18 cannot run @sap/cds v9.
- **Deploy**: MTA → Cloud Foundry. CI in `.github/workflows/ci.yml`; gated deploy in
  `deploy.yml`. See `docs/RUNBOOK.md`.

## 2. Locked architectural rules

1. **Additive-only schema.** Never remove or rename existing fields/entities. New
   work extends; migrations are additive. Old columns are deprecated, not deleted.
2. **Soft-delete only.** No hard `DELETE` is granted on business entities
   (Bridges, Restrictions, BridgeRestrictions). Removal is via the `deactivate`
   action, preserving the audit trail.
3. **ChangeLog on every CUD.** Create/update/deactivate must be captured in
   `ChangeLog` (see `srv/audit-log.js`).
4. **Zero hardcoding.** Behaviour is config-driven via `SystemConfig` (and the
   admin tile), not code branches or magic numbers. No hardcoded KPI values,
   endpoints, or mappings.
5. **XSUAA-first security.** Every service entity is `@restrict`-gated. Button
   visibility (not just disable) is auth-driven. No secrets in the repo.
6. **i18n for all strings.** User-facing text lives in `app/_i18n` / per-app i18n.
7. **Observability.** Every request carries a correlation ID (`srv/server.js`).
   Log via `cds.log`, not `console`.

## 3. GIS / CRS policy

- BIS assets are Australian. The **target datum is GDA2020 (EPSG:7844)**.
- Latitude/longitude are stored as WGS84-compatible decimals; `geoJson` holds
  geometry. The active CRS is declared in `SystemConfig` key `GIS_CRS_EPSG`
  (default `7844`). See `docs/eam-mapping/GIS-CRS-POLICY.md` for the native
  spatial-column migration path (HANA `ST_GEOMETRY`, spatial index) — a gated DB
  task, kept additive so SQLite dev is unaffected.

## 4. SAP S/4HANA EAM alignment

- The app is **standalone, S/4-compatible**. It must run with no live S/4 system.
- All EAM attributes are admin-configurable; all BIS↔EAM field mappings are
  maintained in-app (no hardcoded mapping). See `docs/eam-mapping/` —
  `SAP-S4-ALIGNMENT.md` (plan), `04-gap-analysis.md` (field design),
  `99-open-questions.md` (12 recorded decisions).

## 4b. Condition rating & EAM boundary

- **Condition rating** has one source of truth: `srv/lib/condition-rating.js`. Stored
  `conditionRating` is the legacy BMS **1–10** scale (10 = best); the label uses the
  **TfNSW 1–5** band (1 = Good … 5 = Critical). High-priority = TfNSW ≥ 4. Never
  re-define the mapping inline — import the module.
- **Complement SAP EAM, do not replicate it.** SAP EAM is the system of record for the
  maintenance-execution + asset-master layer (functional locations, equipment, work/
  maintenance orders, notifications, maintenance plans, costs/valuation). This app owns
  the bridge-**engineering** specialist data (condition, capacity, risk, restrictions,
  GIS) and the **integration/mapping** layer. Reference EAM objects (FLOC/equipment/
  order/notification ids) and deep-link out — do **not** build a parallel work-order,
  maintenance-plan, or depreciation engine. Inspection *scheduling/execution* lives in
  EAM; this app provides the engineering policy (`AssetClassStrategy`) + an advisory
  overdue signal and maps strategy → EAM maintenance plan (`eamMaintenancePlan`).

## 5. Working agreements

- Change in small, logically-grouped commits; run `npx cds build` + `npm test`
  (Node 20) before committing. CI must stay green.
- Prefer event-driven over polling (see `FkMessageGuard.js` for the pattern).
- Surface — do not silently perform — anything touching access controls, secrets,
  or destructive operations.
- Keep a single source of truth; remove duplication when you find it.

## 6. Known-defect register

Tracked in `docs/defects.md`. Reference the `TC-*` id in commits that fix them.
