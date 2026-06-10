# Council Synthesis — v3.11/3.12 Increment Review

## 1. Per-lens scorecard

| Lens | Verdict | Blocking | One-line |
|---|---|---|---|
| Domain / ISO 55000 / NSW | not-top-1% | 3 | Engine plumbing excellent, but user-type math is anti-monotone non-TfNSW, fleet rank renormalises away the consequence axis, and BSI applies NHVR/RMS weights to rail/pedestrian bridges. |
| IT / Architecture | not-top-1% | 3 | Foundations held (seeds clean, 200/200 green, prior 13 gaps closed) — but scoreFleet 500s on its first statement, the batch path can't reach 11,850 bridges, and CSV seeds will wipe admin-authored models on redeploy. |
| UI/UX | not-top-1% | 2 | bhi-explorer ships wholesale hardcoded English (locked-rule violation) with no busy/empty/error states; FE report is an untranslatable dead-end; Model Builder can't actually build. |
| Exec / portfolio defensibility | not-top-1% | 4 | Single-bridge story holds, but the fleet-rank narrative collapses: action crashes, rank contradicts band by design, and the "Ranked portfolio" tile opens unranked and double-counted. |
| End users / Auditor | not-top-1% | 3 | Prior closures intact, but fleet runs crash, stamp fabricated judgement fields rendered as engineer assessments, and are irreproducible despite the PDF's byte-identical claim. |

## 2. Deduped gaps, prioritised

### Blocks (10)

| # | Gap (lenses) | One-line fix |
|---|---|---|
| B1 | **scoreFleet crashes on every call** — `num is not defined` (srv/prioritisation-service.js:182; helper scoped inside reportPdf at :358); confirmed live twice, shipped in gen/, zero tests, no UI caller. *(IT, Exec, Auditor)* | Hoist `num` to module scope; add an integration test invoking scoreFleet end-to-end; wire a manage-gated UI trigger. |
| B2 | **Fleet "rank" is not a fleet rank** — no ORDER BY, no active filter, 2,000 cap vs 11,850 bridges, N+1 contextFor (~12k queries) + per-row writes in one request. *(IT, Exec, Domain)* | Deterministic paged job (WHERE active, ORDER BY ID), set-based bulk reads, batch inserts; fail loudly when truncated. |
| B3 | **Fleet runs silently retire engineer-judgement runs** — `active:false` on all prior runs, no confirmation, count-only audit, forceReview gates nothing. *(Domain, Exec, Auditor)* | Don't supersede manual runs (explicit replace flag or 'proposed' state); audit each superseded run id; hold forceReview runs from active. |
| B4 | **Fleet runs misrepresent themselves** — restrictionFlag hardcoded false, strategy 'Maintain' fabricated, ~10 weight points of manual consequence renormalised away, no run-type discriminator anywhere; UI renders them as engineer assessments. *(Domain, Auditor, Exec)* | Stamp restrictionFlag from loaded context, null strategy, add runType + includedWeight/totalWeight coverage; badge "data-only" in worklist and Runs. |
| B5 | **Rank contradicts band** — non-compensatory rules (SafetyFloor etc.) move band but rank sorts raw score; multi-model scores merged into one ladder. *(Exec)* | Rank band-first then score, per model/weightSetHash; document ranks as frozen to a fleetRunId. |
| B6 | **Fleet runs irreproducible; PDF asserts otherwise** — non-deterministic subset, exclusions unpersisted, paramSnapshot is a pointer to mutable model config, weightSetHash omits user-type weights/pre-filters, appendix prints the wrong formula. *(Auditor, Exec, Domain)* | Snapshot the resolved model bundle, persist per-bridge exclusions, extend the hash basis, block in-place edits of Active models, branch the PDF appendix on formulaVersion. |
| B7 | **User-type axis math is not TfNSW** — weighted-mean factor is anti-monotone (more customer types lowers priority), AT 0.5 weighting self-cancels, Over/Under is dead code so Under rows hit every bridge. *(Domain, IT)* | Per-type additive scoring with monotone normalisation; apply weighting outside the denominator; derive and pass overUnder; golden-vector tests. |
| B8 | **BHI misappropriates the calculator** — its four methodology tabs used as transport-mode weights (rail scored with NHVR load-rating weights), joints/railings bucketed into superstructure at ~3x weight, env factors hardcoded. *(Domain, Exec)* | Move weights/buckets/env to governed config; map joints→bearings; source defensible rail/ped weights or label BSI road-only. |
| B9 | **CSV seeds own admin-writable Model Builder tables** — `include_filter: []` means redeploy deletes admin-authored models/weights/rules; the codebase documents this exact trap elsewhere and avoids it. *(IT)* | Switch to the existing idempotent insert-if-missing pattern (ensurePackAttributes) or include_filter keyed to seed UUIDs. |
| B10 | **New UI surfaces below shipped standard** — bhi-explorer: 18+ hardcoded English strings (locked rule 6), no busy state, toast-only errors, blank empty states, silent 500-bridge picker cap; report tile/Runs view default to superseded runs unsorted (double-counting in FE and SAC). *(UIUX, Exec, Auditor)* | i18n pass + busy/IllustratedMessage/noDataText; default SelectionVariant (active eq true) + PresentationVariant (fleetRank) on /Runs; filter or rename the Runs fact view. |

### Improvements (8)

| # | Gap | One-line fix |
|---|---|---|
| I1 | Zero tests on every new service surface (scoreFleet, computeBhi, bhiDetail, dataReadiness, analytics service, RBAC OR-semantics) — the root cause of B1 shipping. | Add a service-level suite using the existing rbac-matrix pattern; make it a release gate. |
| I2 | Condition double-counted in NSW-PACK-V1 (conditionRating feeds both BHI criterion and derived likelihood; ~5.0 weight on one field) + three unreconciled condition-health numbers + band-scale mismatch trap on rebinding. | Rename/document the layering or drop the fallback; run computeBhi inside scoreFleet; validate band ranges against binding scale. |
| I3 | Confidence/utFactor break normalisation: stale data *lowers* priority (anti-conservative), scores can exceed 100. | Scale the denominator by the same factors (or flag instead of multiply); clamp 0–100; add stale-data monotonicity tests. |
| I4 | ConditionByMode unanchored: averages over an unknown computed subset, no coverage/as-at columns, computeBhi silent 1000 cap, BHI age drifts annually with no version stamp. | Add withBhi count + bhiComputedAt range; page past 1000; version the BHI coefficients. |
| I5 | dataReadiness presents a 500-bridge sample as portfolio readiness, callable by any view user. | Page the full fleet or label the sample; add explicit @requires. |
| I6 | FE report: hardcoded annotation labels, no ObjectPage (rich audit fields unreachable), no currency annotations, raw-UUID filters, 'analytical' archetype with no chart. | i18n keys, ObjectPage target, @Measures.ISOCurrency, ValueLists, BandSummary facet. |
| I7 | Model Builder is edit-only: no create/copy/add-row, toast-based validation with full reload, raw policy codes, no weight-sum feedback. | Add create/copy flows, inline valueState validation, i18n labels, live weight-sum indicator. |
| I8 | WCAG: labels not associated (labelFor missing in both new apps), band semantics colour-only outside the Priority tile. | Add labelFor/ariaLabelledBy; render the band word next to every coloured gauge/row. |

### Polish (3)

| # | Gap | One-line fix |
|---|---|---|
| P1 | COND_TREND band gaps turn measured data into "missing"; userTypeBreakdown column promised but never written. | Half-open shared band boundaries + write-time coverage validation; populate or drop the column. |
| P2 | Doctrine docs stale: schema comment and risk-crosswalk still say POSTING "never enters the score". | Record the POSTING-in-score decision or zero its weight. |
| P3 | Switch blank customText, phone:false on bhi-explorer, raw ISO timestamp in sign-off line. | Defaults back, enable phone or document, DateTime type with i18n pattern. |

## 3. Honest overall verdict

**Not top-1% — a regression from the prior closure.** The prior review ended "top-1% with residual gaps after remediation"; that certified core *held under re-attack* (all 13 prior gaps still closed, atomic supersession and override enforcement intact, 200/200 tests green, seeds internally clean, additive discipline preserved). But all five lenses independently return not-top-1% on the v3.11–3.12 increment, and they converge on the same diagnosis: the new fleet-scoring/BHI/user-type/analytics layer was shipped with **zero service-level tests**, and it shows — the flagship action throws a ReferenceError on its first statement (confirmed live by two lenses, present in the deploy artifact), the domain math diverges from the TfNSW and calculator methods it cites, and the deployment model will destroy admin data. The signed exec PDF now makes claims (byte-identical reproducibility, restriction-flag doctrine, methodology formula) that the stored fleet runs falsify. This is not residual-gap territory; it is an unfinished feature presented as done. The fix surface is narrow — ~10 blockers, several one-liners — but until B1–B10 land with tests, the system as a whole sits below its previously certified bar.

## 4. For the product owner

- **The new fleet-scoring feature has never worked.** Every invocation crashes on a one-line coding error; nothing in the UI calls it and no test covers it, which is the only reason it shipped. The fix is trivial — the process gap it exposes is not.
- **Even once it runs, don't show the fleet ranking to anyone yet.** It scores an arbitrary slice of the fleet (not all 11,850 bridges), quietly deletes engineers' manual assessments, and presents data-only scores with made-up fields ("Strategy: Maintain", "Restrictions: No") as if a person assessed them.
- **A routine redeploy will wipe any prioritisation model your admins build.** The seed files take ownership of those database tables. This must be fixed before anyone authors real configuration in the Model Builder.
- **Two headline methodologies wouldn't survive an external review.** The customer-type weighting can *lower* a bridge's priority when it serves more user groups (the opposite of the TfNSW intent), and rail/pedestrian bridge health is computed with weight sets the source calculator never intended for those modes.
- **The good news: everything from the last review still holds** — audit trail, immutable runs, the PDF report, all 200 existing tests. The damage is confined to the new increment. Budget one focused remediation pass (the ~10 blockers above plus a test suite for the new services) and re-run this council before the fleet-ranking story goes near a board pack.