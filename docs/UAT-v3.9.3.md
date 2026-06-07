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

---

## UAT addendum — v3.9.7 (A-tier + critical regression fix), live on HANA

A live end-to-end UAT against the deployed app (authoritative, OData):

| Scenario | Evidence | Result |
|---|---|---|
| **Create / Edit** (draftEdit → patch → activate) | 201 → 200 → 200 on Bridge 1007 | ✅ PASS |
| **Risk monetisation (RISK-T4)** | likelihood 4 → EV $900,000 (= 0.18 × $5,000,000); ROI 1.44 (= $900k × 80% ÷ $500k) | ✅ correct |
| **Config-governed probability (RISK-T2)** | prob_4 = 0.18 from RiskConfig drives EV | ✅ |
| **Virtual riskCriticality (FE_UX-1)** | 'Very High' → 1, draft-safe (not in SQL) | ✅ |
| **EAM enum validation (EAM-T4)** | invalid eamSyncStatus → HTTP 400 | ✅ rejected |
| **recalcRisk admin action** | 200, register re-scored | ✅ |

### Critical regression found & fixed during this UAT
The live UAT surfaced a **create/edit outage** (draftEdit → HTTP 500, `sql syntax error near "="`).
Root cause: the `riskCriticality` **calculated SQL column** on the *draft-enabled* Bridges
projection (added v3.7.0 for the object-page colour) is mis-translated by the CAP draft
engine to invalid HANA SQL (`case riskPriority when ? = true then ?`) — for ANY CASE form.
Fix (v3.9.7): made `riskCriticality` a **virtual element** computed in a `this.after('READ')`
handler (like `hasCapacity`), so it never enters the draft SQL. Create/edit restored;
object-page colour retained. This is exactly the kind of HANA-vs-SQLite, draft-only defect
that unit tests on SQLite cannot catch — found only by live UAT.

---

## UAT addendum — v3.9.12 (i18n/WCAG + god-file split + GIS proximity fixes)

Live, post-extraction smoke test surfaced and fixed **two pre-existing GIS proximity bugs**
(neither a regression from the extraction — clusters + GeoJSON export passed throughout):

| Scenario | Before | After (v3.9.12) |
|---|---|---|
| `GET /map/api/proximity` | **500** `invalid column name: bridgeId` (HANA columns are UPPERCASE; SELECT used camelCase) | fixed → **200** |
| Proximity result set | **0 rows** (fluent `.where('lat >=', v)` form returned empty on HANA) | tagged-template where → **correct** |
| 50 km of Sydney (-33.85, 151.21) | — | **9 bridges, distance-sorted**: Sydney Harbour Bridge 0.27 km, Anzac 3.28 km, Iron Cove 5.11 km, … Windsor 45.09 km ✅ |
| Clusters (z6 / z15) | — | clusters / points 200 ✅ (parseBbox + zoomToCellSize, now extracted + unit-tested) |
| GeoJSON export | — | 200, `FeatureCollection`, CRS **EPSG:7844**, 32 features ✅ |

Proximity search was **completely broken on HANA before this release** and is now fully
working. Verified live against the deployed app.
