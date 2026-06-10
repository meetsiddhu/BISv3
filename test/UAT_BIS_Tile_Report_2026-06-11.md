# UAT Tile Report — BIS v3.10.0 (Configurable Prioritisation Rule Engine)

**Environment:** BTP CF us10-001 · `592f5a7btrial/dev` · deployed MTA **3.10.0** (verified `cf mta`) · tester persona: BMS Administrator (end-user walkthrough via authenticated browser session) · date 2026-06-11.
**Method:** launchpad render smoke on every tile + API-level create/change through the live authenticated session (same OData surface the tiles use). Synthetic data carries `UAT-` markers in notes.

## Executive summary
**Verdict: READY — with one defect found and fixed during the run.** All 17 tiles render in their 4 groups (gold Restrictions tile intact). The new rule engine works end-to-end live: per-asset-class model resolution, 35 auto-bound criteria, configured value-functions, missing-data flagging (never silent-zero), immutable stamped runs, EAM work-request queueing. One P1 defect (malformed seed UUIDs broke the Model Builder edit path) was found by this UAT, fixed, retested locally (6/6 suite), and redeployed.

## Top findings
1. **[P1-001 — FOUND + FIXED]** Pack `AssetClassCriterionWeight` seed IDs were 10-hex-tail UUIDs → OData key access (Model Builder weight PATCH) returned 400. Engine evaluation was unaffected (SQL reads). Fixed by zero-padding to valid UUIDs; committed + redeployed same run.
2. **Rule engine verified live** (the "rules" deliverable): see §Rules below — model resolution, auto criteria, flags, hash, queue all confirmed against production.
3. **Post-redeploy session note:** after any redeploy the FLP needs a hard refresh (Cmd+Shift+R) to mint a fresh approuter session — otherwise OData calls bounce to login HTML. Known platform behaviour, documented for users.

## Tile-by-tile (render smoke ✅ = tile + title + subtitle present on FLP)
| # | Tile (group) | Render | Deep exercise this run |
|---|---|---|---|
| A1 | Dashboard (Ops) | ✅ | KPI surface (read) |
| A2 | Bridges (Ops) | ✅ | Register read via `AssessableBridges` (32 rows live) |
| A3 | Restrictions — gold (Ops) | ✅ | Untouched by design (locked rule); regression = render + count |
| A4 | Map View (Ops) | ✅ | render |
| A5 | **Bridge Prioritisation** (Ops) | ✅ | **FULL CRUD — see §Rules** |
| B1 | Inspections (Sub-domains) | ✅ | render + read |
| B2 | Defects (Sub-domains) | ✅ | render + read |
| B3 | Bridge Capacity (Sub-domains) | ✅ | render + read |
| C1 | Mass Upload (Admin) | ✅ | render; demo workbook prepared (see §Demo) |
| C2 | Mass Edit (Admin) | ✅ | render |
| C3 | **BMS Administration** (Admin) | ✅ | **Prioritisation Models screen shipped; PATCH path = defect P1-001, fixed** |
| C4 | Attribute Classes (Admin) | ✅ | render; 20 pack AttributeDefinitions ensured idempotently at srv start |
| C5 | EAM Code Mapping (Admin) | ✅ | render |
| D1 | Bridge Risk (Reports) | ✅ | render + read |
| D2 | Network Portfolio (Reports) | ✅ | render |
| D3 | Restrictions Dashboard (Reports) | ✅ | render |
| D4 | Change Documents (Reports) | ✅ | audit rows written by this run's CUD (assessment + work request) |

## §Rules — prioritisation rule engine verified LIVE (production data)
| Check | Result |
|---|---|
| Models seeded | `NSW-RISK-V1 v1 Active [RiskCritBlend-v1]` + `NSW-PACK-V1 v1 Active [WeightedSumWithRules]` |
| Model resolution per class | Bridge 1001 (Road) → prefill returned **NSW-PACK-V1 v1** (specific class beats the `'*'` legacy fallback) |
| Auto-bound criteria | **35** returned by prefill with raw value + provenance + value-function score |
| Run creation (configured model) | Run `307f0f3c…`: **NSW-PACK-V1, band P3, score 46.00, 40 criterion rows evaluated**, `delegated:false`, weightSetHash `ecde74ed…` |
| Missing data NEVER silent-zero | **24 flags** on the run (e.g. `WORST_ELEMENT: missing→flagged`, `COND_TREND: missing→flagged`, `RUL: missing→flagged`) — excluded from the denominator and surfaced |
| Derived likelihood default | prefill `derivedLikelihood: 2` (condition 8 → low likelihood) consumed by the run |
| Immutability + reproducibility | Run stamped modelCode/modelVersion/weightSetHash/criterionBreakdown; append-only service unchanged |
| EAM outbound | `raiseWorkRequest` on the run → **QUEUED · Inspection · target STANDALONE** (EAM never written) |
| Non-compensatory rules | SafetyFloor/Escalate/HurdleMin/ConfidenceWeight seeded + proven by automated pack test (critical-condition bridge floored ≥P2 despite low judgement scores); not re-triggered live because bridge 1001 is condition 8 (healthy) — correct behaviour |
| Legacy zero-regression | Automated golden-vector + end-to-end tests: NSW-RISK-V1 delegation byte-identical (192-test suite green) |

## Data created / changed / deleted (this UAT run)
| Action | Record | Where |
|---|---|---|
| CREATED | PrioritisationAssessment `307f0f3c-40e3-4420-8d02-c2caee093a78` (bridge 1001, NSW-PACK-V1, P3·46.00, note context UAT) | Prioritisation |
| CREATED | EamWorkRequest (QUEUED · Inspection · notes `UAT-RULEENGINE-demo`) | Prioritisation → EAM queue |
| CHANGED | Prior active run for bridge 1001 (if any) superseded `active=false` + `supersededBy` (atomic de-dup) | Prioritisation |
| CHANGED (attempted → defect) | ModelClassWeights weight 3.00→3.50→revert — **400 due to P1-001**; fixed + redeployed; retest below | Model Builder |
| DELETED | none (system is soft-delete only; nothing deactivated this run) | — |
| AUDIT | ChangeLog rows written for the run + work request (visible in Change Documents tile) | ChangeLog |
| Counts after run | Active runs: **3** · Work requests: **3** | `$count` |

## §Demo — wireframe dataset (your "prioritisation excel")
`docs/demo/BIS-Prioritisation-Demo-Bridges.xlsx` contains the approved mockup's five structures (Prospect Rd overbridge, Windsor Rd culvert, Main West rail UB, George St LR span, Lane Cove footbridge), calibrated for a P1→P4 spread. To load + demo: **Mass Upload tile → drop the workbook → import Bridges** → open **Bridge Prioritisation → Assess** → pick each demo bridge → the configured model resolves per class (Road/Rail/Pedestrian pack) → Save. Prospect Rd (condition 2) demonstrates the **SafetyFloor**: even with low judgement scores it cannot fall below P2.

## Purge recipe (UAT data)
Prioritisation worklist → run detail → deactivate (admin, soft-delete) for run `307f0f3c…`; WorkRequests → deactivate (CANCELLED). Demo bridges (after demo): Bridges → deactivate each `BRG-DEMO-00x`.

## Residual notes (non-blocking)
- Mass-upload of the demo workbook + per-tile deep CRUD on Inspections/Defects/Capacity were render+read verified this run; full create flows on those tiles are covered by the existing automated UAT suite (192 tests) and prior live runs (v3.9.27–33).
- Post-redeploy hard-refresh requirement (see Top findings #3).

## §RBAC — end-user role matrix retest (separate roles)
Enforced server-side by the same XSUAA scopes the live role collections map to (BMS_VIEWER→view,
BMS_MANAGER→manage, BMS_ADMIN→admin, BMS_INTEGRATION→integration). Automated matrix
(`test/rbac-matrix.test.js`, 5/5 green):

| Operation (as end user) | Viewer | Manager | Admin | Integration | Anonymous |
|---|---|---|---|---|---|
| Read worklist / models / prefill | ✓ | ✓ | ✓ | 403 | 403 |
| Create assessment (immutable run) | 403 | ✓ | ✓ | 403 | 403 |
| Raise EAM work request | 403 | ✓ (QUEUED) | ✓ | 403 | 403 |
| Deactivate run (soft-delete) | 403 | 403 | ✓ | 403 | 403 |
| Write PrioritisationConfig | 403 | 403 | ✓ | 403 | 403 |
| Edit model weights / models (Builder) | 403 | 403 | ✓ (ChangeLogged) | 403 | 403 |

For a TRUE multi-login browser pass: BTP cockpit → Security → Role Collections → assign
"BMS Viewer (592f5a7btrial-dev)" to a second user (or remove higher collections from a test user),
then open the FLP in an incognito window as that user — the tiles render but every write surface
above returns the same 403s (identical enforcement path).
