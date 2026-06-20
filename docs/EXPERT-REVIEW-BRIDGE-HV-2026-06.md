# Expert Review — Bridge Asset Lifecycle & Heavy-Vehicle Fitness

**Lens:** NSW bridge engineering + heavy-vehicle structural assessment / access (NHVR, HML, PBS, OSOM).
**Reference frame:** AS 5100 (esp. .7 rating), Austroads AGBM (Guide to Bridge Management), ISO 55000, NHVR route-assessment practice.
**Date:** 2026-06-16 · **Build reviewed:** 3.18.1

---

## Verdict (one line)

A genuinely strong **engineering-decision** system — condition, capacity, risk and prioritisation are standards-aligned and config-governed — with real gaps in **inspection evidence (photos/quantities)**, **heavy-vehicle route/permit assessment**, and **standalone maintenance execution** that matter for full lifecycle and HV access decisions.

---

## What's good — already covers core lifecycle needs

| Lifecycle stage | Capability present | Why it's right |
|---|---|---|
| **Strategy / plan** | `AssetClassStrategy` per class+mode: inspection interval, target condition, intervention threshold, degradation rate, deterioration model, review cycle | This is the ISO 55000 / SAMP policy layer most registers lack. Drives next-due, overdue and intervention-due signals. |
| **Register** | Full asset identity, structure/geometry, design load + standard, as-built drawing ref, multi-modal + secondary modes, importance level, GIS (GDA2020 + GeoJSON validated) | Matches Austroads bridge-register data items; multi-modal is ahead of most. |
| **Condition** | 1–10 stored → 1–5 band (AS 5100.7-aligned), element roll-up (worst-element), provenance flag, BSI/BHI element-weighted indices with age/environment/importance/RSL | Element-weighted health index + worst-element governance is best practice, not just an average. |
| **Capacity / load** | `BridgeCapacities`: load rating to **AS 5100.7** (rating factor, engineer, date, report ref), gross/combination mass, **axle-group limits** (steer/single/tandem/tri), clearances, fatigue (design vs consumed life, fatigue-sensitive, critical element), flood-closure level | This is a proper structural-capacity record, not a single number. Axle-group + fatigue + rating-factor is exactly the HV-relevant data. |
| **Heavy-vehicle posting** | Restrictions with vehicle-class applicability (B-Double, HML, PBS L1–4, Road Train), mass/dimension/axle limits, **gazette reference**, permit/escort/pilot/signage flags, direction, effective dates, temporary windows | Strong load-posting and access-restriction model with legal traceability. |
| **Risk / prioritise** | Config-driven risk engine + 12-template, 6-sector prioritisation with non-compensatory safety floors, reproducible runs (param snapshot + weight-set hash) | Top-tier: a Critical structure can't be averaged out of P1; every run is auditable. |
| **Renewal economics** | ISO 55000 fields: likely-failure-cost, mitigation-cost, risk-reduction %, derived expected-value, benefit-cost ratio, estimated RUL | Decision-support for capital programming, honestly flagged as assumption-based. |
| **Governance** | Change log (now old→new), soft-delete, XSUAA scopes, zero-hardcoding config, EAM-complement boundary | Audit-grade and standalone-capable. |

---

## Gaps — missing fields / functionality (with rationale & severity)

### A. Inspection evidence & element detail — **High**
| Gap | Rationale (NSW/AGBM) |
|---|---|
| **No inspection photo / document attachment** (`BridgeDocuments` is a stub; no upload/storage) | Photographs are mandatory in every Level 2 bridge inspection; a defect record without imagery is not defensible. Highest-value missing function. |
| **No element condition-state quantities** (elements carry a 1–10 rating, not AS 5100 / NBE condition-state quantities CS1–CS4 with extent) | Modern bridge management (AGBM, AASHTO NBE) scores *quantity in each condition state*, which drives both BHI and treatment cost. A single per-element rating loses extent. |
| **No defect quantification** (severity/urgency 1–4 exist; no measure/extent/units, no defect location on element) | Treatment scoping and deterioration trending need extent (m, m², no. of), not just a severity tier. |
| **No inspection scheduling calendar / due-list workflow** (advisory `nextInspectionDue` only; EAM owns execution) | Fine *with* EAM; for a standalone product a due-list/assignment view is expected. |

### B. Heavy-vehicle structural assessment & access — **High (this is the HV core)**
| Gap | Rationale (NHVR / HV assessment) |
|---|---|
| **No "assess a specific vehicle against this bridge" function** — given an axle configuration + masses, does the structure pass? | This is the central HV question. Today the app stores *outcomes* (rating factor, bDoubleApproved boolean) but cannot *evaluate* a candidate vehicle/permit against the capacity. |
| **No load-effect / bridge-formula check** (axle-spacing vs mass distribution) | NHVR access and SLG/restricted-access decisions hinge on axle-spacing mass limits, not just GML. The axle-group data exists but isn't *evaluated*. |
| **No route-level rollup** — worst-governing structure along a permit route | A permit is granted on a *route*; operators need the governing (weakest) bridge across the route, which requires a route→structures relationship and a min-capacity rollup. |
| **No rating-factor → posting-load derivation** (RF and GML stored independently; not linked) | When RF < 1.0 the posted load should follow from the rating; today they're entered separately and can disagree. |
| **No assessment-vehicle library** (SM1600/M1600/S1600/HLP, T44/L44, HML, PBS levels, common permit configs) | A reusable vehicle/load-model catalogue is the prerequisite for any of the above checks. |

### C. Lifecycle execution & deterioration — **Medium**
| Gap | Rationale |
|---|---|
| **Maintenance/treatment actions not tracked in-app** (advisory only; EAM owns work orders) | Correct boundary *with* EAM; standalone customers need at least a lightweight treatment/action log to close the inspect→act→re-inspect loop. |
| **Deterioration limited to linear** (`Markov`/`Custom` scaffolded, not implemented) | RUL and forward condition forecasting for capital planning want Markov/Weibull per material/element. Linear over- or under-states tail risk. |
| **No capital-program optimiser** (EV, BCR, RUL are per-asset advisory; no portfolio/budget-constrained optimisation) | The "what do I fund this year within $X" question needs a knapsack/optimisation step over the scored fleet. |
| **No scour / waterway adequacy as first-class fields** (scour appears only as a BHI bucket / template attribute) | Scour is the leading bridge-failure cause; a dedicated scour rating + waterway adequacy + last-scour-inspection belongs on the structure. |

### D. Data completeness — **Low/Medium (fields)**
| Missing field | Rationale |
|---|---|
| **Skew, superstructure/substructure material split, deck type, joints/bearings inventory** | Standard Austroads register items used for treatment selection and HV load distribution. |
| **Waterway / scour: foundation type, scour countermeasures, design flood, last scour inspection** | Needed for the scour gap above. |
| **Load-rating linkage to a named assessment vehicle + ULS/SLS result split** | Makes the rating interpretable and re-checkable. |
| **Inspection: weather, access/traffic-control method, time on site, defect-photo refs** | Routine AGBM inspection metadata. |
| **Geocoding provider** (stubbed) | Address↔coordinate is unusable until wired to a provider. |

---

## Recommended improvements (prioritised, with rationale)

1. **Inspection photo/document attachments** *(High, small–medium)* — wire `BridgeDocuments` to blob storage + an upload control on the inspection. *Rationale: makes inspections defensible; unblocks real field use.*
2. **Heavy-vehicle assessment module** *(High, medium)* — an assessment-vehicle library + a "check vehicle vs bridge" function (GML, axle-group, axle-spacing/bridge-formula, RF gate) returning pass/conditional/fail, and a route-level worst-structure rollup. *Rationale: turns stored HV booleans into actual NHVR access decisions — the single biggest capability uplift for the HV use case.*
3. **Element condition-state quantities + defect extent** *(High, medium)* — add CS1–CS4 quantity capture per element and measured extent per defect. *Rationale: aligns with AGBM/NBE, sharpens BHI and treatment cost.*
4. **Lightweight treatment/action log** *(Medium, small)* — record proposed/done treatments with cost + date, closing the inspect→act→re-inspect loop for standalone (no-EAM) deployments. *Rationale: completes the lifecycle without replicating EAM work orders.*
5. **Scour & waterway as first-class fields** *(Medium, small)* — dedicated scour rating, waterway adequacy, foundation type, design flood, last scour inspection. *Rationale: top failure mode deserves explicit tracking, not just a BHI bucket.*
6. **Markov/Weibull deterioration option** *(Medium, medium)* — implement the scaffolded models per material/element. *Rationale: credible RUL/forecasting for capital planning.*
7. **Budget-constrained capital optimiser** *(Medium, medium)* — optimise the scored fleet against an annual budget using BCR/EV. *Rationale: answers the funding question executives actually ask.*
8. **Register field completeness** *(Low, small)* — add skew, material split, deck type, joints/bearings inventory; wire geocoding. *Rationale: standard Austroads items + usability.*

---

## Bottom line

The system is **strong on engineering decision-support and governance** and is genuinely standards-aligned for condition, capacity and prioritisation. To be a complete **bridge lifecycle + heavy-vehicle access** platform it most needs: (1) **inspection evidence** (photos + element/defect quantities), (2) a **heavy-vehicle-vs-structure assessment** capability (the HV core, currently only stored as outcomes), and (3) closing the **inspect→treat→re-inspect** loop for standalone use. Everything else is incremental field/refinement work.
