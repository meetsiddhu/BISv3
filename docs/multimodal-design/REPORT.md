# Multi-Modal Bridge Register, Risk Prioritisation, Asset-Class Strategy & Holistic Restrictions — Design

> **DESIGN ONLY — no code written.** For review before implementation.
> Date: 2026-06-07. Builds on the deployed v3.2.0 model (Bridges, BridgeRestrictions,
> BridgeCapacities, Fiori Elements list/object pages, ALV Change-Document report).

---

## 1. Vision

Turn the Bridge Information System from a road-bridge register into a **multi-modal
asset & network-restriction platform**:

- **All bridges, all modes** — Road, Rail, Light Rail (and shared/multi-modal structures), across all networks.
- **Risk-led** — every bridge carries a **risk priority** that drives inspection and intervention.
- **Strategy-aligned** — each bridge is governed by its **asset-class strategy** (intervals, thresholds, target condition).
- **Holistic restrictions** — mass, height, width, length, speed, **lane availability**, **lane width** — viewed across every mode and network in one place.
- **Slice & dice** — a multi-mode **restrictions dashboard** + **ALV grid reports** to filter/group/aggregate by mode, network, restriction type, severity, authority, etc.

---

## 2. What exists today (baseline)

| Area | Today |
|------|-------|
| Bridges | `assetClass`, `route`, `state`, `region`, `condition`, `conditionRating (1-10)`, `structuralAdequacyRating (1-10)`, `importanceLevel (1-4)`, `averageDailyTraffic`, `postingStatus`, `highPriorityAsset`, `freightRoute`, `overMassRoute`, `nhvrAssessed` |
| Restrictions | `BridgeRestrictions`: category/type/value/unit, `grossMassLimit`, `axleMassLimit`, `heightLimit`, `widthLimit`, `lengthLimit`, `speedLimit`, vehicle class, direction, status, temporary, authority |
| Capacities | `BridgeCapacities`: GML/GCM, axle groups, lane clearances |
| **Gaps** | No **transport mode** / **network** dimension · no **lane availability** / **lane width** restriction · no **risk priority** · no **asset-class strategy** master |

Everything proposed below is **additive** (no field removed/renamed), soft-delete-aware, ChangeLog-tracked, and surfaced via the existing FE patterns.

---

## 3. ⭐ Risk Prioritisation & Asset-Class Strategy — Option 1 vs Option 2

This is the decision you asked to compare. Both make a **risk priority** visible on every
bridge and in the reports; they differ in *how much master data and governance* you take on.

### The two options at a glance

| | **Option 1 — Model in-app** | **Option 2 — Derive from existing data** |
|---|---|---|
| **What it is** | A real, editable **risk framework** + **asset-class strategy** master maintained by admins | A **computed risk score/band** from fields you already capture — no new master data |
| **Risk inputs** | Explicit **Consequence** (e.g. importance, ADT, mode criticality, detour cost) × **Likelihood** (condition, structural adequacy, age, defects) — each configurable | Existing `conditionRating`, `structuralAdequacyRating`, `importanceLevel`, `averageDailyTraffic` plugged into a fixed formula |
| **Risk output** | `riskScore` + `riskPriority` band (Very High…Low), **overridable** by an engineer with a reason | `riskScore` + `riskPriority` band, **read-only** (recomputed automatically) |
| **Asset-class strategy** | New `AssetClassStrategy` entity per class+mode: inspection interval, intervention thresholds, target condition, review cycle — bridges inherit & can override | None — strategy stays implicit / in people's heads; reports can still group by `assetClass` |
| **Who maintains it** | Admins configure the matrix & strategies (like the Attribute Classes screen) | Nobody — it's automatic |
| **Auditability** | Full: scores, overrides, strategy changes all in ChangeLog | Formula version only; inputs audited where they already are |
| **Effort** | Larger: 2 new entities + config screens + scoring engine + FE pages | Small: a few derived fields + one calculation handler |
| **Flexibility** | High — tune weightings, bands, per-class strategies without code | Low — formula change = code change |
| **Best when** | You want a governed, defensible, asset-management-grade framework (NHVR/ISO 55000 style) | You want a quick, useful risk ranking now and may formalise later |

### Plain-English summary
- **Option 2** is the fast path: "given what we already know about each bridge, here's its
  risk rank and which ones to act on first." Great for an immediate dashboard, but the
  logic is baked in and there's no formal strategy record.
- **Option 1** is the asset-management path: you define *how* risk is calculated and *what
  strategy* applies to each asset class/mode, admins maintain it, engineers can override
  with justification, and everything is audited. More to build, but it's a real,
  defensible framework that scales across modes and networks.

### Recommendation
**Phase it: start with Option 2's engine, wrap it in Option 1's governance.**
1. Implement the **derived score now** (Option 2) so the dashboard/ALV have a risk dimension immediately.
2. Make the **weightings & bands configurable** and add the **AssetClassStrategy** master + **engineer override** (Option 1) as the next step.
This gives value fast and grows into the governed framework without rework — the derived
score simply becomes the *default* that the configurable model can refine.

> **Decision needed from you**: Option 1, Option 2, or the phased recommendation above.

---

## 4. Proposed data model (additive)

### 4.1 Bridges — multi-modal + risk + strategy block

| Field | Type | Purpose |
|------|------|---------|
| `transportMode` | String(20) | Road / Rail / LightRail / Multi (value list) |
| `secondaryModes` | String(60) | comma list for shared structures (e.g. Road+Rail) |
| `network` | String(80) | owning network (e.g. State Road Network, Metro Rail, Light Rail) |
| `networkOperator` | String(111) | operator/authority for the network |
| `corridor` | String(111) | freight/passenger corridor grouping |
| `riskScore` | Decimal(6,2) | computed (and/or overridden) risk score |
| `riskPriority` | String(20) | band: Very High / High / Medium / Low |
| `riskConsequence` | Integer | 1–5 (Option 1) |
| `riskLikelihood` | Integer | 1–5 (Option 1) |
| `riskOverride` | Boolean | engineer override flag (Option 1) |
| `riskOverrideReason` | String(255) | justification (Option 1) |
| `riskAssessedAt` / `riskAssessedBy` | Timestamp / String | audit |
| `assetClassStrategy` | Association to `AssetClassStrategy` | governing strategy (Option 1) |

### 4.2 New: AssetClassStrategy (Option 1) — FE list/object page (draft)

```
entity AssetClassStrategy : cuid, managed {
  assetClass            : String(40);   // links to AssetClasses
  transportMode         : String(20);   // strategy can differ per mode
  name                  : String(111);
  inspectionIntervalMonths : Integer;
  targetConditionRating : Integer;      // 1-10
  interventionThreshold : Integer;      // condition at which action triggers
  reviewCycleMonths     : Integer;
  description           : LargeString;
  active                : Boolean default true;
}
```

### 4.3 New: RiskConfig (Option 1) — admin-tunable weightings & bands

```
entity RiskConfig : cuid, managed {
  factor   : String(40);   // condition | structural | importance | adt | modeCriticality
  weight   : Decimal(5,2);
  active   : Boolean default true;
}
entity RiskBand : cuid {
  band     : String(20);   // Very High / High / Medium / Low
  minScore : Decimal(6,2);
  maxScore : Decimal(6,2);
  colour   : String(20);
}
```

### 4.4 Holistic restrictions — extend BridgeRestrictions

| Field | Type | Purpose |
|------|------|---------|
| `transportMode` | String(20) | mode the restriction applies to (defaults from bridge) |
| `network` | String(80) | network context |
| `laneAvailability` | String(40) | e.g. "1 of 2 lanes", "Full closure", "Contraflow" |
| `lanesOpen` / `lanesTotal` | Integer | numeric lane availability for aggregation |
| `laneWidthLimit` | Decimal(9,2) | posted lane width (m) |
| `restrictionSeverity` | String(20) | Critical / Major / Minor (for dashboard) |

(Existing mass/height/width/length/speed limits already cover the other dimensions.)

---

## 5. Multi-mode Restrictions Dashboard

A new **"Network Restrictions"** dashboard tile (custom dashboard like the existing one, or FE Analytical) with cross-mode KPIs and charts:

- **KPI cards**: total active restrictions; by mode (Road/Rail/LightRail); critical/major/minor; full closures; lane reductions; permit-required count.
- **By mode & network**: stacked bar — restriction count per network split by mode.
- **By type**: donut — mass / height / width / lane / speed share.
- **Severity heat**: network × severity matrix.
- **Risk overlay**: count of restrictions on Very-High/High risk bridges.
- **Trend**: restrictions added/lifted over time (uses effectiveFrom/To).
- Drill-through from any KPI to the ALV report (pre-filtered).

---

## 6. Slice-and-dice ALV reporting

Reusing the **Fiori Elements List Report (ALV)** pattern just delivered for Change Documents:

### 6.1 Network Restrictions ALV (`NetworkRestrictionReport`)
A read-only view joining BridgeRestrictions + parent Bridge attributes so users can
filter/group/aggregate on one grid:

- **SelectionFields (slice)**: transportMode, network, state, region, restrictionType, restrictionSeverity, restrictionStatus, vehicleClass, riskPriority, authority, effective date range.
- **Columns (dice)**: bridge, mode, network, type, value+unit, lane availability, mass/height/width/length limits, severity, status, risk priority, authority, effective from/to.
- **Grouping/aggregation**: group by mode/network/type with counts; FE personalisation (sort, group, filter, column layout, variants) + Excel export — all built-in.

### 6.2 Bridge Risk ALV (`BridgeRiskReport`)
- Slice by mode, network, assetClass, riskPriority, condition band, importance.
- Columns: bridge, mode, network, asset class, strategy, condition, structural, importance, ADT, riskScore, riskPriority, last/next inspection.
- Drives the "what to act on first" worklist.

---

## 7. Phased implementation plan

| Phase | Scope | Builds on |
|------|------|-----------|
| **P1 — Multi-modal foundation** | Add `transportMode`/`network`/corridor to Bridges + restriction mode/network/lane fields; value lists; show on FE object pages; backfill existing as Road | additive schema |
| **P2 — Risk (Option 2 engine)** | Derived `riskScore`/`riskPriority` + show on Bridges & a Bridge Risk ALV | P1 |
| **P3 — Restrictions ALV + dashboard** | `NetworkRestrictionReport` FE ALV + multi-mode Network Restrictions dashboard | P1 |
| **P4 — Risk/Strategy governance (Option 1)** | `RiskConfig`/`RiskBand` tunable + `AssetClassStrategy` master + engineer override; FE admin screens | P2 |
| **P5 — Integration** | Link risk/strategy to external systems if required (reference blocks, like EAM) | P4 |

Each phase is independently deployable and testable end-to-end (same build/deploy/UAT loop used through v3.2.0).

---

## 8. Open questions for you

1. **Risk approach**: Option 1, Option 2, or the phased recommendation (§3)?
2. **Modes**: Road, Rail, Light Rail confirmed — add Pedestrian/Active-transport or Marine?
3. **Networks**: is there a defined list of networks/operators to seed, or free-text + lookup?
4. **Lane availability**: free-text ("1 of 2 lanes") + numeric (lanesOpen/Total), or a fixed code list?
5. **Severity**: who/what sets restriction severity — manual, or derived from the limit vs design capacity?
6. **Dashboard**: custom (like today's dashboard) or Fiori Elements Analytical List Page?
