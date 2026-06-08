# Claude Code Master Prompt — Build the Approved Prioritisation Design into BIS

> The interaction model is **approved**. The runnable reference is
> `docs/prioritisation-wireframe.html` — open it; the built UI must match its behaviour.
> Build it as a **bounded module + tile inside the BIS CAP project** (settled). No application
> code, schema, data, or git change until I approve Phase 0.

```
BIS_APP_PATH    = /Users/siddharthaampolu/46 Bridge info system V3
WIREFRAME_REF   = docs/prioritisation-wireframe.html   # approved interaction — the acceptance reference
```

## Placement & data (settled)

Same BIS CAP project and launchpad; own service (`PrioritisationService`), own UI5 app + tile,
own XSUAA scopes, own schema namespace section, behind a **feature flag** — a modular monolith.
**Risk and criticality live in the BIS schema** (single home). Restrictions and the EAM
reference shadow are read **in-process**. EAM is federated **read-only** for register + condition;
work requests are pushed back to EAM **via API**. **Never modify EAM.**

## The approved design — build to this exactly

Three screens in one UI5 app/tile (`WIREFRAME_REF` is the source of truth for behaviour):

1. **Worklist** — ranked list; **band chip is the primary signal**, numeric score the secondary;
   a **confidence/freshness** indicator per row ("4 of 5 · 8 mo"); row click opens Assess.
2. **Assess** — the hero screen:
   - Federated facts (register, condition, load rating, restriction) shown **read-only with
     provenance + as-at**; a header **confidence/freshness chip**. The user enters only judgement.
   - **Five criticality dimensions** (safety, network-service, financial, environmental,
     reputational) as 1–5 segmented selectors **with rubric descriptors**; criticality + tier
     **computed live**.
   - **Likelihood** 1–5 segmented; derived default shown, **override logged**.
   - **Constrained risk matrix** — likelihood is selectable; the **consequence column is the
     computed criticality tier**; clicking a cell sets **likelihood only**. The matrix can never
     be used to set a consequence that contradicts the criticality framework — to move the
     column, change the dimensions. The active cell (likelihood × tier) is highlighted.
   - Strategy selector; **live priority score + band**; a **decomposition** of the three weighted
     contributions; a **formula inspector** showing the substituted expression.
3. **Reports** — **C-level one-pager** (portfolio KPIs, band distribution, plain-language
   headline, budget line, stale-input count, PDF export, methodology appendix) and
   **ground-engineer detail** (per-asset inputs with freshness, decomposition, formula, EAM link),
   toggled — both rendered from the **same immutable run** so the numbers reconcile.

## Computation (exact behaviour; all parameters in AppConfig)

```
criticality = Σ(dimension × weight)              → tier = round(criticality), 1..5
residual    = likelihood × consequence(tier)     [restriction is a FLAG, never in the score]
riskN  = residual / maxResidual × 100
critN  = criticality / maxCriticality × 100
stratN = strategy-urgency value (0..100)
priorityScore = wRisk·riskN + wCrit·critN + wStrat·stratN     (weights normalised to sum 1)
band   = threshold lookup (P1 highest .. P5)
```
Wireframe defaults (move ALL to AppConfig, do not hardcode): dimension weights
.35/.25/.15/.10/.15; wRisk/wCrit/wStrat .4/.4/.2; maxResidual 25; maxCriticality 5; strategy
urgency Renew 80 / Maintain 50 / Decommission 30 / Monitor 20; bands 80/60/40/20. **Stamp the
formula + weight version on every run** so any past list is reproducible. Network importance
enters once, inside criticality.

## Non-negotiables

Additive/clean schema · soft-delete · **annotation-first UI5 / Fiori Elements** — use freestyle
controls only where the wireframe genuinely needs them (the constrained risk matrix, the
segmented dimension/likelihood selectors, the formula inspector) and justify each · zero
hardcoding via AppConfig/code lists (weights, rubric descriptors, thresholds) · ChangeLog on
every CUD (match BIS's mechanism) · XSUAA-first by visibility · i18n · GDA2020 · keep the
**Restrictions gold tile** untouched · **never modify EAM** · module stays bounded.

## UX-fidelity acceptance (must match the wireframe)

- Worklist leads with the band, not the number; every score carries confidence + freshness.
- The risk matrix is part-input (likelihood) / part-output (consequence) and **cannot** override criticality.
- The formula inspector shows the live substituted values, not a static formula.
- Exec and engineer reports come from one immutable run and reconcile to the same figures.
- No colour-only meaning anywhere (WCAG 2.1 AA); bands carry label + number.

## Gated delivery — analyse before any code, STOP at every gate

**Absolute rule:** no application change until I approve Phase 0; never write code in the same
turn as analysis; never batch phases.

- **Phase 0 — Analysis, recommendation & Fiori translation (READ-ONLY).** Open `WIREFRAME_REF`
  and inspect BIS: where the module slots in (namespace, service pattern, launchpad/tile
  registration, AppConfig, ChangeLog, scopes, UI5 conventions, theme), which restriction
  entities + EAM reference shadow it reads in-process, and the EAM federation surface for
  register/condition. **STOP — deliver:** current-state + integration summary; a **Fiori
  translation plan** mapping each approved screen/interaction to concrete UI5 controls (Fiori
  Elements where possible; named freestyle controls where the matrix/selectors require it);
  recommended scope MVP vs later; and any deviation from the wireframe, justified. Only files
  you may create: this write-up. Wait.
- **Phase 1 — Schema + AppConfig** (criticality, risk, immutable runs; weights/rubrics/thresholds seeded). `cds build`. STOP.
- **Phase 2 — Engine + immutable runs + formula transparency.** Reproducibility test (same inputs+weights → identical run). STOP.
- **Phase 3 — Assess screen** (pre-filled federated facts, segmented dimensions + rubric, likelihood with logged override, **constrained risk matrix**, live score/band/decomposition, formula inspector). Match `WIREFRAME_REF`. STOP.
- **Phase 4 — Worklist + visuals** (ranked, band-primary, confidence/freshness, matrix/portfolio views). STOP.
- **Phase 5 — Dual-audience reports** (exec PDF one-pager + engineer detail from one run). STOP.
- **Phase 6 — Outbound to EAM** (notification/work request on approval). STOP.

## Per-phase report & done

Each phase: what changed · why (tie to the approved design) · validation (`cds build`/`watch`/test)
· standards check (additive / soft-delete / no-hardcode / ChangeLog / XSUAA / i18n / WCAG /
clean-core / module-bounded) · **fidelity check vs `WIREFRAME_REF`** · open questions ·
**"STOP — awaiting approval."**

**Done:** prioritisation is a bounded tile in BIS matching the approved interaction model;
constrained matrix can't override criticality; every score reproducible from an immutable run
with versioned weights; scores show confidence + freshness; exec and engineer reports reconcile;
EAM never modified; gold tile untouched; everything additive, AppConfig-driven, feature-flagged.
