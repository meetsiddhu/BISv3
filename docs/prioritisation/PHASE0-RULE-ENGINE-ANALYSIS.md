# Phase 0 — Configurable Prioritisation Rule Engine: Analysis & Engine Design

**Status: READ-ONLY analysis. No code, schema, data, or git change has been made. STOP at the end of this document — awaiting approval.**

Scope: evolve the approved prioritisation module (manual five-dimension judgement, live in v3.9.33) into a configurable, per-asset-class rule engine, per the master prompt. This document is the Phase 0 gate deliverable: current-state + integration map, the finalised additive data model, the parameter-pack seed plan, the Model Builder Fiori translation, the backward-compatibility plan, and open questions.

---

## 1. Current state — what exists today (verified, file:line)

### 1.1 The approved prioritisation module (the thing we extend)
| Component | Where | What it does today |
|---|---|---|
| `PrioritisationConfig` | `db/schema.cds:748` | ONE flat versioned row: 5 dim weights (wSafety…wReputational), blend (wRisk/wCrit/wStrat), maxResidual/maxCriticality, urgency per strategy, `bandThresholds` JSON ladder, `formulaVersion`, `rubrics` JSON, `methodologyOwner`. New version retires prior (handler). |
| `PrioritisationAssessment` | `db/schema.cds:781` | Immutable run: 5 dim inputs, likelihood (+derived/overridden/mandatory reason), strategy, restrictionFlag; computed criticality/tier/residual/riskN/critN/stratN/priorityScore/band; confidence (inputsAvailable/Total, conditionAsAtMonths); $ cost snapshot; reproducibility (`configVersion`, `formulaVersion`, `paramSnapshot`, `rubricSnapshot`); `supersededBy`; `active`. |
| Engine | `srv/lib/prioritisation.js` | Pure function `derivePriority`: criticality = Σ(normalised dim weights × dims) → tier = round clamp 1..5 → **residual = L × tier** → riskN/critN/stratN → score = normalised blend → band ladder (guarded). Plus `deriveLikelihood` (condition + structural via single-source scale), `rubricsFor`/`rubricSnapshot`, `FORMULA_VERSION='v1-normalised'`. |
| Service | `srv/prioritisation-service.js` | before-CREATE: feature-flag gate (`SystemConfig prioritisationEnabled`), bridge required, server-side compute (client values overwritten), mandatory override reason, federated facts (`factsFor`: Bridges + active BridgeRestrictions read in-process), cost snapshot, **atomic supersede** in-transaction. after-CREATE: ChangeLog + supersede audit. `raiseWorkRequest` → `EamWorkRequest` QUEUED (EAM never written). `reportPdf` (server-rendered one-pager). `prefill`. |
| UI | `app/prioritisation` (freestyle, justified) | Worklist (band-primary, confidence chips, run-detail + run-history dialogs) · Assess hero (rubric-anchored segmented dims, constrained matrix — consequence column = computed tier, not overridable; decomposition + formula inspector) · Reports (exec + engineer from the same run). |

### 1.2 The reuse surfaces (single sources of truth — bind, don't fork)
| Surface | Where | Reuse in the engine |
|---|---|---|
| Condition scale | `srv/lib/condition-rating.js:62` (`legacyToTfNSW`, `conditionLabel`, `isHighPriorityTfNSW`, `deriveCondition`) | The ONLY condition normalisation inside value-functions (criteria #1–3). |
| ISO 31000 risk | `srv/lib/risk.js:207` (`deriveRisk`, `weightsFromConfig`, `bandsFromConfig`, `validateRiskBands/Weights`, **`expectedValueAud`, `estimatedRulYears`, `benefitCostRatio`**, `probMapFromConfig`) | Band/weight validation already reused; the monetised helpers become **Derived** bindings for criteria #4, #32, #34. |
| Per-class strategy | `AssetClassStrategy` `db/schema.cds:440` (assetClass, transportMode, inspectionIntervalMonths, interventionThreshold, `degradationRatePerYear`, `deteriorationModel`, `eamMaintenancePlan`) | RUL derivation input (#4); inspection-currency policy (#14); the existing per-class precedent the weight table follows. Seeded per mode (`db/data/bridge.management-AssetClassStrategy.csv`). |
| Custom characteristics | `AttributeDefinitions` `db/attributes-schema.cds:25` (objectType, `internalKey`, dataType Text/Integer/Decimal/Date/Boolean/Single/MultiSelect, allowedValues, min/max, status) + `AttributeValues` (:74, typed columns keyed objectType+objectId+attributeKey, append-only audit) | **The no-schema-change binding**: `sourceType=Attribute, sourceRef=internalKey`. Typed read per dataType. ~13 of the 37 pack parameters bind here. |
| Immutable runs | `PrioritisationAssessment` | Extended additively (modelCode/modelVersion/weightSetHash/criterionBreakdown) — never replaced. |
| EAM outbound | `EamWorkRequest` `db/schema.cds:831` + `raiseWorkRequest` | Unchanged; Phase 8 reuses as-is. |
| Lookups | `AssetClasses` CodeList `db/schema.cds:403`, `TransportModes` `:409`; `Bridges.assetClass String(40)` + `Bridges.transportMode` exist | FK domain for per-class weights; per-asset model resolution key. |
| Feature flag / governance | `SystemConfig prioritisationEnabled`; ChangeLog via `srv/audit-log.js`; XSUAA view/manage/admin | Engine stays behind the same flag; same scopes; ChangeLog on all new config CUD. |
| Admin UI pattern | `app/bms-admin` — **freestyle**, routed config screens (`riskBands`, `riskFactors`, `assetStrategy`, `systemConfig`…) | Model Builder follows this exact pattern (see §6). |

### 1.3 Integration map (where a criterion's raw value can come from today)

```
PrioritisationModel (config) ──selects──▶ criteria + weights for (assetClass, transportMode)
        │
        ▼  bind(sourceType, sourceRef, transform)
┌──────────────────────────────────────────────────────────────────────────────┐
│ BridgeField   → Bridges row (assetClass:6, transportMode:13, network:15,     │
│                 costs:33-35, yearBuilt:46, designStandard:48, clearance:49,  │
│                 material:51, deckWidth:54, lanes:55, condition:57,           │
│                 structural:63, posting:64, lastInspection:73, loadRating:85, │
│                 ratingStandard:88, importanceLevel:90, AADT:91, heavy%:92)   │
│ Capacity      → BridgeCapacities (:245) ratingFactor, ratingStandard, dates  │
│ Element       → BridgeElements (:371) conditionRating per elementType        │
│ Defect        → BridgeDefects (:337) severity 1-4, status Open               │
│ Inspection    → BridgeInspections (:314) type, date, conditionRating history │
│ Restriction   → BridgeRestrictions (:198) type, status, speed, lanes, dates  │
│ Attribute     → AttributeValues by internalKey (NO schema change to add)     │
│ Derived       → registry: risk.js estimatedRulYears / expectedValueAud /     │
│                 benefitCostRatio; condition-rating.js trend (from inspections)│
│ Manual        → Assess screen judgement (the approved 5 dims; rubric-anchored)│
│ External      → recorded via Attribute with provenance (MVP — see Q5)        │
└──────────────────────────────────────────────────────────────────────────────┘
        ▼
value-function (bands) → confidence → weighted aggregate → AggregationRules → band
        ▼
PrioritisationAssessment (immutable, + modelCode/modelVersion/weightSetHash/criterionBreakdown)
```

EAM surface: unchanged — register/condition facts already federated read-only in-process (`factsFor`); outbound only via the existing queue. The engine adds **no** new EAM touchpoint.

---

## 2. ⚠ Critical design finding — the approved formula is NOT a weighted sum

The approved model computes `residual = likelihood × tier(criticality)` — **multiplicative**, with `tier` an intermediate of the dim-weighted criticality, then blends three normalised components. A flat `Σ score×weight / Σ weight` **cannot reproduce it** (different algebra, different rounding). Naively seeding the five dimensions as WeightedSum catalogue rows would silently change every score — a regression the locked rules forbid.

**Resolution (recommended):** `PrioritisationModel.aggregationMethod` is an enum of named pipelines:
- **`RiskCritBlend-v1`** — the approved formula, implemented by **delegating to the existing `srv/lib/prioritisation.js` `derivePriority`** (single source of truth, byte-identical, zero regression). Used by the seeded default model `NSW-RISK-V1`. Its five dimensions + likelihood still appear as catalogue rows (Manual criteria with rubrics + weights mirrored from `PrioritisationConfig`) so the Assess screen and Model Builder render them as config — but the math routes through the proven engine.
- **`WeightedSum`** / **`WeightedSumWithRules`** — the generic compensatory pipeline + non-compensatory overlays, for all new models.

Backward-compat is then **provable**: a golden-vector test asserts `NSW-RISK-V1` engine output ≡ current `derivePriority` output across an input matrix. (→ Open question Q1.)

## 3. Decision — extend `PrioritisationConfig` or add the §3 entities?

**Recommendation: add the §3 entity family; keep `PrioritisationConfig` as the global-knobs row, extended additively with `modelCode`.**

- `PrioritisationConfig` is a flat row purpose-built for one fixed formula. Encoding a criteria catalogue, per-class weights, bands, bindings and rules into it would mean governance-hostile JSON blobs (unqueryable, unvalidatable, un-ChangeLog-grained) — exactly the "config is data" rule says rows, not blobs.
- The split of responsibilities: **`PrioritisationModel` family** = *what is scored and how it aggregates*; **`PrioritisationConfig`** = *global banding ladder + blend knobs*, gaining additive `modelCode : String(40)` (null = global default) so a model **may** carry its own ladder without forking the entity.
- Existing handlers (validate weights/bands, retire-prior-on-new-version, ChangeLog) extend naturally; nothing existing is renamed or removed.

## 4. Finalised additive data model (Phase 1 build target)

Namespace `bridge.management`; all `cuid, managed`, soft-delete, ChangeLog on CUD; XSUAA admin for writes; **no existing field/entity is changed or removed**. Refinements vs the prompt's §3 sketch are marked **Δ**.

```cds
entity PrioritisationModel : cuid, managed {
  code, name, version (immutable once Active — change = clone to new version),
  status: Draft | Active | Retired (soft-delete),
  aggregationMethod: 'RiskCritBlend-v1' | 'WeightedSum' | 'WeightedSumWithRules',   // Δ named pipelines (§2)
  description, reviewedBy/reviewedAt/reviewSource (sign-off, mirrors RiskBand),
  criteria / classWeights / rules : Compositions (as sketched)
}
entity ModelCriterion : cuid, managed {
  model, code, name, category (Likelihood|Consequence|Vulnerability|Criticality|Modifier),
  standardRef, description, active,
  valueType : 'Numeric' | 'Discrete' | 'Level1to5',         // Δ drives band validation + UI control
  rubric : LargeString,                                      // Δ per-level descriptors for Manual criteria
  displayOrder : Integer,                                    // Δ Assess-screen ordering
  bindings / bands : Compositions (as sketched)
}
entity CriterionSourceBinding : cuid {  // as sketched; sourceType enum:
  // BridgeField | Capacity | Element | Defect | Inspection | Restriction | Attribute | Derived | Manual | External
  // Δ 'Derived' resolves through a code REGISTRY of named expressions (estimatedRulYears, benefitCostRatio,
  //   conditionTrend, maxOpenDefectSeverity, minElementCondition …) — selection is config, math is tested code.
  // Δ 'External' (MVP) = Attribute-backed recorded value + provenance (asAt, source) — no live calls (Q5).
}
entity CriterionValueBand : cuid {       // as sketched
  // Δ server validation: numeric bands non-overlapping + gap-free warning; discrete XOR numeric per valueType;
  //   score 0..100 @assert.range (already sketched).
}
entity AssetClassCriterionWeight : cuid { // as sketched
  // Δ assetClass / transportMode validated against AssetClasses / TransportModes codelists ('*' wildcard
  //   allowed, mirroring AssetClassStrategy seeds); unique (model, assetClass, transportMode, criterion).
  // missingDataPolicy: flag | neutral | penalise | exclude — NEVER silent zero (default 'flag').
}
entity AggregationRule : cuid {          // as sketched
  // Δ config JSON schema-validated per ruleType server-side; rationale mandatory for SafetyFloor/Veto/Escalate.
}
// ADDITIVE extensions to existing entities:
extend PrioritisationConfig  { modelCode : String(40); }                     // null = global default
extend PrioritisationAssessment {
  modelCode : String(40); modelVersion : Integer;                           // null = legacy ⇒ NSW-RISK-V1 implied
  weightSetHash : String(64);                                               // SHA-256 of resolved criteria+weights+bands
  criterionBreakdown : LargeString;                                         // JSON: per-criterion raw, source(+as-at),
}                                                                           //   score, weight, confidence, contribution,
                                                                            //   missingPolicyApplied
```

**Evaluation pipeline (Phase 2, pure + unit-tested):** new `srv/lib/prioritisation-rule-engine.js` — `resolveCriteria(model, assetClass, mode)` → `bind()` per sourceType (readers above) → `valueFunction(raw, bands)` honouring `missingDataPolicy` → confidence (freshness vs `AssetClassStrategy.inspectionIntervalMonths` × completeness) → compensatory base → `AggregationRule` overlays in `priority` order (SafetyFloor/Escalate raise band — non-compensatory; Veto/HurdleMin cap or force review flag) → band ladder → emit run with breakdown + hash. `RiskCritBlend-v1` short-circuits to `derivePriority` (§2). Reproducibility: same inputs + same model version ⇒ identical run (test).

## 5. Parameter pack — binding surface & seed plan (the 37 criteria)

Availability today (verified against the schema): **binds-now** = existing field/entity; **derived** = existing lib/registry; **attribute** = seed an `AttributeDefinitions` row (objectType `Bridge`, no schema change); **external/manual** as noted.

| # (prompt §4) | Binding today | Detail |
|---|---|---|
| 1 BHI/condition | **binds-now** | `Bridges.conditionRating:57` via `condition-rating.js` |
| 2 Worst-element condition | **binds-now** | `BridgeElements.conditionRating` + transform `min(...)` (Derived registry) |
| 3 Deterioration trend | **derived** | `conditionTrend` over `BridgeInspections` history |
| 4 RUL vs design life | **derived** | `risk.estimatedRulYears` + `AssetClassStrategy.degradationRatePerYear`, `yearBuilt:46` |
| 5 Defect severity/extent | **binds-now** | `BridgeDefects.severity` (1–4) + status Open; transform `maxOpenDefectSeverity` |
| 6 Load rating / utilisation | **binds-now** | `BridgeCapacities.ratingFactor` (latest by ratingDate); fallback `Bridges.loadRating:85` |
| 7 Current posting | **binds-now** | `Bridges.postingStatus:64` + active `BridgeRestrictions` |
| 8 Material vulnerability | **binds-now + attribute** | `Bridges.material:51` discrete bands; refinement attribute optional |
| 9 Fatigue | **attribute** | `FATIGUE_REMAINING_LIFE` |
| 10 Fracture-critical | **attribute** | `FRACTURE_CRITICAL` Boolean — also the seeded Escalate-rule trigger |
| 11 Scour / hydraulic | **attribute** | `SCOUR_RATING` (NBI Item 113 discrete bands) + `OVER_WATER` Boolean |
| 12 Seismic | **attribute** | `SEISMIC_VULNERABILITY` (region × susceptibility) |
| 13 Environmental exposure | **attribute** | `EXPOSURE_CLASS` (marine/coastal/freeze-thaw) |
| 14 Inspection currency | **binds-now** | `Bridges.lastInspectionDate:73` vs strategy interval → also feeds confidence |
| 15 Functional obsolescence | **binds-now** | `designStandard:48`, `deckWidth:54`, `numberOfLanes:55` |
| 16 Network role | **binds-now + attribute** | `network:15`, `route:7`; `LIFELINE_ROUTE` attribute |
| 17 Traffic exposure | **binds-now** | `averageDailyTraffic:91`, `heavyVehiclePercent:92` |
| 18 Detour/redundancy | **attribute** (MVP) | `DETOUR_LENGTH_KM` recorded; live routing later |
| 19 Structural redundancy | **attribute** | `STRUCTURAL_REDUNDANCY` |
| 20 PT dependency | **binds-now + attribute** | `transportMode:13`/`secondaryModes:14`; `PT_SERVICES_COUNT` |
| 21 Active/vulnerable users | **attribute** | `ACTIVE_TRANSPORT_EXPOSURE` |
| 22 Freight value | **attribute** (MVP) | `FREIGHT_VALUE_CLASS` recorded from Freight Data Hub |
| 23 Community isolation | **attribute** (MVP) | `ISOLATION_POPULATION` |
| 24 Critical services | **attribute** (MVP) | `CRITICAL_SERVICES_PROXIMITY` (geo-derived later) |
| 25 Third-party utilities | **attribute** | `UTILITIES_SUPPORTED` (MultiSelect) |
| 26 Modal interdependency | **binds-now** | `secondaryModes:14` discrete bands |
| 27 Vehicle/vessel impact | **binds-now + attribute** | `clearanceHeight:49`; `NAVIGABLE_WATER` Boolean |
| 28 Heritage | **attribute** | `HERITAGE_LISTING` |
| 29 Env. sensitivity/contamination | **attribute** | `ENV_SENSITIVITY`, `HAZMAT_PRESENT` |
| 30 Life-safety consequence | **binds-now + attribute** | `importanceLevel:90`; `OVER_OCCUPIED_SPACE` |
| 31 Importance level | **binds-now** | `Bridges.importanceLevel:90` (AS 5100.1) |
| 32 Replacement cost | **binds-now** | `likelyFailureCostAud:33` (and/or `REPLACEMENT_COST` attribute) |
| 33 Intervention cost | **binds-now** | `mitigationCostAud:34` + deliverability attribute |
| 34 Expected value / BCR | **derived** | `risk.expectedValueAud` / `risk.benefitCostRatio` (`riskReductionPct:35`) |
| 35 Climate trajectory | **attribute** (MVP) | `CLIMATE_EXPOSURE_TREND` |
| 36 Safety incidents | **attribute** | `INCIDENT_COUNT_5Y` |
| 37 Statutory obligation | **attribute** | `STATUTORY_OBLIGATION` |

**Tally:** 14 bind to existing fields/entities now · 4 derived through existing tested helpers · 17 seed as AttributeDefinitions (zero schema change — the engine's headline capability demonstrated at seed time) · external feeds enter as recorded attributes with provenance in MVP.

**Seed plan (Phases 1+5):** all 37 as `ModelCriterion` rows with `standardRef` + default bands + bindings; the ~17 attributes seeded as `AttributeDefinitions` (status Active, sensible dataType/allowedValues); per-class default weight sets for **Road Bridge, Rail Bridge, Major Culvert, Pedestrian, Marine** (e.g. scour/vessel ≈ 0 for dry-land pedestrian; fatigue/fracture for steel; life-safety dominant for rail-over-occupied) — criteria with no data present default `missingDataPolicy='flag'` and conservative weight, so nothing is silently zeroed and nothing fabricates a score. Two seeded `AggregationRule` examples: SafetyFloor (condition TfNSW 5 or scour-critical ⇒ min band P2) and Escalate (FRACTURE_CRITICAL + condition Poor ⇒ force review) — both with mandatory rationale text.

## 6. Model Builder — Fiori translation

**Recommendation: extend `app/bms-admin` (freestyle) with a `prioritisationModels` route**, exactly following the existing `riskBands`/`riskFactors`/`assetStrategy` config-screen pattern (list → detail with tabbed editing). Justified deviation from annotation-first: the entire admin app is already freestyle; the editing surface is a 3-level composition (model → criteria → bands/bindings) plus a class×criterion weight **matrix** and an ordered rule list — master-detail freestyle fits; an FE V4 object page would need heavy custom sections anyway. (→ Q3 if you prefer a separate FE app.)

Screens: **Models list** (code, version, status, aggregation, sign-off) with Clone-to-new-version + Activate/Retire actions · **Criteria tab** (catalogue row + valueType + standardRef + rubric editor + bands grid + bindings grid with sourceType/sourceRef value-help — Attribute picker reads `AttributeDefinitions`) · **Class weights tab** (assetClass × transportMode matrix; include flag, bounded weight 0–10, missingDataPolicy) · **Rules tab** (type, trigger criterion, JSON config with per-type form, rationale, priority) · **Governance tab** (reviewedBy/At/source; weight-set hash preview). All admin-scope-gated; every CUD ChangeLogged; i18n; WCAG (no colour-only state).

**Assess/Worklist/Reports** changes (Phases 6–7) stay within the approved wireframe: Assess renders the resolved criteria for the asset's class — Manual criteria as today's rubric-anchored segments; auto criteria as read-only provenance rows (value · source · as-at · band score); decomposition/formula inspector render `criterionBreakdown`; the constrained matrix is unchanged. Worklist gains model/class filters. Reports' methodology appendix lists active model, criteria, weights, standard refs.

## 7. Backward compatibility & migration plan

1. **Seed `NSW-RISK-V1` (Active, version 1, aggregation `RiskCritBlend-v1`)**: five Manual criteria (codes SAFETY/NETWORK/FINANCIAL/ENVIRONMENTAL/REPUTATIONAL) + LIKELIHOOD + STRATEGY context, weights/rubrics mirrored from the live `PrioritisationConfig` — behaviour byte-identical via delegation (§2).
2. **Model resolution on Assess**: automatic from the asset's `assetClass` + `transportMode` (wildcard `'*'` fallback, mirroring `AssetClassStrategy` seeds) → with only NSW-RISK-V1 seeded, every asset resolves to it ⇒ **zero behavioural change at go-live**.
3. **Legacy runs**: `modelCode` null ⇒ interpreted/displayed as NSW-RISK-V1; their frozen `paramSnapshot`/`rubricSnapshot` already guarantee reproduction — untouched.
4. **Tests (gate-blocking)**: golden-vector equivalence (NSW-RISK-V1 ≡ `derivePriority` across an input matrix incl. band edges & overrides); reproducibility (same inputs + model version ⇒ identical run incl. hash); supersede/immutability unchanged; rule-engine units (floors, veto, hurdle, each missingDataPolicy, confidence down-weighting); existing 171-test suite stays green at every phase.
5. **Rollback**: the module remains behind `prioritisationEnabled`; additionally models are data — retiring every model except NSW-RISK-V1 restores exactly today's behaviour without a deploy.

## 8. Open questions (decide at this gate)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Accept `RiskCritBlend-v1` named-pipeline delegation for NSW-RISK-V1 (byte-identical), rather than re-expressing the approved formula as a weighted sum (which would alter scores)? | **Yes — delegation** |
| Q2 | `PrioritisationConfig`: extend additively with `modelCode` for per-model ladders, global row as fallback? | **Yes** |
| Q3 | Model Builder inside bms-admin freestyle vs a new Fiori Elements app? | **bms-admin freestyle** (pattern consistency) |
| Q4 | Optional `UserType` + `UserTypeCriterionWeight` (per-user-type scoring axis)? | **Defer** — multimodal needs are expressible as criteria #20–22 per class; add the axis later if genuinely needed |
| Q5 | External bindings in MVP = attribute-backed recorded values with provenance (no live calls)? | **Yes** — live feeds (routing, freight hub, ABS) are a later integration phase |
| Q6 | Phase 5 default per-class weight sets: Road Bridge, Rail Bridge, Major Culvert, Pedestrian, Marine? | **Yes — these five** |
| Q7 | Auto-bound criteria are read-only on Assess (provenance shown; only Manual criteria editable; matrix unchanged)? | **Yes** |
| Q8 | Model selection: automatic by assetClass+mode with wildcard fallback; no end-user model picker (admin sees mapping in Model Builder)? | **Yes** |

## 9. Phase plan confirmation

Phases 1–8 exactly as the master prompt, each gated, each reported with: what changed · why · validation (`npx cds build` + `npm test`) · locked-rules check (additive/soft-delete/ChangeLog/no-hardcode/XSUAA/i18n/WCAG/clean-core/bounded/flag) · wireframe fidelity · open questions. The existing five-dimension experience does not change until you choose to activate a second model.

---

**STOP — Phase 0 complete. No code, schema, data, or git changes made (this analysis file is the only artefact, uncommitted). Awaiting your approval of the design decisions (§2–§4), the seed plan (§5), the Model Builder approach (§6), the backward-compat plan (§7), and answers to Q1–Q8 before Phase 1.**
