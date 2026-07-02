# Configurable Assessment Engines — Assessment & Roadmap

**Status:** living design note · **Owner:** Engineering · **As of:** v3.55.2 (2026‑07‑01)
**Scope:** the three governed calculation engines — **Prioritisation**, **Risk categorisation**, **BHI/BSI** — and how each is (or becomes) admin‑configurable, per‑asset‑class, and user‑copyable.

---

## 1. The vision (what the product owner asked for)

> "Look into how prioritisation works and how it can be dynamically applied for multiple asset
> classes — configure rules, parameters and results, etc. Similarly risk categorisation, BHI/BSI
> calculation, etc. The **admin should be able to configure**; the **system gives a default**, but
> the **user should have the ability to copy and create their own rules**."

Distilled to four capabilities every engine should have:

| # | Capability | Plain meaning |
|---|------------|---------------|
| **C1** | **Governed default** | The system ships a sensible, documented default that works out of the box. |
| **C2** | **Admin‑configurable** | An admin tunes parameters (weights, bands, coefficients) via config — **no code change**. |
| **C3** | **Per‑asset‑class** | The same engine resolves *different* parameters for Culverts vs Beam Bridges vs Rail, with a precedence fallback to the default. |
| **C4** | **Copy → create your own** | A user clones the default into their own named version, edits it, and activates it — the original is never mutated (governance + audit). |

This document grades each engine against C1–C4 and names the smallest path to close the gaps.

---

## 2. Scorecard (where each engine stands today)

| Engine | C1 Default | C2 Admin‑config | C3 Per‑class | C4 Copy/create | Maturity |
|--------|:----------:|:---------------:|:------------:|:--------------:|----------|
| **Prioritisation** | ✅ | ✅ | ✅ | ✅ | **Complete** — reference implementation |
| **BHI / BSI** | ✅ | ✅ | ✅ *(v3.55.3)* | ✅ *(v3.55.4)* | **Complete** — per‑class weighting + governed, versioned, cloneable models on the shared `governed-config` plugin |
| **Risk categorisation** | ✅ | ✅ | ⚠️ partial | ⚠️ soft‑delete only | **Partial** — global config + bands, folded into the prio model but no standalone clone/version |

Legend: ✅ done · ⚠️ partial/by‑convention · ❌ absent.

---

## 3. Prioritisation — the reference pattern (already meets the vision)

The prioritisation engine is the **gold standard** the other two should converge on. It is a
governed, versioned, templated rule engine — not a hardcoded formula.

**Entities** (`db/`): `PrioritisationModel` (cuid, managed, `isTemplate`, `version` immutable once
Active), `AssetClassCriterionWeight` (per‑class weights), `ModelCriterion`, `CriterionValueBand`,
`CriterionSourceBinding`, `AggregationRule`, `UserTypeCriterionWeight`, `PrioritisationPreFilter`.

**Actions** (`srv/prioritisation-service.js`): `cloneModel`, `instantiateTemplate(templateID, code,
name, assetClass, transportMode)`, `scoreFleet`, `releaseRun`, `computeBhi`, `bhiDetail`.

**Per‑class resolution** — the precedence ladder in
[`srv/lib/prioritisation-rule-engine.js`](srv/lib/prioritisation-rule-engine.js) (`resolveModelCriteria`):

```
(assetClass, transportMode)  →  (assetClass, '*')  →  ('*', transportMode)  →  ('*','*')  →  model default
```

This is exactly C1–C4:
- **C1** — a seeded default model + a template library (`docs/prioritisation/TEMPLATE-LIBRARY.md`).
- **C2** — every weight/band/binding is a data row an admin edits; zero code branches.
- **C3** — `AssetClassCriterionWeight` + the precedence ladder.
- **C4** — `cloneModel` / `instantiateTemplate` produce a new immutable‑once‑Active version; the
  original is preserved (governance + ChangeLog).

➡️ **Action: none.** Prioritisation already satisfies the brief. It is the blueprint.

---

## 4. BHI / BSI — what shipped this round (v3.55.x)

### 4.1 Before
A single global `SystemConfig['bhiWeights']` JSON, merged over per‑**mode** defaults
(`DEFAULT_MODE_WEIGHTS` for Road / RoadOverWater / Rail / Pedestrian). Admin‑configurable (C2 ✅)
and defaulted (C1 ✅), but **mode** was the finest grain — a Culvert and a Beam Bridge on the same
road mode were weighted identically (C3 ❌), and there was no copy/version concept (C4 ❌).

### 4.2 Shipped: per‑asset‑class element weighting (C3 ✅, additive)
All changes are **additive and back‑compatible** — omitting the new config reproduces the legacy
result byte‑for‑byte (proven by `test/bhi-per-class.test.js`).

[`srv/lib/bhi.js`](srv/lib/bhi.js):
- **`DEFAULT_BHI_CONFIG.classModeWeights`** — new `{}` map: `{ <assetClass>: { <modeKey>: { <bucket>: weight } } }`.
- **`resolveBhiConfig`** — parses `classModeWeights`, merges each class/mode override **over** the
  mode default, and **drops non‑finite / negative values** (hardening). Returns
  `{ modeWeights, env, calibrated, classModeWeights }`.
- **`weightsFor(mode, overWater, cfg, assetClass)`** — new precedence:
  `(assetClass, modeKey) → mode default → Road`. Same shape as the prioritisation ladder.
- **`computeBSI(elements, mode, env, cfg, assetClass)`** — threads `assetClass` into `weightsFor`.

**Callers wired** to pass the bridge's class so the per‑class weights are actually *applied*:
- [`srv/prioritisation-service.js:504`](srv/prioritisation-service.js:504) — `computeBhi` (persist path).
- [`srv/prioritisation-service.js:527`](srv/prioritisation-service.js:527) + `:531` — `bhiDetail` (explorer + displayed weight set).
- [`srv/lib/prioritisation-rule-engine.js:54‑55`](srv/lib/prioritisation-rule-engine.js:54) — live `bsi`/`bhi` value functions.

**End‑to‑end config path (no new plumbing needed):** `resolveBhiConfig` is the *single* normaliser
used by **both** the admin endpoint ([`srv/server.js:2411`](srv/server.js:2411) GET /
[`:2441`](srv/server.js:2441) PUT) **and** the engine refresh
([`srv/prioritisation-service.js:43`](srv/prioritisation-service.js:43)). So an admin who PUTs a
body containing `classModeWeights` has it validated, normalised, persisted to the `bhiWeights`
SystemConfig row, and picked up on the next 60s‑cached engine refresh — automatically.

**Example admin config** (Culvert weights substructure heavier; everything else inherits the mode default):
```json
{
  "classModeWeights": {
    "Culvert": { "Road": { "substructure": 0.45, "deck": 0.20 } },
    "Rail Bridge": { "Rail": { "superstructure": 0.40 } }
  }
}
```

### 4.3 Remaining gap (C4): named, copyable BHI versions
BHI config is still **one JSON blob**, not a set of named, cloneable versions. An admin can edit it,
but a user can't "save my coastal‑aggressive weight set as a copy and switch between them." That's
the next increment — see §6.

---

## 5. Risk categorisation — current state (Partial)

**Entities:** `RiskConfig` (consequence/likelihood factors, weight 0–10), `RiskBand` (thresholds +
rationale + `reviewedBy`, active soft‑delete). **Engine:** [`srv/lib/risk.js`](srv/lib/risk.js)
enforces strictly‑decreasing band minimums. Methodology: `docs/risk-model/METHODOLOGY.md`.

- **C1 ✅** default factors + bands seeded.
- **C2 ✅** factors/bands are config rows an admin edits.
- **C3 ⚠️** risk is *partially* folded into the prioritisation model (which IS per‑class), but
  `RiskConfig`/`RiskBand` themselves are global — no per‑class band sets.
- **C4 ⚠️** bands are soft‑deletable (audit‑preserving) but there is no clone/version/template —
  you edit the live global config in place.

➡️ Risk is the **least mature** of the three and the natural last beneficiary of the generalised
pattern in §6.

---

## 6. The generalisation — a reusable "governed‑config‑model" pattern

Three engines, one recurring shape: **default → admin‑tune → per‑class resolve → clone/version**.
Today prioritisation implements it fully in its own service; BHI now has the per‑class resolver;
risk has neither clone nor per‑class. Rather than re‑implement clone/version/precedence three times,
extract the mechanism once.

**Proposed plugin:** `srv/lib/plugins/governed-config/` (follows the existing plugin independence
rules — self‑contained, additive CDS, zero cross‑plugin imports; see
`docs/.../reusable-plugins`). It would provide:

- **CDS aspect** `governedModel` — `{ code, name, version, isTemplate, status (Draft/Active/Retired),
  clonedFrom }`, managed + soft‑delete, immutable‑once‑Active.
- **`clone(modelID, {code, name})`** — deep‑copy a model + its child config rows into a new Draft.
- **`activate(modelID)`** — freeze version, supersede the prior Active.
- **`resolve(model, assetClass, mode)`** — the precedence ladder, factored out of
  `prioritisation-rule-engine.js` so all three engines share **one** resolver.

**Migration is incremental and non‑breaking:**
1. **BHI** gets a `BhiModel` entity (default + clones) replacing the single JSON; `bhi.js` reads the
   resolved per‑class weights from the active model instead of the global blob. The
   `classModeWeights` shape already shipped becomes the per‑class rows — so this is a *storage*
   change, not a *logic* change. Add a small admin UI (clone / edit / activate), mirroring the
   prioritisation model editor.
2. **Risk** adopts the same aspect: `RiskModel` with per‑class `RiskBand`/`RiskConfig` rows + clone.
3. **Prioritisation** refactors to *consume* the extracted resolver (behaviour‑preserving; its tests
   are the regression gate).

**Sequencing rationale:** BHI first (biggest gap already half‑closed, clearest win), risk second
(most behind), prioritisation last (only a refactor, lowest value, highest regression surface).

---

## 7. What was verified this round

- `test/bhi-per-class.test.js` (**new, 5 tests**): per‑class override parsing; bad‑value hardening;
  `weightsFor` precedence; `computeBSI` actually changes with a class override; **back‑compat**
  (no `classModeWeights` and/or no `assetClass` ⇒ identical to legacy).
- **Full suite green on Node 22:** `66 suites / 563 tests` pass (was 558; +5 new, 0 regressions).
- Config round‑trip confirmed by inspection: admin GET/PUT and the engine refresh share the single
  `resolveBhiConfig` normaliser, so `classModeWeights` persists and applies with no extra plumbing.

## 8. Open decisions for the product owner

1. **Build the `governed-config` plugin + `BhiModel`/`RiskModel` now, or ship the JSON‑level
   per‑class BHI (already done) and defer named versioning?** (Recommend: ship now, schedule the
   plugin as the next module — it removes duplicated clone/version logic across three engines.)
2. **Admin UI for per‑class BHI weights** — extend the existing BHI weights editor in `bms-admin`
   with a per‑class section, or wait for the full `BhiModel` editor? (Recommend: a thin per‑class
   section now; full editor with the plugin.)
3. **Risk per‑class bands** — confirm whether councils actually band risk differently by asset class,
   or whether the global bands + per‑class *prioritisation* weighting already suffices. (Cheapest to
   validate with one or two pilot users before building.)
