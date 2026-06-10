# Bridge Asset Lifecycle Management — Solution Design

**Expert-council design** · asset lifecycle management (ISO 55000/55001) · bridge delivery & maintenance (NSW practice: TfNSW inspection regime, AS 5100, NHVR, ONRSR) · SAP EAM · SAP BTP/CAP · SAP Business Data Cloud (BDC) & Datasphere

**Status:** Target architecture. The *Now* horizon is substantially **realised and live** in BIS v3.9.33 (each realised capability is marked ✅); *Next* and *Later* are the committed expansion path.
**Posture:** Side-by-side complement to SAP EAM on SAP BTP — **clean core**, SAP application-certification aligned. EAM is never modified.

---

## 1. The problem this solution solves

A bridge owner with SAP EAM already has the **maintenance-execution** layer: functional locations, equipment, notifications, work orders, maintenance plans, costs. What EAM does **not** give them is the **bridge-engineering decision layer**:

- *What condition is each structure and element actually in, on the engineering scale the regulator uses?*
- *What can legally and safely travel over it (load rating, restrictions), and who needs to know?*
- *Which structures get funded first, and can that ranking be defended to a board, Treasury, and an auditor?*
- *What does the network look like in 10 years under this budget?*

Building that into EAM customisations breaks clean core and couples engineering policy to maintenance execution. Buying a standalone BMS creates a second asset master and an integration swamp. **The answer is a bounded engineering complement on BTP** that treats EAM as the system of record for execution and itself as the system of record for bridge engineering — with a single, governed seam between them.

## 2. Design principles (the non-negotiables)

| # | Principle | Why |
|---|-----------|-----|
| P1 | **Complement EAM, never replicate it.** EAM owns FLOC/equipment master, notifications, work orders, maintenance plans, costing, depreciation. BIS references (FLOC/equipment/order IDs) and deep-links; it never builds a parallel work-order or costing engine. | One system of record per fact. Eliminates reconciliation drift and keeps the EAM investment central. |
| P2 | **Clean core / certification-aligned.** Side-by-side CAP app on BTP; public released APIs only; XSUAA auth; no S/4 modification; standalone-capable (runs with *no* live EAM). | Upgrade-safe S/4; SAP app certification; the solution survives EAM release cycles untouched. |
| P3 | **Engineering data is governed data.** Additive-only schema, soft-delete only, ChangeLog on every create/update/deactivate, immutable decision runs. | Bridges are safety-critical, litigable assets. Every number must be explainable years later. |
| P4 | **Zero hardcoding — config is data.** Weights, bands, rubrics, thresholds, mappings, KPIs live in versioned config entities with admin UIs, not code. | NSW today, another jurisdiction tomorrow; methodology evolves without releases; auditors see the parameters. |
| P5 | **One computed truth per concept.** Single condition-rating module (BMS 1–10 ↔ TfNSW 1–5), single criticality, restriction is a *treatment flag* never a score input, network importance counted once. | Double-counting is how prioritisation models die in audit. |
| P6 | **Decisions are reproducible.** Funding decisions freeze their inputs, parameter snapshot, rubric wording, config/formula version. Exec and engineer views read the *same stored run*. | A ranking that can't be reproduced byte-identically is an opinion, not a defensible funding case. |
| P7 | **Operational vs analytical separation.** CAP/HANA Cloud serves operations; portfolio analytics and cross-system models go to **Datasphere/BDC**, not into the transactional app. | Keeps the app fast and bounded; analytics scale independently; aligns with SAP's BDC data-fabric strategy. |

## 3. System-of-record boundary (the seam with SAP EAM)

| Capability | System of record | BIS role | EAM role |
|---|---|---|---|
| Asset master (FLOC, equipment) | **EAM** | Read-only reference (`eamFlocId`, `eamEquipId`), value-mapped in-app ✅ | Owns hierarchy, classification |
| Bridge engineering master (spans, elements, materials, GIS) | **BIS** ✅ | Owns | n/a |
| Condition (TfNSW L1/L2 element condition states 1–5, BHI inputs) | **BIS** ✅ | Owns canonical module | Receives advisory signal |
| Load rating / capacity (AS 5100, HML/NHVR regimes) | **BIS** ✅ | Owns | n/a |
| Restrictions (load/speed/lane/height, statutory notifications) | **BIS** ✅ (the "gold" capability) | Owns lifecycle + audit | Work to remove cause runs in EAM |
| Risk (operational, fleet-recomputed) | **BIS** ✅ | Owns engine + config | n/a |
| Funding prioritisation (immutable runs, P1–P5) | **BIS** ✅ | Owns engine + governance | Receives resulting work requests |
| Inspection **scheduling/execution** | **EAM** | Engineering policy (`AssetClassStrategy` → maint-plan mapping) ✅ + overdue advisory | Owns plans, orders, mobile execution |
| Defects | **BIS** records engineering defect; linked, not replicated ✅ | Owns engineering view | Owns the notification/order raised from it |
| Work requests from prioritisation | Queued in **BIS**, executed in **EAM** | Outbound queue (`EamWorkRequest`, QUEUED→SENT→ACK) ✅ | Creates notification, returns ID |
| Costs, valuation, depreciation | **EAM/FI** | Snapshots `mitigationCostAud` per decision run ✅ | Owns actuals |
| Portfolio analytics, deterioration, scenarios | **Datasphere/BDC** (Later) | Publishes governed data | Publishes execution/cost data |

This matrix **is** the architecture. Everything else is implementation.

## 4. Solution architecture

```
┌────────────────────────── Consumers ──────────────────────────┐
│ Exec (one-pager, SAC dashboards) · Engineers (Fiori worklists) │
│ Planners (scenarios) · Auditors (immutable runs) · NHVR/public │
└──────────────┬────────────────────────────────────────────────┘
┌──────────────▼──────────── SAP BTP (clean core) ──────────────┐
│ Fiori Launchpad: Operations | Sub-domains | Admin | Reports    │
│  Bridges · Restrictions · Map · Prioritisation · Inspections   │
│  Defects · Capacity · BMS Admin · Mass Upload · Portfolio  ✅  │
│ ───────────────────────────────────────────────────────────── │
│ CAP services (OData V4, XSUAA view/manage/admin/integration)✅ │
│  Engines: condition-rating · risk · prioritisation (immutable  │
│  runs, rubric+param snapshots, server-rendered PDF)        ✅  │
│ ───────────────────────────────────────────────────────────── │
│ HANA Cloud HDI — additive schema, soft-delete, ChangeLog   ✅  │
│ Integration: EAM value-mapping admin ✅ · outbound work-request│
│  queue ✅ · destination-based EAM APIs (Next) · Event Mesh /   │
│  SHM-IoT ingest (Later)                                        │
└──────────────┬───────────────────────────┬────────────────────┘
        read-only refs / outbound          │ governed replication
┌──────────────▼─────────────┐   ┌─────────▼────────────────────┐
│ SAP S/4HANA EAM (untouched)│   │ SAP BDC / Datasphere + SAC   │
│ FLOC·equip·notif·WO·plans  │   │ deterioration · spend-vs-    │
│ costs — system of record   │   │ condition · scenarios (Later)│
└────────────────────────────┘   └──────────────────────────────┘
```

## 5. Lifecycle coverage (ISO 55000 line of sight)

**Objectives → SAMP → asset plans → asset decisions**, traceable in-system:

| Lifecycle stage | Capability | Status |
|---|---|---|
| **Acquire/Plan** | Register onboarding (mass upload, natural-key upsert, validation); asset-class strategy as engineering policy | ✅ |
| **Operate/Monitor** | Condition (TfNSW), capacity/load rating, **restrictions lifecycle**, GIS map, overdue-inspection advisory, defects linked to EAM | ✅ |
| **Evaluate** | Operational **risk engine** (config bands/weights, fleet recompute) + **funding prioritisation** (5-dim criticality with frozen rubrics, constrained risk matrix, likelihood override with mandatory logged reason, immutable reproducible runs, run history) | ✅ |
| **Intervene** | Strategy (Renew/Maintain/Monitor/Decommission) per run; EAM work-request queue; execution in EAM | ✅ (queue) / Next (live push) |
| **Renew/Dispose** | Decommission strategy lane; deterioration + scenario modelling to time renewals | Later |
| **Assure** | ChangeLog everywhere, immutable runs, methodology owner + endorsed-by governance, server-rendered branded PDF, ChangeDocuments tile | ✅ |

**Exec needs met:** what do we own / what condition / what risk / what does the top decile cost ($-quantified, coverage-quantified, signed-off, reproducible) ✅. **Engineer needs met:** rubric-anchored scoring, federated facts (never re-keyed), decomposition + formula inspector, run history, raise-to-EAM ✅. **Auditor needs met:** open any past run with frozen inputs, wording, and parameters ✅.

## 6. The two-engine model (deliberate, reconciled)

- **Operational risk** (`risk.js`): continuous signal, system-derived, fleet-recomputed on config/condition change — drives daily attention.
- **Funding prioritisation** (`prioritisation.js`): point-in-time engineering judgement layered on the same condition evidence, frozen as an immutable run — drives capital cases.
- They share the raw condition input but **never feed each other's scores** (no compounding); restriction is a treatment flag in both. The crosswalk is published (`docs/prioritisation/METHODOLOGY-risk-crosswalk.md`) ✅.

**Why two:** one mutable score can't serve both "what needs attention now" and "prove why bridge X outranked bridge Y in last year's submission." Splitting them is what makes both defensible.

## 7. Future expansion (committed path)

| Horizon | Item | Rationale |
|---|---|---|
| **Next** | Activate EAM outbound: queue worker drains `EamWorkRequest` → EAM notification API via BTP Destination; stamp `externalRef`; status ACK/FAILED | The seam is built and tested; this is configuration + a worker, zero schema change |
| **Next** | Inbound EAM sync jobs (FLOC/equipment delta, order status backlink onto defects/work requests) | Closes the loop engineers ask for ("did my request become an order?") without replicating EAM |
| **Next** | NHVR/mass-scheme structured permits: restriction ↔ permit-route linkage, public restriction feed (read-only API product via APIM) | Restrictions are statutory; the data is already governed — exposure is low-cost, high-value |
| **Later** | **BDC/Datasphere + SAC**: replicate BIS (runs, condition, restrictions) + EAM (orders, costs) into a Datasphere space; analytic models for deterioration curves, spend-vs-condition, renewal-wave forecasting; SAC exec dashboards | P7. Cross-system analytics belongs in the data fabric, not the transactional app. BIS's immutable runs make it analytics-ready by construction |
| **Later** | Scenario planning: budget scenario → predicted band distribution over 10 years (Datasphere model, surfaced in BIS/SAC) | The exec question after "what does the top decile cost" is "what if we fund half of it" |
| **Later** | SHM/IoT ingest (Event Mesh → condition-evidence stream feeding likelihood confidence) | Architecture reserves the seam; adopt when sensor programs mature |
| **Later** | Rail (ONRSR) extension via config + asset-class strategy (no schema fork); AI-assisted inspection summarisation (GenAI Hub) under the same governance | Config-driven design (P4) makes these extensions, not rewrites |

## 8. Rationale register (what was proposed and why)

| Decision | Why | Alternative rejected |
|---|---|---|
| Side-by-side CAP on BTP | Clean core, certification, upgrade-safety, standalone-capable | EAM customisation (breaks core); standalone COTS BMS (second asset master) |
| BIS owns engineering master; EAM owns execution | One system of record per fact | Bidirectional master sync (reconciliation swamp) |
| Immutable, versioned prioritisation runs (param + rubric snapshots) | Treasury/audit defensibility; byte-identical reproduction | Mutable scores (history unprovable) |
| Restriction = treatment flag, never score input | Prevents double-counting the condition that caused it | Restriction-weighted scoring (audit-fatal) |
| Two engines + published crosswalk | Operational vs capital questions have different lifecycles | One blended score (serves neither) |
| Config entities + admin UI for every parameter | Methodology evolves without code; multi-jurisdiction | Hardcoded weights (release per recalibration) |
| Outbound queue → EAM (QUEUED first, push later) | Decouples decision from integration availability; standalone-safe | Synchronous EAM write (couples availability, risks clean core) |
| Server-side compute, append-only, XSUAA-gated, server-rendered PDF | Client can never fabricate a score or a board artefact | Client-computed scores (tamperable) |
| Datasphere/BDC for analytics (not CAP) | Operational/analytical separation; SAP data-fabric alignment | Warehouse-in-CAP (bloats the app, duplicates BDC) |
| Additive schema + soft-delete + ChangeLog | Safety-critical auditability | Hard deletes/renames (destroys trail) |

## 9. Security & certification posture

XSUAA scopes (view/manage/admin/integration) with `@restrict` on every entity ✅ · no secrets in repo ✅ · correlation-ID logging ✅ · health endpoints + HA via mtaext ✅ · i18n + WCAG 2.1 AA (non-colour-coded bands/matrix, ARIA) ✅ · MTA-packaged, html5-repo, approuter ✅ — aligned to SAP BTP application certification requirements; standalone operation proven (no live EAM needed).

---

*Council sign-off basis: this design has been adversarially reviewed twice (5-lens pre-mortem and top-1% council review + re-verification, `docs/COUNCIL-REVIEW-2026-06.md`, `docs/COUNCIL-REVERIFY-2026-06.md`); all blocking findings are closed in the realised build.*
