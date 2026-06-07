# Standards Alignment — ISO 55000 & Bridge/Asset-Management Standards

> How the Bridge Information System (BIS) aligns with the asset-management and
> bridge-engineering standards landscape. BIS is the **asset-information + risk-based
> decision-support layer**; it **complements** SAP S/4HANA EAM (the system of record for
> maintenance *execution*, work orders, plans, cost/valuation). Legend: ✅ met · ◑ partial /
> evidence-staged · ↗ owned by EAM (by design) · ⛔ external certification.

---

## 1. The ISO 55000 family (asset management)

| Standard | What it is | BIS role |
|---|---|---|
| **ISO 55000:2014** | Overview, principles, terminology | BIS implements the *principles*: value, alignment, leadership, assurance |
| **ISO 55001:2014** | Management-system **requirements** (auditable) | BIS supplies the asset-information + risk evidence an AMS audit needs |
| **ISO 55002:2018** | Application guidance | followed for risk-based planning + data |
| **ISO 55010:2019** | Aligning financial & non-financial AM | monetised risk (EV / benefit-cost) bridges engineering ↔ finance |
| **ISO 55013** (data) | Asset-data management guidance | data-quality rules, provenance, audit trail |
| *(PAS 55 — predecessor)* | the BSI spec ISO 55000 grew from | superseded; BIS targets ISO 55000 directly |

### ISO 55001 clause-by-clause

| Clause | Requirement | BIS implementation | Status |
|---|---|---|---|
| **4 Context** | Asset boundaries, stakeholders, AMS scope | Multi-modal register (road/rail/light-rail/ped), network/corridor, asset class | ✅ |
| **5 Leadership / policy** | AM policy, roles, "line of sight" | Config-driven policy: `AssetClassStrategy`, `RiskConfig`, `RiskBand` (with sign-off owner) | ✅ |
| **6.1 Risk & opportunity** | Address risks to AM objectives | Consequence×likelihood engine, mode-aware (`srv/lib/risk.js`) | ✅ |
| **6.2.1 AM objectives** | Measurable, aligned to SAMP | Target condition + intervention thresholds per asset class | ✅ |
| **6.2.2 Planning to achieve** | Risk-based, lifecycle, decision criteria | Risk priority + RUL + Expected-Value + **benefit-cost (ROI)** + inspection-due | ✅ / ◑ (heuristics flagged) |
| **7.5 Information requirements** | Determine & control AM data | `DataQualityRules`, completeness scoring, validated ingress (GeoJSON RFC 7946) | ✅ |
| **7.6 Documented information** | Control of records | Additive schema, soft-delete, version/provenance fields | ✅ |
| **8 Operation** | Operational planning & control; change; outsourcing | Inspection→condition→defect→(EAM work) lifecycle; EAM hand-off references | ✅ ↗ |
| **9.1 Monitoring/measurement** | Evaluate AM performance | `BridgeRiskReport` ALV (slice/dice), overdue signal, dashboards | ✅ |
| **9.2 Internal audit** | Auditable trail | `ChangeLog` on **every** CUD (durable), `AttributeValueHistory`, Change Documents report | ✅ |
| **10 Improvement** | Corrective action, continual improvement | `recalcRisk`, configurable weights/bands/strategies, review cadence | ✅ |
| **SAMP / AMP** | Strategic + asset management plans | BIS feeds the SAMP/AMP with condition, risk, RUL, capital signals; the plan document itself is org-authored | ◑ |
| **Financial valuation / depreciation** | Asset accounting | owned by SAP FI-AA / EAM | ↗ |

**ISO 55001 posture:** BIS is a **defensible asset-information + risk system**. Formal ISO
55001 *certification* is a management-system audit by an accredited body of the *organisation*
(not software); BIS provides the data, risk methodology, and audit trail that audit requires.

---

## 2. ISO 31000:2018 (risk management) — the engine's parent standard

| ISO 31000 element | BIS implementation |
|---|---|
| Risk = consequence × likelihood, documented | `score = consequence(1–5) × likelihood(1–5) × 4` → band; `docs/risk-model/METHODOLOGY.md` |
| Risk criteria defined & governed | `RiskBand` thresholds with `rationale`, `reviewedBy/At`, `reviewSource` (sign-off) |
| Consistent, recorded assessment | engine in `srv/lib/risk.js`, unit-tested; `riskAssessedAt/By`, override + mandatory reason |
| Monitoring & review | `recalcRisk` re-scores the register; config-tunable, audited |
| Transparency of assumptions | likelihood→probability proxy `prob_1..5` in `RiskConfig`; RUL/EV/ROI flagged as planning heuristics |

---

## 3. AU/NZ asset-management practice — IPWEA / IIMM

| Reference | Concept | BIS |
|---|---|---|
| **IIMM** (International Infrastructure Management Manual) | levels of service, lifecycle, risk-based renewal, data confidence | condition + risk + RUL + asset-class strategy; **data-confidence** via `DataQualityRules` |
| **IPWEA NAMS** | asset registers, condition profiling, predicted renewals | register + condition profiling + advisory RUL forecast |
| **AAS / fair-value (AASB 116/13)** | valuation/depreciation | ↗ deferred to SAP FI-AA / EAM (complement boundary) |

---

## 4. NSW / TfNSW bridge management

| Standard / artefact | Concept | BIS | Status |
|---|---|---|---|
| **TfNSW Bridge Inspection Procedure Manual** | condition band (1=Good … to Critical) | canonical TfNSW band mapped from legacy 1–10 (single module `condition-rating.js`) | ✅ |
| Inspection **Levels 1/2/3** | routine / detailed-element / engineering | element-level (`BridgeElements` + `ElementTypes`), `accreditationLevel` (1–4) | ✅ |
| **Importance level** (1–4) | criticality | `importanceLevel` feeds risk consequence | ✅ |
| Postings / gazettal | legal restriction record | `BridgeRestrictions` + `gazetteReference`/`legalReference`/`approvalReference` | ✅ |
| **GDA2020 / EPSG:7844** | NSW spatial datum | declared on storage policy + all GeoJSON exports | ✅ |
| (NSW real "BIS"/BMS) | NSW operates its own bridge system | this app is **complementary / S/4-aligned**, not a TfNSW-system clone | ✅ |

---

## 5. Austroads + Australian Standards

| Reference | Concept | BIS | Status |
|---|---|---|---|
| **Austroads AGAM** (Guide to Asset Management) | network-level AM process | risk prioritisation + asset-class strategy + cross-modal reporting | ✅ |
| **Austroads AGBT** (Guide to Bridge Technology) | bridge inspection/assessment practice | element model, condition, capacity | ✅ |
| **AS 5100.7** (bridge assessment / rating) | load rating | `BridgeCapacities` + `loadRating` + capacity assessment | ✅ |
| **NHVR** (Heavy Vehicle National Law) | HML / B-double / PBS / over-mass routes | full flag set + freight-route + load rating | ✅ |
| IPWEA/Austroads codelists | standard code-lists | code-lists configurable; pre-seed partial | ◑ |

---

## 6. International bridge-management standards (capability view)

| Reference | Concept | BIS capability | Status |
|---|---|---|---|
| **AASHTO MBE** (US Manual for Bridge Evaluation) | load rating / evaluation | load rating + capacity model (methodology aligns; US LRFR factors not pre-seeded) | ◑ |
| **AASHTOWare BrM** (ex-Pontis) | **element-level** condition + deterioration + optimisation | element hierarchy + condition; deterioration is an **advisory** RUL, not a Markov transition model | ◑ |
| **FHWA NBI / NBIS** | 0–9 component condition; inspection standards | TfNSW 1–5 used (NSW context); NBI translation is a mapping config item if US scope is added | ◑ |
| **Eurocode / EN 1990–1991** | actions / assessment basis | capacity/importance modelled; Eurocode partial factors out of scope (AU context) | ◑ |
| **PIARC / fib** | bridge-management good practice | risk-based prioritisation + lifecycle aligns with PIARC guidance | ✅ (capability) |

**Honest position vs world-class BMS:** BIS matches commercial BMS on **register, condition,
element-level inspection, risk prioritisation, restrictions, GIS, and capital signals**. The
deliberate gap vs AASHTOWare-BrM-class tools is **probabilistic deterioration modelling**
(Markov/Weibull transition matrices) — BIS uses a **transparent, assumption-flagged linear RUL
proxy** instead, and documents it as such rather than implying false precision. That is a
defensible MVP choice; advanced deterioration is a future module and/or a specialist/EAM feed.

---

## 7. The complement-SAP-EAM boundary (what BIS deliberately does NOT do)

Per `CLAUDE.md §4/4b`, BIS is the **bridge-engineering specialist + risk + integration** layer.
It **references and defers** to SAP S/4HANA EAM for execution and finance:

- ↗ Functional locations / equipment master, work & maintenance orders, notifications,
  maintenance plans/task lists, measuring points, **cost & depreciation/valuation** — EAM.
- ✅ BIS owns: condition, capacity, **risk**, restrictions, GIS, the engineering policy
  (`AssetClassStrategy`), and the **integration config + audit** (`EAMFieldMapping`,
  `EAMCodeMapping`, `EAMSyncLog`, the dedicated `integration` scope).

This keeps a **clean core** (no S/4 modification) and avoids replicating ISO-55001 execution
capability that EAM already certifies.

---

## 8. What is in-app vs external certification

| Item | In-app (done) | External (issued elsewhere) |
|---|---|---|
| ISO 55001 evidence (risk method, audit trail, data quality) | ✅ | ⛔ ISO 55001 *certificate* — accredited-body audit of the **organisation** |
| Risk methodology (ISO 31000-aligned) | ✅ documented + unit-tested | — |
| NSW/TfNSW + Austroads + AS 5100 capability | ✅ | sign-off is the asset owner's |
| SAP BTP/CAP build quality | ✅ (see `SAP-CERTIFICATION-READINESS.md`) | ⛔ SAP Store certification |
| WCAG 2.1 AA | ✅ built-for (see `ACCESSIBILITY.md`) | ⛔ formal axe/screen-reader pass |

**Bottom line:** BIS implements the **asset-information, risk-decision-support, and
audit-evidence** requirements of ISO 55000/55001 and the NSW/Austroads/AS 5100 bridge
standards, with an honest, transparent risk model (ISO 31000). The *certificates* (ISO 55001,
SAP Store) are issued by accredited bodies / SAP after their own audit of the organisation and
the product — BIS is built to **pass that audit**, supplying the evidence it requires.
