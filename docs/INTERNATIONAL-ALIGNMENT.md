# International Bridge-Management Alignment (AASHTO / FHWA NBI / PIARC / Eurocode)

> Addresses 4th-audit findings **AASHTO-1**, **COND-1**, **CAPA-1**, **DET-1**, **PIARC-1**.
> BIS is built in the **NSW/TfNSW + Austroads + AS 5100** context and **complements SAP
> S/4HANA EAM**. This doc maps BIS concepts to the major international BMS standards, states
> what aligns by capability, and is explicit about deliberate gaps (no false precision).

## 1. Condition-scale mapping (COND-1)

BIS stores the legacy BMS **1–10** condition rating (10 = best), labels it on the **TfNSW
1–5** band, and can be expressed on the **AASHTO/FHWA 0–9 NBI** and **AASHTO MBE element
0–5 (CS1–CS4)** scales for international reporting. The canonical mapping lives in
`srv/lib/condition-rating.js` (single source of truth — never re-defined inline).

| BIS 1–10 | TfNSW 1–5 band | NBI 0–9 (approx) | AASHTO element state | Meaning |
|:--:|:--:|:--:|:--:|---|
| 9–10 | 1 (Good) | 8–9 | CS1 Good | As-new / no significant defects |
| 7–8 | 2 (Fair) | 6–7 | CS1–CS2 | Minor deterioration |
| 5–6 | 3 (Poor) | 5 | CS2 Fair | Moderate; monitor |
| 3–4 | 4 (Very Poor) | 3–4 | CS3 Poor | Significant; intervention planning |
| 1–2 | 5 (Critical) | 0–2 | CS4 Severe | Severe; urgent action / load review |

> The mapping is a documented planning correspondence, not an automatic re-coding. NBI/MBE
> partial factors and US-specific load models are **not** pre-seeded (AU context). If US
> scope is added, `ratingStandardType` (CAPA-1) selects the basis and NBI translation is a
> config item.

## 2. Load-rating standard (CAPA-1)

`Bridges.ratingStandardType` (default **AS5100**; AASHTO | Eurocode | Other) records which
evaluation standard a load rating follows. Capacity assessment data lives in
`BridgeCapacities` (AS 5100.7 framework). Full fatigue/strength evaluation per AASHTO MBE
LRFR or Eurocode EN 1990–1991 partial-factor analysis is **deferred to specialist tools /
EAM** — BIS records the rating + provenance, it does not run the structural analysis engine.

## 3. Deterioration modelling (DET-1)

`AssetClassStrategy.deteriorationModel` (default **Linear**; Markov | Custom) declares the
model class per asset-class/mode. Today BIS uses a **transparent linear RUL proxy**
(`estimatedRulYears = (condition − 1) / degradationRatePerYear`), surfaced as **advisory**
and assumption-flagged — deliberately NOT folded into the core risk score (no false
precision vs an AASHTOWare-BrM Markov transition matrix).

**History feed for future calibration:** every condition change is captured in `ChangeLog`
(rule 3), so a future Markov/Weibull calibration has the historical condition-state series
without a new snapshot store. When `deteriorationModel = Markov`, a transition-matrix module
can consume that history — scaffolded, not yet active.

## 4. Network-level / portfolio analysis (NET-1, PIARC-1)

`NetworkPortfolioReport` aggregates per network + transport mode: bridge count, avg
condition, avg risk score, high-risk/overdue/intervention-due counts, and total
expected-value + mitigation cost — the **PIARC / Austroads AGAM network view** for capital
prioritisation, on top of the per-bridge `BridgeRiskReport` worklist.

## 5. Standards correspondence (capability view)

| Standard | BIS alignment | Deliberate gap |
|---|---|---|
| **AASHTO MBE** (evaluation) | load-rating record + `ratingStandardType`; capacity model | LRFR partial-factor computation (specialist/EAM) |
| **AASHTOWare BrM / Pontis** | element hierarchy + condition + network portfolio | Markov deterioration + full optimisation (scaffolded) |
| **FHWA NBI / NBIS** | condition-scale mapping (§1); inspection records | NBI 0–9 storage + biennial federal submission (US scope) |
| **PIARC / fib** | risk-based prioritisation + lifecycle + network view | — (capability aligned) |
| **Eurocode EN 1990/1991** | importance + capacity modelled | EU partial factors (AU context) |

**Honest position:** BIS matches commercial BMS on register, condition, element-level
inspection, risk prioritisation, restrictions, GIS, network portfolio, and capital signals.
The deliberate gap vs AASHTOWare-BrM-class tools is **probabilistic deterioration** — BIS
uses a transparent, assumption-flagged linear proxy and documents it as such, with the
Markov path scaffolded (`deteriorationModel`) and the data feed (ChangeLog history) in place.
