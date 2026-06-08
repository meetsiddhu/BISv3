# Consolidated Council Review — Bridge Prioritisation Module

*Chair synthesis of 5 lens scorecards. Verdicts are not averaged — a module that is excellent on infrastructure but fails the user and the board does not get a pass.*

---

## 1. Per-lens scorecards

| Lens | Verdict | # blocks-top-1% | One-line |
|------|---------|:---:|----------|
| **Domain** (asset mgmt / ISO 55000 / NSW practice) | top-1%-with-residual-gaps | 3 | Gets the hardest methodology calls right (restriction-as-flag, single criticality, network counted once, reproducible runs), but stands up a **second risk score** over the same fleet without reconciling to the BIS risk engine, ships criticality dimensions with **no rubric anchors**, and **falsely claims load rating drives likelihood**. |
| **IT / Architecture** (CAP / clean-core / security) | top-1%-with-residual-gaps | 2 | Engine, schema, write-guards and EAM clean-core are genuinely top-tier and tested — but the **actually-served launchpad file (`app/router/fiori-apps.html`) is a stale inline copy** that omits the Prioritisation tile and shows deleted ones, across **four divergent config sources**, blocking the module from appearing in prod. |
| **UI/UX** (Fiori / WCAG / interaction) | **not-top-1%** | 3 | Nails immutable-run / band-primary / constrained-matrix on paper, but drops the spec-mandated **rubric descriptors** (assessor can't know what "Safety = 4" means), the matrix has **no grid semantics / colour-only severity**, and there are **zero loading/error states**. |
| **C-level** (board / Treasury defensibility) | **not-top-1%** | 3 | Methodologically honest and audit-strong, but fails the single most important exec question — **"what does the top decile cost?"** — the approved **$8.4m budget line was silently dropped** and replaced with a unitless "Top score", and there is **no decision-owner / sign-off**. |
| **End users** (engineer / planner / auditor) | **not-top-1%** | 3 | The assess→formula-inspector loop is strong and runs are reproducible *in the database*, but **the auditor cannot open a single past run** (detail screen dropped), **`supersededBy` is dead code** so the worklist double-counts re-assessed bridges, and the "reproducible" PDF **prints live config, not each run's snapshot**. |

**Tally: 14 blocks-top-1% findings across 5 lenses (several are the same root defect seen from different seats).**

---

## 2. Cross-lens reconciliation

Five genuine tensions surfaced. Each is resolved with a decision and the named trade-off.

### (a) Domain rigour vs UX simplicity — 5 dimensions + constrained matrix vs assessor speed
**There is no real tension here — and that is the finding.** The domain lens *praises* the 5-dimension criticality + constrained matrix as methodologically correct; the UX lens does **not** object to the *number* of inputs. Both lenses converge on the **same** root cause: the inputs ship as **bare integers 1–5 with no rubric anchors**, which the approved spec mandated **three times** (`CLAUDE-CODE-PROMPT` lines 31–32, 56, 67). Domain calls it "unanchored opinion"; UX calls it "cannot complete without training." 
**Decision:** The rigour is *correct*; the usability *failure is the missing anchors, not the complexity*. Add config-driven rubric descriptors per dimension per level (versioned in `PrioritisationConfig`, surfaced as tooltip + inline help). 
**Named trade-off:** None worth taking — rubrics make the model *both* more rigorous (repeatable scoring) *and* more usable (self-explanatory). Shipping without them sacrifices both. This is a defect, not a scope choice.

### (b) Exec headline vs engineer detail — must be plain yet reconcile exactly
**Reconciliation-by-construction is achieved; the plain-language story is not.** All lenses agree exec and engineer views bind to the same immutable run and reconcile exactly (a genuine strength). But the C-level lens shows the exec headline is plain to the point of being **empty of the financial answer** ("Top score", no dollars, no condition, no coverage denominator), while the end-user lens shows the engineer detail is **so thin it cannot explain itself** (no per-run decomposition, no formula on a saved row). 
**Decision:** Keep the shared-run binding (it is the right architecture). Enrich *both ends*: restore the **$ top-decile budget line + coverage denominator** on the exec page, and add a **per-run detail/decomposition screen** for the engineer/auditor. 
**Named trade-off:** Plain-vs-precise is a false choice here — the page is currently *neither* precise enough for Treasury nor rich enough for the engineer. The fix adds information to both without breaking reconciliation.

### (c) Clean-core / additive discipline vs delivery speed — each shortcut: debt or defect?
The architecture lens confirms clean-core is **genuinely intact and server-enforced** (no shortcut taken there). The speed shortcuts that *were* taken sort cleanly:

| Shortcut | Verdict | Why |
|---|---|---|
| Client re-implements scoring engine for live preview (`App.controller.js:97-118`) | **Debt** | Server remains authoritative on save; risk is silent drift. Acceptable *with* a contract test asserting client≡server. |
| `paramSnapshot` stored but never replayed | **Debt** | Reproducibility currently rests on frozen output columns, which is sound; the snapshot is an unverified audit artifact. Add a replay test. |
| Browser print-to-PDF instead of server-rendered | **Debt** | MVP-acceptable *if recorded*; reputationally fragile for external submission. |
| Served `fiori-apps.html` is a stale inline copy omitting the tile | **DEFECT** | The module **does not appear in production**. This is not speed-vs-debt; the feature is invisible. |
| `supersededBy` correction trail unimplemented | **DEFECT** | Worklist and C-level counts are **wrong** (double-counting re-assessed bridges). Contradicts the team's own CDS comment and PREMORTEM claim. |

**Decision:** The two DEFECTs are blocking and must be fixed before any top-1% claim. The four debts are acceptable *only if each is explicitly recorded and test-guarded* — the danger is that the launchpad and supersededBy items were *believed done* (PREMORTEM asserts both), which is worse than known debt.

### (d) Domain completeness vs MVP scope — rail / scenario / deterioration / outbound deferrals
**Mostly defensible deferrals, with one hole.** Deferring EAM-outbound (queued local `EamWorkRequest`), XSUAA scope, scenario modelling and deterioration curves is **defensible MVP scope** and the architecture preserves the seam to add them. The domain lens treats the absent TfNSW inspection-level / BHI / NHVR-scheme structure as *advisory metadata* (improvement, not blocking) — acceptable. 
**The hole:** the C-level lens shows the **$8.4m budget line was an *approved, board-facing requirement* that was dropped *without a recorded decision*** — it is absent from the PREMORTEM "Deferred (per approved spec)" list. 
**Decision:** Deferrals are fine *when recorded*. The budget line is **not a defensible deferral** because (i) it was approved, (ii) it answers the single most important C-level question, and (iii) its omission was invisible. Restore it, or record an explicit product-owner decision with rationale. 
**Named trade-off:** Silent deviation from an approved design is itself a governance defect, independent of the merits of the feature.

### (e) Defensibility vs usability — mandatory rationale / confidence gates
**The balance is currently tilted *too far toward silent permissiveness* — the opposite of the usual tension.** Three lenses independently flag the **same gap**: the risk engine *requires* a mandatory override reason, but the prioritisation override does **not** (`prioritisation-service.js:107`, optional reason, controller sends `null`). Domain, UX and end-user all call this out. Separately, missing-data **neutral defaults (3)** silently fabricate mid-range scores indistinguishable from real assessments. 
**Decision:** Tighten the gates — they currently cost defensibility *without* buying usability. Make `likelihoodOverrideReason` **mandatory when likelihood ≠ derived** (server-rejected), and stamp a **judgement-completeness indicator** so a defaulted score is never mistaken for an assessed one. 
**Named trade-off:** One mandatory free-text field on override and a completeness badge add trivial friction; the audit defensibility gained is large. The balance is wrong in the *safe* direction to fix.

---

## 3. Consolidated verdict

**Per-lens:**
- **Domain — top-1% with residual gaps.** The methodology backbone is genuinely chartered-engineer-grade. But three blocking gaps (dual unreconciled risk engines, no rubric anchors, false load-rating provenance) are things an auditor challenges *before signing*, so it is not yet clear.
- **IT/Architecture — top-1% with residual gaps.** Engine, schema, write-guards, clean-core and reproducibility are top-tier. The launchpad-config mess (served stale file omits the tile) is a *deployment defect* that, once fixed, leaves a genuinely top-1% backend.
- **UI/UX — not top-1%.** Misses the no-training bar outright (no rubrics), fails WCAG on the matrix (colour-only severity, no grid semantics), and has no loading/error states. Strong bones, unfinished surface.
- **C-level — not top-1%.** Not yet Treasury-defensible without a briefing: no dollars, no coverage denominator, no named accountable owner. Audit-honest but financially silent.
- **End users — not top-1%.** Fails the auditor's core need (open one past run with frozen inputs) and the planner's trust need (correct, de-duplicated counts).

**Overall: NOT YET TOP-1%. This is the honest answer, and stating it plainly is the success of this review.**

The module is **architecturally excellent and methodologically serious** — the hardest, most-often-botched calls (restriction-as-flag, single criticality, network counted once, immutable reproducible runs, clean-core EAM) are *right*, and that is rare. But "top-1%" is judged at the seams where a chartered engineer, an auditor, a board reader and a working assessor actually press, and it fails at **all four** of those seams today:

1. **It will not render in production** (served launchpad file omits the tile).
2. **Its numbers are wrong** where bridges have been re-assessed (`supersededBy` dead → double-counting).
3. **It cannot be defended to Treasury** (no dollar figure, no sign-off).
4. **It cannot be audited per-run** (no detail screen; the "reproducible" PDF prints live config).

Two of the team's own remediation claims (PREMORTEM: launchpad tile verified live; corrections create superseding runs) are **contradicted by the shipped artifacts**. That gap between believed-state and actual-state is the single most important thing to fix culturally, beyond any individual line of code.

---

## 4. Gap-closure roadmap

All gaps deduped and ordered. Lens key: **D**=Domain, **A**=Architecture, **U**=UI/UX, **C**=C-level, **E**=End-user.

### BLOCKS TOP-1% (must fix before any top-1% claim)

| # | Gap | One-line fix | Lens |
|---|-----|--------------|------|
| 1 | Served `fiori-apps.html` is a stale inline copy — tile won't render in prod, shows deleted reports | Make `app/router/fiori-apps.html` fetch `/launchpad/config` (role-aware `srv/launchpad.js`); delete inline copy; re-run smoke test against the **router URL** | A |
| 2 | Four divergent launchpad-config sources | Collapse to ONE (`buildSandboxConfig()`); generate static copies in build; add CI check that fails on divergence | A |
| 3 | No rubric descriptors on criticality dimensions (spec-mandated ×3) | Add config-driven rubric anchor text per dimension per level, versioned in `PrioritisationConfig`, shown as tooltip + inline help | D, U |
| 4 | `supersededBy` dead code → worklist & exec counts double-count re-assessed bridges | On CREATE for a bridge with an active run, stamp prior `supersededBy` + `active:false` (or query latest-per-bridge); add a two-run test | E |
| 5 | Two unreconciled risk engines score the same fleet | Either feed prioritisation likelihood/consequence from the existing risk engine, or publish a worked crosswalk in `METHODOLOGY.md` | D |
| 6 | False likelihood provenance — UI says "condition + load rating" but load rating never enters `deriveLikelihood` | Either fold a load-rating band into `deriveLikelihood`, or correct the hint and show load rating as a separate capacity-regime fact | D |
| 7 | Auditor cannot open a single past run with its frozen inputs (detail screen dropped) | Add a run-detail page binding ONE `PrioritisationAssessment`: 5 dims, likelihood, override reason, `assessedBy/At`, methodology from **that run's** `paramSnapshot` | E |
| 8 | Exec PDF "reproducible appendix" prints LIVE config, not each run's snapshot | Drive the appendix from the runs' stored `configVersion`/`paramSnapshot`; warn if the displayed set is mixed | E |
| 9 | $8.4m top-decile budget line silently dropped; replaced by unitless "Top score" | Aggregate top-decile mitigation cost server-side (`likelyFailureCostAud`/`mitigationCostAud` exist); restore $ KPI + dollar headline with coverage note | C |
| 10 | No decision-owner / sign-off on the board artefact | Add governance footer: Prepared by / as-at, methodology owner + config version, Endorsed by / date | C |
| 11 | Headline omits 2 of 4 C-level questions (condition, value) | Extend headline/KPI strip to portfolio value, % in CS4–5, % P1/P2, top-decile cost | C |
| 12 | Risk matrix: no grid semantics + colour-only severity | Add `role=grid`/ARIA + arrow-key nav (or `InvisibleText` per cell stating residual/severity/L/C); add non-colour severity legend | U |
| 13 | Zero loading/error states — failures silently swallowed | Wrap loads in `setBusy`; on `.catch` show `MessageStrip`/`IllustratedMessage` distinct from empty state | U |

### IMPROVEMENT

| # | Gap | One-line fix | Lens |
|---|-----|--------------|------|
| 14 | Likelihood override has no mandatory justification | Make `likelihoodOverrideReason` mandatory when likelihood ≠ derived; reject server-side; block onSave with `valueState=Error` | D, U, E |
| 15 | Client re-implements scoring engine (drift risk) | Expose a server `computePreview` action **or** share `srv/lib/prioritisation.js` as a module; add a client≡server contract test | A |
| 16 | `paramSnapshot` stored but never replayed; no code↔`formulaVersion` guard | Add replay-from-snapshot test + frozen golden-vector test keyed to `FORMULA_VERSION` | A |
| 17 | Strategy-urgency inverts line-of-sight (Decommission 30 > Monitor 20) | Document the urgency-ladder rationale or re-order (Monitor ≥ Decommission); state the objective each strategy serves | D |
| 18 | No TfNSW inspection-level / BHI / NHVR-scheme structure | Add config-driven `inspectionLevel` codelist tied to condition; replace `nhvrAssessed` boolean with a scheme codelist (advisory) | D |
| 19 | "Assessed" KPI undercounts — no denominator | Show "Assessed N of M bridges (X% of portfolio)"; flag un-assessed remainder | C |
| 20 | Export is browser print-to-PDF, not branded/archivable | Server-side branded paginated PDF (doc id, logo, A4); track current as MVP-only | C |
| 21 | Budget-line drop was undocumented deviation | Record explicit product-owner decision in deferred list (if not restoring) | C |
| 22 | Worklist row press discards saved run, re-prefills fresh | Prefill Assess form from the existing run's stored inputs, badged "starting from run of <date> by <user>" | E |
| 23 | No way to reproduce a past ranked list as-of a date | Add an as-of date filter selecting latest run with `assessedAt ≤ date` per bridge | E |
| 24 | Formula inspector only on live form, not stored runs | Render per-run formula/decomposition on the detail screen from stored inputs + `paramSnapshot` | E |
| 25 | Pervasive hardcoded English bypasses i18n | Move all visible literals (strategy codelist, column headers, fact labels) into `i18n.properties` | U |
| 26 | Matrix drops the approved "computed consequence column" highlight | Restore a non-colour column indicator (border/`InvisibleText`) on every cell where C === tier | U |
| 27 | Confidence/freshness terse, unlabelled; "see register" dead-end | Add legend ("inputs available · condition age"); replace "see register" with the actual value or deep link; switch chip icon by state | U |

### POLISH

| # | Gap | One-line fix | Lens |
|---|-----|--------------|------|
| 28 | Missing-data neutral defaults (3) fabricate mid-range scores | Track set-vs-defaulted dims; require all five before save or stamp a judgement-completeness indicator | D |
| 29 | Client federation failures degrade silently; picker capped at $top=500 | Surface load failures via MessageStrip; show overflow note or server-side ComboBox suggestion | A |
| 30 | Override recorded but invisible in worklist/report | Add an "overridden" badge (reason on hover) in worklist/engineer rows; add overridden count to exec page | E |
| 31 | Phone unsupported; matrix/decomp use fixed rem widths | Confirm tablet breakpoints render the matrix without horizontal scroll; state phone-out-of-scope in help text if intended | U |

---

## 5. Plain-English executive summary

**What this is:** a tool that ranks the agency's bridges by how urgently they need money, so the team can build a defensible funding submission instead of arguing over a spreadsheet.

**The good news:** the engine underneath is genuinely strong. It does the hard, easy-to-get-wrong things correctly — it doesn't double-count, it treats "this bridge is restricted" as a *consequence to act on* rather than secretly inflating the score, every ranking is locked and time-stamped so you can prove later exactly how a number was produced, and it never quietly reaches into the core asset system. An experienced engineer and an auditor would respect the foundations.

**The problem, in one sentence:** it isn't finished where real people touch it.

- **For the boss / Treasury reader:** the page does not answer the one question that matters most — *"what will it cost to fix the worst ones?"* The dollar figure that the approved design called for ($8.4m) was dropped and replaced with a meaningless 0–100 "score". There's also no named person who signed off on it. As it stands, you could not hand this to a board without explaining it first.
- **For the engineer / auditor:** you cannot click a past assessment and see what was actually entered and why — that screen was left out. And when a bridge is assessed twice, the old one isn't retired, so the list shows it **twice** and the headline counts are wrong.
- **For IT:** the version of the menu page that actually goes live is an old, hand-copied one — so the new tile **wouldn't even appear** in production, and some deleted reports still would. The team believed this was already fixed; it isn't.
- **For the assessor:** when scoring a bridge from 1 to 5 on things like "safety", there's no on-screen guide telling them what a "4" means — so two people would score the same bridge differently, and a newcomer would need training the tool was supposed to make unnecessary.

**Bottom line:** This is a strong, serious, well-built module that is **not yet top-1%** — and that's an honest verdict, not a failing grade. The foundations are excellent; the finishing work that makes it trustworthy to a board, reproducible for an auditor, usable by a new assessor, and visible in production is incomplete. Fix the 13 blocking items above — starting with making the tile appear, stopping the double-counting, putting the dollar figure back, and adding the scoring guidance — and it has a credible path to top-1% on every lens.

**Relevant files** (all absolute):
- `/Users/siddharthaampolu/46 Bridge info system V3/srv/lib/prioritisation.js` — scoring engine
- `/Users/siddharthaampolu/46 Bridge info system V3/srv/lib/risk.js` — the parallel risk engine to reconcile
- `/Users/siddharthaampolu/46 Bridge info system V3/srv/prioritisation-service.js` — write-guards, `supersededBy` gap, `paramSnapshot`
- `/Users/siddharthaampolu/46 Bridge info system V3/db/schema.cds` — assessment + cost fields
- `/Users/siddharthaampolu/46 Bridge info system V3/app/router/fiori-apps.html` — stale served launchpad (blocking)
- `/Users/siddharthaampolu/46 Bridge info system V3/srv/launchpad.js` — the correct role-aware config source
- `/Users/siddharthaampolu/46 Bridge info system V3/app/prioritisation/webapp/controller/App.controller.js` — UI gaps (rubrics, matrix, loading states, exec headline, client math)
- `/Users/siddharthaampolu/46 Bridge info system V3/app/prioritisation/webapp/i18n/i18n.properties` — missing rubric keys + hardcoded strings
- `/Users/siddharthaampolu/46 Bridge info system V3/docs/prioritisation/prioritisation-wireframe.html` — the approved design ($8.4m line, run-detail screen) the build deviated from
- `/Users/siddharthaampolu/46 Bridge info system V3/docs/prioritisation/PREMORTEM-prioritisation-module.md` — contains the two contradicted remediation claims
---

## Reviewer's note — one finding empirically corrected (post-review)

**Roadmap item #1 ("served `fiori-apps.html` is stale → tile won't render in production") — the
CONCLUSION is empirically FALSE; the underlying concern is valid.**

The Bridge Prioritisation tile **was live-verified in production** (v3.9.28/29): it appears in the
OPERATIONS group, opens, and the full Worklist → Assess (federated prefill + constrained matrix +
formula inspector) → Save (server-computed immutable run) → Reports flow works, with the gold
Restrictions tile intact. The ushell sandbox bootstrap fetches `/appconfig/fioriSandboxConfig.json`
(the file that *was* updated, both copies) which **overrides** the stale inline `tileConfig` in
`fiori-apps.html` — proven earlier when a prior release's REPORTS group appeared live from a commit
that touched only `fioriSandboxConfig.json`. So the tile is NOT invisible in prod.

**What IS valid (keep on the roadmap):** roadmap item #2 — there are **multiple divergent launchpad
config sources** (`fioriSandboxConfig.json` ×2 authoritative, the stale inline `fiori-apps.html`
`tileConfig`, and `launchpad.js`). That divergence is real maintainability **debt** and a latent
trap, and collapsing to a single generated source + a CI divergence check remains a worthwhile fix.
The severity drops from **blocks-top-1% (invisible feature)** to **improvement (config debt)**.

All other 12 blocking findings stand and are accepted as valid (rubric anchors, `supersededBy`
double-count, dual risk engines, false likelihood provenance, no per-run audit/detail screen, PDF
prints live config not the run snapshot, dropped $ top-decile cost, no sign-off, headline coverage,
matrix grid/ARIA semantics, loading/error states, mandatory override reason).

---

## Closure status — v3.9.30 (remediation deployed + live-verified)

All 13 roadmap "blocks-top-1%" items resolved (#1 was empirically false — the tile renders in prod).

| # | Gap | Resolution | Verified |
|---|-----|-----------|----------|
| 1 | "tile won't render in prod" | FALSE — fioriSandboxConfig overrides the inline copy | live (tile renders) |
| 2 | 4 divergent launchpad configs | fiori-apps.html inline regenerated byte-equal to fioriSandboxConfig.json + CI guard test | test |
| 3 | No rubric anchors | per-dimension per-level descriptors on screen (config-overridable) | live ("3 = Serious injury credible" …) |
| 4 | supersededBy double-count | new run supersedes prior active run for the bridge (+ChangeLog) | test + live (one row) |
| 5 | Two unreconciled risk engines | METHODOLOGY-risk-crosswalk.md (shared signal, no double-count) | doc |
| 6 | False load-rating provenance | hint corrected (condition + structural); load shown as separate fact | live |
| 7 | No per-run audit detail | run-detail dialog: frozen inputs + assessedBy/at + methodology from THAT run's snapshot | live (dialog opened) |
| 8 | PDF printed live config | appendix driven by runs' versions + mixed-version warning | code/test |
| 9 | $ top-decile cost dropped | cost snapshot per run + Top-decile $ KPI + headline | live (KPI + test) |
| 10 | No sign-off | governance footer (prepared/as-at, methodology owner, version, endorsed-by) | live |
| 11 | Headline omits coverage | "assessed N of M · X% of portfolio" denominator | live |
| 12 | Matrix colour-only severity | per-cell aria (L×C×residual×severity) + non-colour severity legend | live (legend) |
| 13 | No loading/error states | busy + error MessageStrip on worklist load | code |
| 14 | Override needs no reason | server rejects override w/o reason + client block | test |

Improvements/polish from the roadmap remain as a tracked backlog (TfNSW inspection-level codelist,
as-of-date list reproduction, server-rendered branded PDF, client≡server contract test,
strategy-urgency ladder rationale). Verify: 17 suites / 163 tests; eslint 0/0; deployed v3.9.30.
