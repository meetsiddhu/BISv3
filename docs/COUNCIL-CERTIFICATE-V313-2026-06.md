# Closure Certificate — Bridge Information System v3.13.0
**Re-verification basis:** 4 independent lenses (engine, governance, platform, restrictions); full suite executed live on Node 20.19.6 — 29 suites / 278 tests, all green, matching the release claim at 068490d.

## 1. Per-Finding Status

| ID | Status | Evidence (one line) |
|----|--------|---------------------|
| B1 | CLOSED | `num` crash fixed at module scope (prioritisation-service.js:13); end-to-end booted-service test asserts scoreFleet runs, ranks contiguously, and rejects view-only users — 42/42 targeted, full suite green. |
| B2 | CLOSED | NULL-safe Active-only WHERE, ORDER BY ID deterministic paging (forced multi-page in test), set-based IN-clause child reads via shared buildContext, chunked batch inserts, config-driven cap with loud warn+audit+result-flag truncation — all tested. |
| B3 | PARTIAL | runType column lands and works (fleet supersedes only fleet, manual masquerade defeated, per-run supersede audit, 11/11 tests) — but forceReview still gates nothing: fleet rows stamped active:true unconditionally. |
| B4 | PARTIAL | restrictionFlag from loaded context, NULL strategy, Data-only badge + provenance in UI, runType in analytics — all verified; but includedWeight/totalWeight coverage columns have zero hits anywhere, renormalisation still silently shrinks the denominator. |
| B5 | PARTIAL | Band-severity-first ranking implemented and non-vacuously tested (lower-score SafetyFloor bridge outranks higher-score P3) — but no per-model/weightSetHash partition; cross-model score merging within bands is latent, re-exposed the moment a second model is authored. |
| B6 | PARTIAL | Frozen resolved paramSnapshot, persisted exclusions with rationale, extended weightSetHash basis — all proven; but the PDF appendix claim is FALSE: zero diff to the appendix, rule-engine-v1 portfolios still print the legacy v1 formula as methodology, and Active models remain editable in place. |
| B7 | CLOSED | Additive monotone userTypeFactor outside the denominator, Over/Under derived AND enforced via axisMatch, OVER_UNDER attribute runtime-ensured; golden vectors + monotonicity property + pinned old anti-monotone failure + end-to-end evaluate all pass. |
| B8 | CLOSED | bhiWeights governed via SystemConfig with refresh at all six entry points, calculator-parity defaults frozen and pinned, partial-merge/junk rejection tested, service-level admin-edit-changes-result loop closed. |
| B9 | CLOSED | Zero CSV/hdbtabledata for the nine tables verified three ways (db/data, fresh production build, shipped mtar); insert-if-missing UUID-keyed seed on served; 18-entry undeploy.json identical everywhere; cold-start/idempotency/admin-survival tests 7/7. |
| B10 | CLOSED | bhi-explorer fully i18n'd with busy/error/empty states and surfaced 500-cap; FE report defaults to SPV (active EQ true, fleetRank asc / score desc) verified in source, csn.json, and shipped mtar — inspection-verified, not test-guarded. |
| R1 | CLOSED | VH and register proven same-source (projection on my.Bridges, Active-only injector bound to register only); test asserts VH = register(default) ∪ register(Inactive) and pins the app's ValueList annotation — 8/8. |
| R2 | CLOSED | 17 NHVR restriction types + expanded units/directions/classes/statuses seeded insert-if-missing on served with per-code audit; no CSVs for the six codelists; live boot seeded 17/8/6/11/4/5; idempotency and admin-row preservation tested — 24 unit tests pass. |
| R3 | CLOSED | RestrictionNhvrAttributes aspect (gazette, axle/GCM limits, detour, signage, etc.) on BOTH Restrictions and BridgeRestrictions, lane/severity parity fields, fixed direction default, full UI facets + range guards; round-trip persisted in test. |
| R4 | CLOSED | Mass upload covers all previously-dropped and all new columns with blocking/soft codelist validation, RST-NNNN auto-ref, in-tx per-row audit, posting-status recompute; end-to-end test flips a bridge to CLOSED and rejects unknown types. |
| R5 | CLOSED | Mass-edit whitelist expanded to 55 columns incl. all 8 missing + all NHVR/lane/severity fields, typed enforcement, new dropdown datasets, in-tx diff audit, posting recompute, lookup-backed UI editors — but no end-to-end test of the new columns. |
| R6 | NOT-CLOSED | Split-brain persists by construction: NetworkRestrictionReport reads BridgeRestrictions only, dashboard KPIs read Restrictions only, no migration script exists, restrictionFlag/postingStatus each single-master — the "reads BOTH masters" closure claim is not what shipped, and the test is constructed to avoid asserting cross-surface visibility. |
| R7 | CLOSED | Closure derivation is catalogue-driven (isClosure types seeded, legacy CLOSURE honoured) and reachable via four real write paths with unit + integration coverage (bridge flips to CLOSED) — though the Restrictions Fiori app's AdminService path still never recomputes postingStatus (pre-existing). |

## 2. Counts

| Status | Count | Findings |
|--------|-------|----------|
| CLOSED | **12** | B1, B2, B7, B8, B9, B10, R1, R2, R3, R4, R5, R7 |
| PARTIAL | **4** | B3, B4, B5, B6 |
| NOT-CLOSED | **1** | R6 |
| **Total** | **17** | |

## 3. Verdict

**v3.13.0 is CERTIFIED — conditionally, with two claim corrections on the record.**

- **What is solid:** Every blocking defect is dead. The engine lens (B1/B2/B7/B8) and platform lens (B9/B10) are fully closed with adversarially-written, live-executed tests; the crash, the N+1 fleet path, the anti-monotone scoring, the ungoverned BHI weights, and the HANA-redeploy data-loss trap are all verifiably fixed. Restrictions closed 6 of 7, including the previously-unreachable closure derivation. The full release suite reproduces exactly as claimed (29/278 green).
- **What must be said honestly:** Two closure claims were overstated by the release, and the re-verification caught both. B6's "PDF appendix branches by formulaVersion" is simply false — the appendix is byte-unchanged and prints the wrong methodology for rule-engine-v1 portfolios. R6's "reads BOTH masters" did not ship — the two restriction dashboards still disagree by construction, and the integration test was shaped to step around it. The four governance PARTIALs all share a pattern: the claimed work landed and is well-tested, but one element of each original council finding was quietly dropped.
- **Standing:** Yes — the app **returns to and in places exceeds** the prior top-1%-with-residual-gaps standing. Engine determinism, parameter-snapshot reproducibility, seed-survival guarantees, and audit discipline are now stronger than at any prior certification. But the residual-gap register is *larger and sharper* than before, and one of its items (R6) is a user-visible data-integrity contradiction, not a polish gap. Certification stands on the condition that R6 and the B6 appendix lead the next cycle.

## 4. Residual Backlog

**P1 — correctness/integrity**
1. **R6 — unify the two restriction masters** (or sync them): make NetworkRestrictionReport, dashboard KPIs, prioritisation restrictionFlag, and postingStatus see one truth; includes R7's residual (AdminService writes never recompute postingStatus) and R4's residual (no BridgeRestrictions upload path; ref-less xlsx rows get null refs).
2. **B6 — formulaVersion-aware PDF appendix** (rule-engine-v1 runs currently print the legacy formula as methodology); add the Active-model in-place edit guard.
3. **B3 — forceReview holds nothing from active**; plus dual-active (manual+fleet) double-counting in BandSummary and reportPdf coverage.

**P2 — governance hardening**
4. **B4 — includedWeight/totalWeight coverage columns** and UI surfacing (renormalisation still silently shrinks the denominator).
5. **B5 — partition fleet ranking by model/weightSetHash** before any second model is authored.
6. **B7 — server-side guard (weight ≥ 1) + audit hook** on ModelUserTypeWeights/UserTypesConfig/PreFilters, currently outside the MODEL_ENTITIES loop.
7. **B9 — PrioritisationConfig is the tenth truncation trap**: shipped CSV + include_filter:[] will delete admin-tuned config versions on redeploy; also make seed failures louder than a log line.

**P3 — polish/test debt**
8. B1: wire the manage-gated UI trigger for scoreFleet (no app caller exists).
9. B8: 60s config cache delays bhiWeights edits; computeBhi's silent `.limit(1000)` (council I4); rail/ped weights still road-derived.
10. B10: i18n the server-generated formula/priority strings; add regression tests for the SPV annotation and bhi-explorer i18n; SAC-facing Runs fact view still returns superseded runs.
11. R5: end-to-end test for new restriction mass-edit columns; R3: i18n the new CDS @title labels; ActiveRestrictions ignores effectiveTo/temporaryTo expiry; no gazette-expiry/review-due tile.
---

## 5. Amendment — v3.14.0 P1 closure (2026-06-11, post-certificate remediation)

The conditioned P1 package shipped and was **independently re-verified** (adversarial pass:
code read + tests re-run, full suite 34 suites / 312 tests green, both builds clean).

| Finding | Status | Shipped as |
|---|---|---|
| **R6** — restriction-master split-brain | **CLOSED** | `bridge.management.UnifiedRestrictions` UNION view feeds NetworkRestrictionReport, dashboard-tile API `/dashboard/api/analytics`, map layer + popups `/map/api/*`, data-quality checks, prioritisation restrictionFlag/context, and postingStatus derivation (also wired into AdminService write paths = R7 residual). Cross-surface tests in both directions incl. the HTTP surfaces the tiles call. Commits `d9adb66`, `fa5a246`. |
| **B6** — static PDF appendix; Active-model edits | **CLOSED** | formulaVersion-aware appendix (rule-engine sections per modelCode/version from the frozen snapshot; legacy text kept; mixed portfolios print both) + 409 edit guard on referenced Active models + admin `cloneModel` deep-copy to Draft v+1. Commits `0703c24`, `e50cc02`. |
| **B5** — single global fleet rank | **CLOSED** | fleetRank partitioned by (modelCode, modelVersion), band-first within partition, partition split stamped on the fleet ChangeLog. Commit `bd58fe2`. |
| **B3** — forceReview held nothing; dual-active double-count | **CLOSED** | `reviewStatus='pending'` hold excluded from default worklist/BandSummary/PDF; manage-gated `releaseRun`; one-run-per-bridge with manual-beats-fleet precedence (`srv/lib/effective-runs.js`). Commit `44d418a`. |
| **B4** — silent denominator shrink | **CLOSED** | engine returns includedWeight/totalWeight; stamped on runs + breakdown JSON; analytics columns + "Scored on X of Y weight" in run detail. Commit `44d418a`. |

Note for the record: the re-verification again caught one overstated claim mid-cycle —
the first R6 unification reached only the unconsumed KPI functions while the actual
dashboard tile, map and data-quality surfaces still read one master; this was fixed and
HTTP-surface tests added before this amendment (`fa5a246`). Two consecutive cycles have
now required exactly this class of correction: **closure claims must name the consuming
UI surface, not just the service function.**

Remaining open: P2 items B7, B9 and the P3 register above. **The certification condition
is met; v3.14.0 carries no known P1 integrity gaps.**
