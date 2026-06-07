# UAT — BIS v3.9.3 (functionality + role-based)

Date: 2026-06-07 · Env: BTP dev (deployed v3.9.3) · Method: live OData/$metadata against
the deployed app (cache-independent) + 102 automated unit tests. Browser FE rendering was
constrained by a stale component-preload cache (see Constraints).

## Functionality verified live (deployed `$metadata` + data)

| Capability | Evidence | Result |
|---|---|---|
| Risk worklist new columns | `BridgeRiskReport` exposes strategyName, inspectionIntervalMonths, nextInspectionDue, inspectionOverdue, estimatedRulYears, expectedValueAud | ✅ |
| Mode-aware risk | `RiskConfig` mode_Rail/mode_LightRail seeded; deriveRisk reads them | ✅ (unit-tested) |
| RUL functional | `AssetClassStrategy` seeded: Road 0.30 / Rail 0.40 / LightRail 0.35 deg/yr + EAM plan + review cycle | ✅ |
| Monetised risk | Bridges.likelyFailureCostAud/mitigationCostAud/riskReductionPct/expectedValueAud live | ✅ |
| NSW Level-2 elements | `BridgeElements` + `ElementTypes` (10 codes w/ OTEIL) live; defect→element FK | ✅ |
| EAM complement layer | `EAMFieldMapping` (seeded), `EAMSyncLog` (admin), EAM reference fields on Bridges/Inspections/Capacities/Restrictions/Defects incl KOKRS/ORGID | ✅ |
| Defect state machine | status transitions + cross-bridge element guard enforced | ✅ (code + unit) |
| GeoJSON ingress/export CRS | validateGeoJson + EPSG export on bridges + restrictions | ✅ |
| Condition mapping correctness | changeCondition uses correct reverse map (Good→legacy 10) | ✅ (unit-tested) |
| Audit durability | mass-upload + mass-edit fail-fast on bulk audit failure | ✅ (unit-tested) |

## Role-based behaviour

- 3 XSUAA scopes: **view** (read), **manage** (create/update/soft-delete), **admin**
  (config + EAM + audit). Enforced via `@restrict` on every entity in `admin-service.cds`.
- Confirmed: the admin user reads the admin-only `EAMSyncLog` (HTTP 200). A non-admin
  would receive 403 (gating is server-side, not just button visibility).
- Soft-delete only: no hard DELETE granted on Bridges/Restrictions/BridgeRestrictions.

## Create / Change / Display (prior sessions, same draft model)

- Create + change verified end-to-end earlier (e.g. engineer risk override recomputed
  24.00/Medium → 40.00/High with justification persisted); draft edit→patch→activate 200.

## Constraints (honest)

- **Browser FE rendering:** after each redeploy the FLP serves a *stale cached
  component-preload*; opening an FE app needs a hard browser refresh / cache-bust. The
  apps themselves deploy clean (builds pass, 102 tests green); this is a browser HTTP-cache
  artifact, not an application defect. Verification was therefore done against the
  authoritative deployed `$metadata`/OData.
- **Agent cannot log in:** entering SAP credentials is prohibited; the session is the
  user's. The trial **HANA auto-stops** and the **SSO session expires** intermittently
  (re-established via a `$metadata` round-trip).
- **Multi-user role test:** testing as separate view/manage users needs those logins;
  gating is verified in code + the admin-access check above.
