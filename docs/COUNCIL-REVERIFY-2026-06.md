# Council Re-Verification — Bridge Prioritisation (2026-06)

> Adversarial re-run confirming the 13 prior blocking gaps. Result: 23/23 scored gap instances CLOSED, 0 partial, 0 not-closed.

This is a CHAIR synthesis task over 5 lens scorecards that were provided inline. I have all the evidence I need in the prompt — no file inspection required. Let me produce the four-section markdown verdict.

## 1. Gap-closure table

| Lens | Gap id | Claim (abridged) | Status | One-line evidence |
|---|---|---|---|---|
| Domain | 3 | Rubric anchors wired end-to-end (schema `rubrics` + DEFAULT_RUBRICS + `_buildDimControls`/`_rubricFor`/`_recompute`) | CLOSED | `schema.cds:773` field + `App.controller.js:17-23,158,182-202`; config-overridable, genuinely wired not cosmetic |
| Domain | 5 | Risk-engine crosswalk doc; no double-count; restriction=treatment | CLOSED | `METHODOLOGY-risk-crosswalk.md` (49 lines); grep proves prioritisation never reads `riskScore`; `prioritisation.js:114` restriction is flag-only |
| Domain | 6 | Likelihood provenance honest (condition+structural only, not load) | CLOSED | `i18n:22` separates load rating; `deriveLikelihood` (`prioritisation.js:91-100`) takes only condition+structural; loadRating grep zero |
| Domain | 4 | `supersededBy` de-dup on CREATE | CLOSED | `prioritisation-service.js:207-225` supersedes priors; consumers filter `active:true`; test asserts one active run |
| Domain | 14 | Mandatory override reason rejected server-side | CLOSED | `prioritisation-service.js:172-177` reject 400; test confirms reject-without / accept-with reason |
| IT/Arch | 2 | Launchpad config byte-equal + CI guard | CLOSED | configs byte-identical; `flp-config.test.js:46-53` PASS |
| IT/Arch | 20 | Server-rendered PDF real, no heavy deps, access-gated | CLOSED | `pdf.js` zero require(); valid `%PDF`/xref/trailer; `@requires` gated; playwright dev-only; tests PASS |
| IT/Arch | 8 | PDF reflects runs' stored versions (mixed-version warning) | CLOSED | `prioritisation-service.js:99` versions from run stamps; reproducibility test PASS |
| IT/Arch | 13 | Worklist loading + error MessageStrip | CLOSED | `_loadWorklist:99-120` setBusy + `wl>/error`; view `App.view.xml:16` MessageStrip |
| IT/Arch | clean-core | reportPdf + EAM-outbound never write EAM master | CLOSED | reportPdf all SELECTs; raiseWorkRequest writes only local `EamWorkRequest` QUEUED; test PASS |
| UI/UX | 3 | Rubric descriptors per dim per level, config-overridable | CLOSED | `App.controller.js:17-23,156-159,182-202`; renders on first paint via onInit |
| UI/UX | 12 | Matrix per-cell aria/tooltip L×C×residual×severity + non-colour legend | CLOSED | `_buildMatrix:209-241` tooltip carries L,C,residual,SEV word; residual always visible; text legend `236-240` |
| UI/UX | 13 | Worklist busy + error MessageStrip | CLOSED | `App.view.xml:16` + `_loadWorklist:99-119` setBusy both paths |
| UI/UX | 7 | Run-detail dialog + Detail button | CLOSED | `App.view.xml:25,36` button; `onOpenRun:294-324` parses paramSnapshot, shows frozen inputs |
| UI/UX | 14 | Client blocks save on override-without-reason (valueState Error) | CLOSED | `onSave:336-362` valueState Error + return before POST; server parity `175-176` |
| C-level | 9 | $ top-decile cost KPI from run cost snapshot | CLOSED | `schema.cds:812-813`; `_buildReports:462-466`; PDF `95-96,114`; test asserts snapshot |
| C-level | 11 | Coverage denominator (assessed of total) shown | CLOSED | `App.controller.js:467-474`; PDF uses true `count(*)` `:89` |
| C-level | 10 | Governance footer on screen AND PDF | CLOSED | `App.view.xml:140-147`; PDF `127-131`; `methodologyOwner` real field `schema.cds:774` |
| C-level | 20 | Board artefact real server PDF, not browser print | CLOSED | `reportPdf` primary path `onExportPdf:369-388`; branded `brandHeader`; tests PASS |
| End-users | 7 | Auditor opens one past run, methodology from THAT run's snapshot | CLOSED | `onOpenRun:294-324` renders methodology from `paramSnapshot`; immutable; reproducibility test PASS |
| End-users | 4 | Worklist one current run per bridge via server de-dup | CLOSED | after-CREATE `194-226` UPDATE active=false + supersededBy; `$filter=active eq true` |
| End-users | 8 | PDF figures from stored immutable runs + mixed-version warning | CLOSED | reportPdf SELECTs stored runs; deterministic docId; versions warning `99,112,126,130` |
| End-users | 14 | Override requires logged reason, server-enforced | CLOSED | before-CREATE `171-177` server-derives flag; cannot be bypassed by crafted POST |

**Count: 23/23 scored gaps CLOSED. 0 PARTIAL, 0 NOT-CLOSED.** (These 23 map onto the original 13 unique blocking-gap ids — several ids, e.g. #3, #4, #7, #8, #13, #14, #20, recur across lenses.)

## 2. Per-lens verdict NOW vs prior review

| Lens | Prior verdict | Verdict NOW | Movement |
|---|---|---|---|
| Domain — ISO55000/NSW | top-1%-with-gaps | top-1%-with-residual-gaps | Holds at the bar; "gaps" downgraded to "residual" — material gaps closed, only non-blocking residuals remain. Lateral-to-slightly-up. |
| IT / Architecture | top-1%-with-gaps | top-1%-with-residual-gaps | Same as Domain — sustained, residuals only. Lateral-to-slightly-up. |
| UI/UX / WCAG | NOT-top-1% | top-1%-with-residual-gaps | **Promoted.** Rubric (#3), accessible matrix (#12), busy/error (#13), audit dialog (#7), override block (#14) all closed. Clear upward movement. |
| C-level defensibility | NOT-top-1% | top-1%-with-residual-gaps | **Promoted.** $ KPI (#9), coverage (#11), governance footer (#10), real server PDF (#20) all closed. Clear upward movement. |
| End users / auditor | NOT-top-1% | **top-1%** (clean, no residual qualifier) | **Promoted, and the only lens at unqualified top-1%.** Auditability, de-dup, reproducibility and override-logging all closed; reviewer logged no blocking residual. |

Net: 3 lenses moved up off NOT-top-1%; 2 held. All 5 are now at or above the bar.

## 3. Overall verdict

**The 13 blocking gaps are cleared.** Every one of the 23 lens-scored gap instances is CLOSED with code-grounded evidence (line refs, grep results, passing tests), not flag-only or cosmetic claims. The strongest signals: the no-double-count claim is proven by a zero-match grep (prioritisation engine never reads `riskScore`), reproducibility is proven by a passing "editing config later does NOT change frozen outputs" test, and the server PDF is proven real by structure tests with zero runtime `require()`.

**Overall: top-1%, but with an honest qualifier — top-1%-WITH-RESIDUAL-GAPS, not pristine top-1%.** Four of five lenses still carry a residual-gaps qualifier; only End users/auditor is clean. I am not rubber-stamping the unqualified "top-1%" label for the module as a whole, because two residuals are more than cosmetic:

1. **Supersession is not atomic** (Domain #4 / End-users #4 residual). The supersede runs in `after('CREATE')` (post-commit), not in the same transaction as the insert. A crash between insert and supersede can momentarily leave two active runs for a bridge — which would double-count that bridge in band counts and top-decile cost until the next assessment self-heals it. Low-probability for this workload, but it is a genuine correctness edge, not pure polish.

2. **On-screen coverage denominator can falsely read 100%** (C-level #11 residual). If the `AssessableBridges` fetch fails, `_buildReports` falls back to `rows.length`, making coverage show 100% on screen. The board PDF uses a true `count(*)` so the signed artefact is safe — but a C-level reading the live screen could be misled. The mitigation is that the authoritative artefact is correct.

Everything else is legitimately cosmetic/by-design (rubric text not frozen into the run, semantic-vs-byte FLP test, tooltip-as-aria-name, PDF nominal header label reading live config, view-tier can export). None of those would block a top-1% rating.

**Verdict: the module is defensibly top-1% for delivery and audit, conditional on acknowledging two residual correctness items.** It is not yet "no-asterisk" top-1% across all five lenses.

## 4. Remaining backlog

No PARTIAL or NOT-CLOSED gaps. Backlog is residuals/polish only, in rough priority order:

**Correctness residuals (should-fix before claiming unqualified top-1%):**
- **Atomic supersession** — move the supersede into the same transaction as the insert (or a `before`/`tx`-scoped handler) so two active runs can never coexist even on crash (Domain #4, End-users #4).
- **Coverage denominator hardening** — on `AssessableBridges` fetch failure, surface an error/unknown state rather than falling back to `rows.length`, which spuriously shows 100% on screen (C-level #11).

**Audit-completeness polish:**
- **Freeze rubric anchor text into the run + PDF** — reproduced past runs re-display numeric dims but not the rubric wording used at assess time (Domain #3).
- **Open superseded (active=false) historical runs** — auditor dialog only lists active runs; the immutable superseded record exists but isn't directly openable from the worklist (End-users #7).

**Minor / by-design (optional):**
- Likelihood override check is nested in the bridge-linked branch — a degenerate bridge-less run skips it, but has no baseline to override (Domain #14, not a real evasion vector).
- FLP guard test compares semantic JSON, not raw bytes — a reordered-key edit to the inline literal would still pass (Arch #2).
- `_loadBridges`/`_loadConfig` swallow errors silently (only the worklist has busy/error states) (Arch #13).
- Matrix cells use `tooltip` rather than explicit `ariaLabel` (functionally adequate on `sap.m.Button`) (UI/UX #12).
- PDF nominal header version label reads live config while the mixed-version warning is correctly run-derived (cosmetic) (Arch #8).
- `reportPdf` has no role-differentiated `@restrict` (view-tier can export) — matches READ-tier export design (Arch #20).
- Top-decile KPI uses `mitigationCostAud` only; `likelyFailureCostAud` is also snapshotted — defensible funding-number choice (C-level #9).
---

## Post-re-review closure — v3.9.32 (the two residual correctness items)

The re-review confirmed all 13 blocking gaps CLOSED but flagged two "should-fix before unqualified
top-1%" correctness residuals. Both are now closed:

1. **Atomic supersession** — the supersede now runs inside `before('CREATE')` (same transaction as
   the insert; new id stamped first) instead of `after`, so two active runs for a bridge can never
   coexist, even on a crash. The de-dup test still passes; the `after` handler now only audits
   (ChangeLog) the retired runs. (srv/prioritisation-service.js)
2. **Coverage denominator hardening** — if the `AssessableBridges` list fails to load, on-screen
   coverage now shows "—" (unknown) instead of falsely defaulting to 100%; the headline says
   "portfolio size unavailable". The server PDF already used a true count(*). (App.controller.js)

Remaining backlog is polish/by-design only (freeze rubric wording into the run + PDF; open
superseded historical runs from the worklist; byte-vs-semantic FLP guard; explicit ariaLabel vs
tooltip on matrix cells). Verify: 18 suites / 168 tests; eslint 0/0; deployed v3.9.32.

---

## Backlog closure — v3.9.33 (audit-completeness polish + by-design decisions)

The re-review's remaining backlog (all non-blocking) is now closed or formally accepted:

**Closed:**
- **Freeze rubric wording into each run** — `PrioritisationAssessment.rubricSnapshot` stores the
  chosen-level anchor text at assess time (engine `rubricSnapshot()`, config-overridable via
  `PrioritisationConfig.rubrics`); the run-detail dialog shows the frozen "Scoring rubric used". A
  reproduced past run now shows what each level MEANT, not just the number. +2 tests.
- **Open superseded historical runs** — the run-detail dialog has a "Run history" action listing ALL
  runs for the bridge (active + superseded, by `assessedAt`), each openable to its own frozen detail.
  The auditor can reproduce any past ranking, not only the current one.
- **Defensive override enforcement** — a run without a `bridge_ID` is now rejected (400), so the
  federated-facts + mandatory-override-reason gate can never be skipped via a degenerate POST. +test.
- **Config-load + bridge-load errors surfaced** — `_loadConfig` and `_loadBridges` now toast on
  failure instead of swallowing.
- **FLP guard strengthened** — the test now asserts BOTH serialized (key-order) and canonical
  (recursively key-sorted) equality between the inline tileConfig and the authoritative JSON.

**Accepted as by-design (recorded decisions, no change):**
- `reportPdf` is gated at READ tier (any `view` user can export) — matches the read-tier export design;
  the document contains only already-readable figures. Revisit only if export must be role-restricted.
- The exec top-decile KPI uses `mitigationCostAud` (the cost to FIX), not `likelyFailureCostAud` — the
  defensible "what will it cost to fund the worst ones" funding number. Both are snapshotted per run.
- Matrix cells convey their full meaning via `tooltip` (the accessible name on `sap.m.Button`) plus the
  always-visible residual number and the non-colour severity legend — WCAG-adequate without an extra
  InvisibleText.

Verify: 18 suites / 171 tests; eslint 0/0; cds build + --production clean. Deployed v3.9.33.
