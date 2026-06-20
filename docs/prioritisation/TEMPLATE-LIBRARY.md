# Prioritisation Template Library

> Standards-calibrated starting-point models per asset class, seeded as governed
> config (status `Template`) and instantiated into working models through the
> `instantiateTemplate` action. Seed source: `srv/lib/template-library-seed.js`.

## Why templates

The rule engine (`WeightedSumWithRules`) is fully configurable — criteria, value
bands, source bindings, per-class weights, missing-data policies and
non-compensatory rules are all data, not code. What separates a configurable
engine from a *usable* one is calibration: which criteria matter for a given
asset class, where the value-band breakpoints sit, and which conditions must
never be averaged away. The template library encodes that calibration from the
published practice of the leading bodies in each asset class, so a new
deployment starts from defensible, attributable settings instead of a blank
matrix.

Every criterion carries a `standardRef`; every non-compensatory rule carries a
written rationale. Nothing in a template is invented — where judgement was
required (weights), the value sits in the published-practice range and is
expected to be tailored per portfolio before activation.

## Governance workflow

1. **Browse** — Admin → Prioritisation Models → *Template library* tab.
2. **Instantiate** — *Create model from template* deep-copies the full bundle
   (criteria + bindings + value bands + class weights + rules) to a **new code,
   version 1, status Draft**, `isTemplate=false`. Provenance is stamped into
   `reviewSource`; sign-off fields restart empty. The template is never mutated.
3. **Tailor** — adjust weights, bands and policies to the portfolio in the
   model builder (every edit is ChangeLogged; weight edits apply to future runs
   only).
4. **Review & activate** — record sign-off, set status Active. Past runs remain
   immutable and reproducible against their frozen `paramSnapshot` /
   `weightSetHash`.

Templates are excluded from Active-model resolution by construction
(status `Template`), so seeding them changes no scoring behaviour.

## The twelve templates (six industry sectors)

| Code | Sector | Scope | Standards basis |
|------|--------|-------|-----------------|
| `TPL-BRIDGE-INTL-V1` | Transport | Bridges & major structures | AS 5100.7; Austroads AGBM; AASHTO MBE (LRFR); FHWA SNBI/HEC-18; CS 454 |
| `TPL-ROAD-PAVEMENT-V1` | Transport | Sealed road pavements | Austroads AGAM/AGPT; ASTM E1926 (IRI); AusRAP/iRAP; ISO 55000; IPWEA IIMM |
| `TPL-RAIL-TRACK-V1` | Transport | Rail track & formation | EN 13848-5; UIC 714; AREMA; RISSB AS 7635; ONRSR SFAIRP |
| `TPL-TUNNEL-V1` | Transport | Road & rail tunnels | PIARC Road Tunnels Manual; EU 2004/54/EC; NFPA 502 |
| `TPL-MINE-TSF-V1` | Mining | Tailings storage facilities | GISTM (2020); ANCOLD; ICOLD B194; ISO 31000 |
| `TPL-MINE-HAUL-V1` | Mining | Haul roads & site circuits | Thompson & Visser methodology; ISO 17757 |
| `TPL-CULVERT-V1` | Infrastructure | Culverts & stormwater structures | FHWA Culvert Inspection Manual; Austroads AGRD 5/5A; ARR 2019; IPWEA IIMM |
| `TPL-WATER-MAINS-V1` | Government | Water distribution mains | ISO 24516-1; AWWA M28; IPWEA IIMM; WSAA |
| `TPL-GOVT-FACILITIES-V1` | Government | Public buildings & facilities | IPWEA IIMM; APPA FCI; NCC; AS 1851; ISO 41001 |
| `TPL-WATER-DAM-V1` | Government | Water supply & flood mitigation dams | ANCOLD; ICOLD; state dam-safety regulation |
| `TPL-POWER-POLES-V1` | Energy | Distribution poles & towers | AS/NZS 7000; Energy Networks Australia practice; ISO 55000 |
| `TPL-MARINE-WHARF-V1` | Maritime | Wharves, jetties & marine structures | PIANC; AS 4997; ASCE/COPRI waterfront practice |

## Calibration highlights (the expert intent, per template)

**Bridges (`TPL-BRIDGE-INTL-V1`).** Condition band and AASHTO load-rating factor
anchor likelihood; scour (FHWA HEC-18 — the leading cause of bridge collapse)
and fracture-criticality escalate non-compensatorily. Critical condition floors
at P1, Very Poor at P2; RF < 1.0 (posting territory) cannot rank below P2.
Confidence decays past the 24-month Level-2 inspection cycle.

**Road pavements (`TPL-ROAD-PAVEMENT-V1`).** IRI, rutting (12 mm aquaplaning
threshold), cracking and skid resistance lead; skid below investigatory level is
the pavement parameter most directly correlated with casualty crashes, so it
floors at P2 with review hold and its missing-data policy *penalises* rather
than excuses (`penalise:60`). AusRAP star rating carries the safety consequence.

**Rail track (`TPL-RAIL-TRACK-V1`).** EN 13848 geometry quality (QN levels) is
the spine — QN3 (immediate action) floors at P1. Ultrasonic defect density, the
principal broken-rail precursor, escalates with review hold. Consequence scales
with UIC 714 tonnage, line speed and passenger / dangerous-goods exposure.
Unknown geometry is penalised (`penalise:80`) — untested track is not assumed
healthy.

**Tailings facilities (`TPL-MINE-TSF-V1`).** Consequence-led per GISTM: an
Extreme ANCOLD category facility is *pinned* to P1 regardless of condition
(Veto rule) — consequence of failure dominates. Stability below criteria floors
at P1 with EoR review; upstream raises escalate one band (ICOLD B121 failure
statistics). Most policies are `penalise`: for dam safety, unknown is unsafe.

**Haul roads (`TPL-MINE-HAUL-V1`).** Thompson & Visser functional design:
rolling resistance drives cost; geometry non-compliance against the largest
operating vehicle floors at P2 (rollover/collision precursor); chronic
dust/visibility impairment escalates — vehicle interaction dominates surface
mining fatality statistics. Confidence half-life is short (6 months).

**Culverts (`TPL-CULVERT-V1`).** Deliberately conservative condition floor (P1
at Critical with review): culverts fail suddenly and invisibly under live
traffic. Hydraulic deficiency against the ARR 2019 design storm escalates as an
embankment-failure precursor. Consequence scales with road class above and
embankment height (stored failure energy).

**Water mains (`TPL-WATER-MAINS-V1`).** AWWA break-rate benchmarking plus
material-cohort survival analysis on likelihood; customers served, critical
customers and trunk role on consequence. Multiple critical customers (hospitals,
dialysis) escalate one band — supply continuity is a clinical-safety issue.

**Government facilities (`TPL-GOVT-FACILITIES-V1`).** APPA Facility Condition
Index anchors condition; major statutory life-safety gaps (NCC, AS 1851 fire,
egress) floor at P1 — legal obligations are not trade-offs. Consequence follows
service criticality, occupancy and community dependency.

**Wharves & marine structures (`TPL-MARINE-WHARF-V1`).** Pile section loss —
including accelerated low-water corrosion, the dominant hidden failure mode of
steel piles — is penalised when unmeasured. Operating beyond rated deck
capacity escalates with review hold; severe structural condition on a live
berth floors at P1. Underwater inspection confidence decays over the 5-year
PIANC dive cycle.

**Distribution poles & towers (`TPL-POWER-POLES-V1`).** AS/NZS 7000 residual
strength anchors likelihood (condemnable poles floor at P1); the consequence
axis is dominated by bushfire ignition — Extreme bushfire-zone assets escalate
with review hold, reflecting that asset-initiated ignition is the catastrophic
loss scenario for distribution networks.

**Tunnels (`TPL-TUNNEL-V1`).** Civil condition plus a life-safety systems axis:
major NFPA 502 / EU-directive fire-safety gaps floor at P1 (the post-Mont-Blanc
lesson), and degraded ventilation/detection escalates because those systems are
the consequence-control layer for every other tunnel risk. Consequence scales
with traffic, tube length (egress difficulty) and dangerous-goods policy.

**Dams (`TPL-WATER-DAM-V1`).** ANCOLD portfolio practice: Extreme-consequence
dams pin to P1 (Veto); spillway deficiency against the acceptable flood — the
dominant historical failure mechanism — floors at P1; internal-erosion
precursors (turbid seepage, new exit points) escalate with dam-engineer review
hold. Unknown stability or spillway status is penalised, not excused.

## Attribute catalogue (makes templates functional)

Templates bind their criteria to three kinds of source:

- **`BridgeField`** — live core-register columns (`conditionRating`,
  `averageDailyTraffic`). Resolve immediately, no setup.
- **`Attribute`** — configurable register facts (`IRI_MKM`, `ANCOLD_CATEGORY`,
  `PILE_SECTION_LOSS_PCT`…). The **56 attributes** all templates reference are
  seeded as governed `AttributeDefinitions` (`srv/lib/template-attributes-seed.js`,
  derived from the templates themselves), grouped by sector and enabled for the
  asset register. They appear in the Attributes admin screen and mass-upload, and
  the rule engine resolves them per asset. The 26 discrete ones carry their
  allowed values (e.g. ANCOLD Low…Extreme). Without these definitions an
  instantiated non-bridge model would score all-missing — seeding them is what
  turns the verticals from present to functional.
- **`Manual`** — per-asset engineering judgement entered on the Assess screen
  (seismic vulnerability, freight importance…). Not catalogue attributes.

Demo mode populates the bridge-template attributes (`LOAD_RATING_FACTOR`,
`SCOUR_STATUS`, `FATIGUE_CLASS`, `DESIGN_LIFE_CONSUMED_PCT`, `DETOUR_LENGTH_KM`)
on each demo bridge — derived from its engineering fields — so the flagship
template scores on ~7 of 12 criteria out of the box.

**Register scope (honest note):** the asset register entity is bridge-shaped.
The prioritisation engine, templates and attribute catalogue are all
asset-class-agnostic (proven: the pavement template scores end-to-end against a
non-bridge asset with its attribute values — `test/template-attributes.test.js`).
Modelling full non-bridge registers (pavement-specific, dam-specific fields) is a
documented future extension; the prioritisation layer is ready for it today.

## Engineering contract

- **Seeding** — insert-if-missing keyed on fixed deterministic UUIDs
  (`00000000-0000-4000-8<t><k>0-<seq>`), parent-first order, every insert
  ChangeLogged. Existing rows — including admin-edited copies — are never
  touched. Append new spec rows only; never reorder or renumber released rows.
- **No behaviour change at seed time** — templates carry status `Template` and
  are invisible to model resolution and `scoreFleet`.
- **Bindings** — the bridge template binds to live register fields
  (`conditionRating`, `averageDailyTraffic`); other templates bind to named
  custom attributes (e.g. `IRI_MKM`, `ANCOLD_CATEGORY`) or `Manual` judgement
  inputs. Missing data follows each criterion's declared policy — never a
  silent zero.
- **Tests** — `test/template-library.test.js`: seed integrity (UUID uniqueness,
  cross-namespace collision, referential integrity, JSON validity, band
  coherence, one-binding-one-weight per criterion, safety-rule presence),
  runtime seeding (idempotency, full bundle, no Active leakage), and the
  `instantiateTemplate` action (deep copy, provenance, duplicate-code /
  non-template / missing-code rejections).
