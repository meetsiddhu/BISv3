# Bridge Risk Prioritisation — Methodology & Scope

> Status: **Triage + planning model (Phase 4).** Defensible for inspection
> prioritisation and indicative capital planning. Not a substitute for a project-level
> structural assessment. Addresses council findings RISK-2/3/4/5.

## 1. Model

Risk is a **consequence × likelihood** model, config-driven via `RiskConfig`.

```
score = consequence (1–5) × likelihood (1–5) × 4        # → 4..100
priority = band(score)                                   # RiskBand thresholds
```

### Consequence (1–5)
Weighted sum, clamped to 1–5 (all weights in `RiskConfig`, editable by admins):

| Factor | RiskConfig key | Default weight | Source |
|---|---|---|---|
| Importance level | `consequence_importance` | 1.0 | `Bridges.importanceLevel` (NSW 1–4) |
| High-priority asset | `consequence_priority` | 1.0 | `Bridges.highPriorityAsset` |
| Heavy traffic (>10k AADT) | `consequence_traffic` | 0.5 | `Bridges.averageDailyTraffic` |
| Transport-mode criticality | `mode_<Mode>` | Rail/LightRail 1.0, else 0 | `Bridges.transportMode` |

Mode criticality reflects that a rail / light-rail corridor carries higher network
consequence than an equivalent local road (multi-modal requirement R2).

### Likelihood (1–5)
The worse of condition- and structural-derived likelihood, each weighted
(`likelihood_condition`, `likelihood_structural`). Derived from the inspection ratings:
`ceil((11 − rating) / 2)` on the legacy 1–10 condition scale (10 = best).

### The ×4 multiplier and bands
The raw `consequence × likelihood` is 1–25. It is multiplied by **4** purely to **rescale
to a 0–100 index** that is intuitive for non-engineers and aligns the band cut-offs with a
percentage mental model. The multiplier carries no physical meaning; it is a presentation
scalar. Bands (`RiskBand`, with an auditable `rationale` per row):

| Band | Score (0–100) | Raw c×l | Rationale (summary) |
|---|---|---|---|
| Very High | ≥ 60 | ≥ 15 | High consequence AND high likelihood — immediate attention |
| High | 36–59 | 9–14 | Elevated on at least one axis |
| Medium | 16–35 | 4–8 | Monitor; routine intervention |
| Low | 0–15 | 1–3 | Within tolerance |

These thresholds are an **engineering-judgement starting point**, recorded in
`RiskBand.rationale` and changeable by admins; they should be calibrated against NSW/TfNSW
Bridge Inspection Manual outcomes and historical defect data before formal capital sign-off.

## 2. Engineer override
Any bridge may be overridden (`riskOverride`) with a mandatory `riskOverrideReason`,
audited via `riskAssessedAt/By`. Override sets consequence/likelihood directly.

## 3. Capital-planning extension (RISK-2/RISK-4) — assumption-flagged

These are **planning heuristics, not actuarial models**, and are deliberately NOT folded
into the core `score` (to avoid implying false precision). They are surfaced as advisory
columns in the Bridge Risk worklist.

- **Estimated RUL** (`estimatedRulYears`) = `(conditionRating − 1) / degradationRatePerYear`,
  where the degradation rate is an explicit **assumption** held per `AssetClassStrategy`.
- **Expected value** (`expectedValueAud`) = `P(likelihood) × likelyFailureCostAud`, where
  `P` is a transparent linear proxy `{1:0.01, 2:0.03, 3:0.08, 4:0.18, 5:0.35}` (annual
  failure-probability per likelihood band). With `mitigationCostAud` and
  `riskReductionPct`, this supports an indicative "spend now vs. expected loss" comparison.

Any use of these for a funding decision must state the assumptions (degradation rate,
probability proxy) explicitly.

## 3a. Likelihood→probability derivation & sensitivity (RISK-R4)

The `LIKELIHOOD_TO_ANNUAL_PROB` map `{1:0.01, 2:0.03, 3:0.08, 4:0.18, 5:0.35}` is a
**deliberately conservative, monotonic geometric-ish progression** chosen so each
likelihood band roughly ~doubles the annual failure probability of the one below it,
anchored at a 1% floor (band 1) and a 35% ceiling (band 5). It is a **planning proxy, not
an actuarial hazard rate** — calibrate against NSW/TfNSW historical defect-to-failure data
before any funding decision.

**Sensitivity:** expected value scales linearly with both the probability proxy and
`likelyFailureCostAud`, so a ±1 likelihood-band error moves EV by roughly the band ratio
(e.g. band 3→4 ≈ 2.25×). Decision-makers should therefore treat EV rankings as **ordinal**
(which assets to fund first), not as precise dollar forecasts, and run a band-up/band-down
what-if before committing capital. The proxy is intended to be overridable: any future
`RiskConfig` factor `prob_<band>` can replace these constants without code change.

## 3b. Band calibration governance (RISK-R3)
Each `RiskBand` row carries `rationale`, `reviewedBy`, `reviewedAt` and `reviewSource` so
the threshold's justification, sign-off owner, review date and evidence reference are
auditable. Re-calibration is an admin edit + `recalcRisk`, captured in the ChangeLog.

## 4. Governance
- All weights, bands and rationale are config-driven (`RiskConfig`, `RiskBand`) — no
  hardcoded thresholds in code (CLAUDE.md rule 4). The engine lives in `srv/lib/risk.js`
  and is unit-tested.
- `recalcRisk` re-scores the whole register on demand after weight/band edits.
