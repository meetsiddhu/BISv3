# Methodology — Prioritisation vs the BIS Risk Engine (crosswalk)

Council gap #5: BIS now has **two** scoring engines over the same fleet. They are deliberately
**distinct in purpose and consume a shared condition signal** — they do **not** double-count.
This is the auditor/chartered-engineer crosswalk.

## The two engines

| | **Operational risk** (`srv/lib/risk.js`) | **Funding prioritisation** (`srv/lib/prioritisation.js`) |
|---|---|---|
| Question | "How risky is this asset *right now*?" | "How urgently does this asset need *capital funding*?" |
| Output | `Bridges.riskScore` (0–100) + `riskPriority` (RiskBand) | `PrioritisationAssessment.priorityScore` (0–100) + band P1–P5 |
| Consequence | derived from importance + high-priority + traffic + mode | **explicit 5-dimension criticality** (safety/network/financial/environmental/reputational), tier = round(criticality) |
| Likelihood | `ceil((11 − conditionRating)/2)` clamped 1–5 (+ structural) | **same condition signal** (`deriveLikelihood`) as a *default*, then **engineer judgement** (logged override) |
| Strategy | not a term | strategy-urgency term (Renew/Maintain/Monitor/Decommission) |
| Persistence | mutated in place on the bridge (latest state) | **immutable, versioned, append-only runs** (reproducible) |
| Owner | system-derived, recalculated fleet-wide | engineer-assessed, one current run per bridge (superseded on re-assessment) |

## Why both, and why it isn't double-counting

- **Risk** is a *continuously-maintained operational signal* (drives the risk worklist, restrictions
  context, overdue inspection flags). It is recomputed automatically when condition/config change.
- **Prioritisation** is a *point-in-time funding-case judgement*. It deliberately layers explicit
  human criticality dimensions + strategy on top of the same objective condition evidence, and
  **freezes** the result as a defensible, reproducible run for a submission.
- The **shared input** is condition/structural rating (the objective evidence). Prioritisation does
  **not** read `Bridges.riskScore` into its score (that would compound the same signal). It reads the
  raw condition fact and re-expresses likelihood, then the engineer can override (with a logged
  reason). So the two scores are correlated by construction (same evidence) but are **not** additive
  and never feed each other.

## Line-of-sight (objectives → strategy → asset decision)

`strategy` (Renew/Maintain/Monitor/Decommission) is the SAMP intervention intent; its urgency weight
(`stratN`) ties the funding score back to the asset-management objective. Criticality answers
"how much does failure matter" (consequence), likelihood answers "how likely / how degraded", and the
band answers "fund now vs monitor" — the decision the funding submission defends.

## Restriction is a TREATMENT, never a score input
An active restriction is surfaced as a **flag** on the run (`restrictionFlag`) and never enters
`residual` or `priorityScore`. It is a *consequence already being managed*, not a risk multiplier —
folding it into the score would double-count the very condition that triggered it.

## Reproducibility
Every prioritisation run stores its inputs + the exact parameter snapshot (`paramSnapshot`) +
`configVersion`/`formulaVersion`, so a past ranked list reproduces byte-identically even after the
config is re-versioned. The operational risk score is not reproducible-by-design (it tracks current
state) — which is exactly why a *separate*, frozen prioritisation run exists for funding cases.
