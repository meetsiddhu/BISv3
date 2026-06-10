# Gap Analysis — BIS Rule Engine vs TfNSW Bridge Prioritisation (PS224353, May 2026)

Compared artefacts: **Bridges_Prioritisation Calculator v1.0** (Excel, 3,584-row interim tool, Vulnerability+Criticality MCA, 9 user types, hurdle rates) and **Final Report v1.0** (22pp: framework, data quality, Power BI portfolio of 11,850 bridges) vs **BIS v3.10.0** (NSW-PACK-V1/NSW-RISK-V1 configurable rule engine).

## A. What TfNSW's framework has that BIS is missing (real gaps — adopt)

| # | Gap | Their design | BIS today | Action |
|---|---|---|---|---|
| G1 | **Customer user-type axis** | Every Criticality criterion scored per 9 user types (Road-Passenger, HV Class 2&3, HV Class 1, Rail-Passenger, Rail-Freight, Pedestrians, Cyclists, **Water-Passenger, Water-Freight**) with user-type weightings (active = 0.5) | Deferred at Phase 0 Q4; criteria weighted per asset class+mode only | Build `UserType` + `UserTypeCriterionWeight` (the deferred axis — their framework proves it's required); seed their 9 types + weights |
| G2 | **Over/Under-bridge axis** | Same structure scored separately for users ON vs UNDER it (e.g. rail under a road overbridge), weighting per axis | `secondaryModes` + MODAL_INTERDEP only | Add over/under dimension to the user-type weight table |
| G3 | **Pre-filter (eligibility gate)** | Exclude BEFORE scoring: not TfNSW responsibility · already approved for renewal · recently upgraded · fauna crossings · age<50 (configurable) | No eligibility concept — everything is scoreable | Add config `PreFilter` rules (new AggregationRule type `Exclude` evaluated portfolio-level) + worklist filter |
| G4 | **Fleet batch scoring + full ranking** | 3,534 bridges scored in one pass from data alone; output = RANK 1..N | One-at-a-time engineer assessment; bands only | Add `scoreFleet` batch action (auto criteria only, missing-data flags preserved) producing ranked immutable runs + rank column |
| G5 | **Network safety criterion (NWS)** | Emergency management/evacuation function; safety-by-design (grade/modal separation, level-crossing avoidance) | Absent | Add NWS to the catalogue (Attribute-bound; no schema change) |
| G6 | **Richer SIR semantics** | Safety incidents AND restrictions combined: severity × frequency × recency of restriction-causing events | INCIDENTS (count) + POSTING (active count) separately | Add severity/recency bands to INCIDENTS binding (BridgeRestrictions history is already in BIS — we can compute this BETTER than their manual attribute) |
| G7 | **Remaining lifespan as proportion** | RUL ÷ design life, adjusted for major maintenance | `estimatedRulYears` absolute | Add proportional variant band set (derived: RUL/designLife) |
| G8 | **Portfolio data-readiness matrix** | Per criterion × user type availability/confidence rating (their p22) — drives the "interim criteria" flag | Per-run flags only | Add a data-readiness report: % of fleet with data per criterion (one OData aggregate + a screen/PDF section) |
| G9 | **Geographic ranked-portfolio dashboard** | Power BI: 11,850 bridges by location/owner/custodian/maintainer + ranked results | Map View (register) + Network Portfolio; no ranked-band map layer | Colour Map View by priority band; longer-term the Datasphere/SAC dashboards (design Later horizon) |

PT routes nuance (seat-km, school-bus routes), water-transport criteria, and TACP-vs-BIS register mapping ride on G1's user-type data once added.

## B. What BIS has that their tool lacks (we are ahead — keep)

1. **Non-compensatory guardrails.** Their MCA is purely additive (TOTAL = Vulnerability + Criticality): a structurally dangerous bridge with low customer scores **can be buried** — the exact failure our SafetyFloor/Escalate/HurdleMin rules prevent.
2. **Missing data is never a silent zero.** Their own Notes admit BHI is blank and RUL/AADT missing, yet the TOTAL still sums and ranks — blanks silently contribute nothing (rank distortion). BIS policies (flag/neutral/penalise/exclude) + 24 live flags per run make gaps visible and governable. *(Their "Interim Criteria" flag is a manual label; ours is enforced per evaluation.)*
3. **Auditability/reproducibility.** Excel has no immutable runs, no version/hash stamping, no ChangeLog, no RBAC — any cell edit silently rewrites history. Every BIS run reproduces byte-identically with model+version+weight-set hash.
4. **Config-as-data.** Their logic lives in LET/INDEX array formulas only the author can safely maintain; BIS criteria/weights/bands/bindings/rules are governed rows with an admin Model Builder + sign-off.
5. **Engineering judgement layer.** Manual criteria with rubric anchors + mandatory logged overrides — their tool is data-only; ours blends data + engineer judgement defensibly.
6. **Per-asset-class models, EAM work-request integration, server-rendered exec one-pager, bands (P1–P5), 197 automated tests, clean-core platform.** Their output is a raw rank 1..3,534 with no banding, no action path.

## C. Tool verdict (the honest call-out)

- **Their Excel calculator is explicitly an *interim* tool** (their own roadmap says so) — right for a one-off fleet pass, wrong as a system of record: unauditable, single-author-maintainable, silent-zero on missing data, no guardrails, no access control, breaks at concurrency.
- **Power BI is a good visualisation layer, not a prioritisation engine.** Keep it if the org likes it: point it at BIS OData (`/odata/v4/prioritisation/Assessments`) so it visualises *governed, reproducible* runs instead of spreadsheet cells. Strategically the BIS design already reserves Datasphere/SAC for this (solution design, Later horizon).
- **BIS is the better tool for the ongoing capability** — but only becomes the better *methodology* once it adopts their customer dimension. The decisive move: **seed their exact framework as `TFNSW-CUSTOMER-V1`** in our engine (13 criteria mapped: BHI✓, SIR→enriched INCIDENTS+POSTING, RLS→RUL-proportional, HES→HERITAGE✓, NWR→NETWORK_ROLE✓, NWS→new, PTR→PT_DEPEND+, TDL→TRAFFIC+HEAVY_PCT✓, RAL→DETOUR✓, MID→MODAL_INTERDEP✓, PCI→CRIT_SERVICES✓, TPC→UTILITIES✓, COI→ISOLATION✓) + the user-type axis + pre-filter + batch ranking — giving TfNSW their approved methodology inside a governed, auditable, EAM-integrated system instead of a spreadsheet.

## D. Recommended build order
1. **G1+G2** UserType axis + over/under (schema additive: 2 entities; engine: second weighting pass) — unlocks their whole framework.
2. **G4** fleet batch scoring + rank — makes BIS do what the calculator does, at 11,850-scale, with flags + immutability the Excel can't offer.
3. **G3** pre-filter rules; **G8** data-readiness report (their two best portfolio mechanics).
4. **G5–G7** criteria refinements + `TFNSW-CUSTOMER-V1` seed; **G9** band-coloured map.
