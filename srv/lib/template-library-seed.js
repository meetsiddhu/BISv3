'use strict'

// ─────────────────────────────────────────────────────────────────────────────
// Prioritisation Template Library — seeded, standards-calibrated starting-point
// models per asset class across Transport, Infrastructure, Mining and Government
// sectors. Each template encodes the published practice of the leading bodies in
// that asset class (Austroads, AASHTO, FHWA, EN 13848/UIC, GISTM/ANCOLD/ICOLD,
// ISO 24516/AWWA, IPWEA IIMM/APPA, NCC/AS 1851) as governed CONFIG — criteria,
// value bands, source bindings, per-class weights, missing-data policies and
// non-compensatory rules — never as code.
//
// Templates are seeded with status='Template' + isTemplate=true so the engine's
// Active-model resolution ignores them. An admin instantiates one through the
// instantiateTemplate action (deep clone → new code, version 1, status Draft),
// tailors weights/bands to the portfolio, and activates it after review.
//
// Seeding contract (mirrors model-builder-seed.js): insert-if-missing keyed on
// fixed deterministic UUIDs; existing rows — including admin-edited copies of
// seed rows — are never touched; every insert is ChangeLogged (rule 3).
// The UUID of a spec row is a pure function of (template ordinal, entity kind,
// sequence) — append new rows at the end of a template's lists; never reorder
// or re-number released rows.
// ─────────────────────────────────────────────────────────────────────────────

const cds = require('@sap/cds')
const { SELECT, INSERT } = cds.ql
const { writeChangeLogs } = require('../audit-log')

const NS = 'bridge.management.'

const TABLES = [
  'PrioritisationModel',
  'ModelCriterion',
  'CriterionSourceBinding',
  'CriterionValueBand',
  'AssetClassCriterionWeight',
  'AggregationRule'
]

// Deterministic UUID: 00000000-0000-4000-8<t><k>0-<seq as 12 hex digits>
// t = template ordinal (1..f), k = entity kind (0 model, 1 criterion, 2 binding,
// 3 band, 4 weight, 5 rule). Stable across releases by construction.
const uid = (t, kind, seq) =>
  `00000000-0000-4000-8${t.toString(16)}${kind}0-${seq.toString(16).padStart(12, '0')}`

// Level1to5 rubric helper: 5 labels → rubric JSON + standard 20..100 score bands.
const L5_SCORES = { 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 }

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE SPECS
// criterion: { code, name, category, valueType, standardRef, description,
//              levels: [l1..l5]            (Level1to5 → rubric + 20..100 bands)
//              bands: [[lo,hi,score,label]] (Numeric)
//              bands: [[text,score]]        (Discrete)
//              binding: {sourceType, sourceRef, unit, transform},
//              weight (0-10), policy (flag|neutral|penalise[:n]|exclude) }
// rule: { ruleType, criterion (code|null), config (object), rationale, priority }
// ─────────────────────────────────────────────────────────────────────────────
const TEMPLATES = [

  // ═══ 1. BRIDGES & MAJOR STRUCTURES ════════════════════════════════════════
  {
    t: 1,
    code: 'TPL-BRIDGE-INTL-V1',
    name: 'Bridges & Major Structures — International Practice',
    sector: 'Transport',
    scope: 'Bridges, major culverts & gantry structures',
    standards: 'AS 5100.7; Austroads AGBM; AASHTO MBE (LRFR); FHWA SNBI/HEC-18; CS 454',
    description: 'Condition-and-consequence model encoding the converged practice of AS 5100.7 ' +
      'condition states, AASHTO MBE load-and-resistance factor rating, FHWA scour (HEC-18) and ' +
      'fracture-criticality screening, with network consequence per Austroads AGAM. Safety floors ' +
      'are non-compensatory: a Critical structure can never be averaged out of the top bands.',
    criteria: [
      { code: 'COND_OVERALL', name: 'Overall condition', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'AS 5100.7; FHWA SNBI', description: 'Stored legacy 1-10 rating (10 = best); banded to the 1-5 condition scale.',
        bands: [[8.5, 10, 10, 'Good (band 1)'], [6.5, 8.49, 30, 'Fair (band 2)'], [4.5, 6.49, 55, 'Poor (band 3)'], [2.5, 4.49, 80, 'Very Poor (band 4)'], [1, 2.49, 100, 'Critical (band 5)']],
        binding: { sourceType: 'BridgeField', sourceRef: 'conditionRating', unit: 'rating(1-10)' },
        weight: 3.0, policy: 'flag' },
      { code: 'LOAD_RATING', name: 'Load rating factor (RF)', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'AASHTO MBE LRFR; AS 5100.7', description: 'Governing rating factor at legal loads. RF < 1.0 indicates posting territory.',
        bands: [[1.3, 99, 10, 'RF ≥ 1.3 — ample reserve'], [1.0, 1.299, 40, 'RF 1.0–1.3'], [0.8, 0.999, 75, 'RF < 1.0 — posting territory'], [0, 0.799, 100, 'RF < 0.8 — restricted/critical']],
        binding: { sourceType: 'Attribute', sourceRef: 'LOAD_RATING_FACTOR', unit: 'ratio' },
        weight: 2.5, policy: 'flag' },
      { code: 'SCOUR', name: 'Scour vulnerability', category: 'Likelihood', valueType: 'Discrete',
        standardRef: 'FHWA HEC-18', description: 'Waterway-crossing scour screening outcome. Scour is the leading cause of bridge collapse worldwide.',
        bands: [['Stable', 10], ['Monitored', 55], ['Scour-critical', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'SCOUR_STATUS' },
        weight: 2.0, policy: 'penalise:60' },
      { code: 'FATIGUE_FC', name: 'Fatigue / fracture criticality', category: 'Likelihood', valueType: 'Discrete',
        standardRef: 'AASHTO MBE §6A.6', description: 'Presence of fatigue-prone or fracture-critical (non-redundant tension) details.',
        bands: [['None', 10], ['Monitored', 60], ['Fracture-critical', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'FATIGUE_CLASS' },
        weight: 1.5, policy: 'flag' },
      { code: 'SEISMIC', name: 'Seismic vulnerability', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'AS 1170.4; AASHTO seismic', description: 'Site hazard × structural era screening (pre-modern detailing scores high).',
        levels: ['Modern design, low hazard', 'Modern design, moderate hazard', 'Older design, low hazard', 'Older design, moderate hazard', 'Non-ductile detailing, high hazard'],
        binding: { sourceType: 'Manual', sourceRef: 'seismicVulnerability' },
        weight: 1.0, policy: 'neutral' },
      { code: 'AGE_CONSUMED', name: 'Design life consumed', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'ISO 55000 lifecycle', description: 'Percentage of design life consumed.',
        bands: [[0, 50, 10, '< 50%'], [50, 75, 35, '50–75%'], [75, 90, 60, '75–90%'], [90, 100, 80, '90–100%'], [100, 999, 100, 'Beyond design life']],
        binding: { sourceType: 'Attribute', sourceRef: 'DESIGN_LIFE_CONSUMED_PCT', unit: '%' },
        weight: 1.0, policy: 'neutral' },
      { code: 'TRAFFIC', name: 'Traffic volume (AADT)', category: 'Consequence', valueType: 'Numeric',
        standardRef: 'Austroads AGAM', description: 'Annual average daily traffic carried.',
        bands: [[0, 1000, 10, '< 1k'], [1000, 10000, 35, '1–10k'], [10000, 40000, 60, '10–40k'], [40000, 90000, 80, '40–90k'], [90000, 9999999, 100, '> 90k']],
        binding: { sourceType: 'BridgeField', sourceRef: 'averageDailyTraffic', unit: 'veh/day' },
        weight: 2.0, policy: 'neutral' },
      { code: 'FREIGHT', name: 'Freight network importance', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'NHVR network; Austroads freight', description: 'Importance to the heavy-vehicle network (HML / OSOM corridors score high).',
        levels: ['Local access only', 'Secondary freight', 'Regional freight route', 'Key freight corridor', 'Critical HML/OSOM corridor'],
        binding: { sourceType: 'Manual', sourceRef: 'freightImportance' },
        weight: 2.0, policy: 'neutral' },
      { code: 'DETOUR_KM', name: 'Detour length', category: 'Consequence', valueType: 'Numeric',
        standardRef: 'FHWA sufficiency-rating practice', description: 'Shortest practical detour if the structure is closed.',
        bands: [[0, 5, 10, '< 5 km'], [5, 20, 40, '5–20 km'], [20, 50, 70, '20–50 km'], [50, 99999, 100, '> 50 km / no detour']],
        binding: { sourceType: 'Attribute', sourceRef: 'DETOUR_LENGTH_KM', unit: 'km' },
        weight: 1.5, policy: 'neutral' },
      { code: 'COMMUNITY', name: 'Community access criticality', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'ISO 55000; IPWEA IIMM', description: 'Sole-access and community severance consequence of closure.',
        levels: ['Multiple alternatives', 'Minor inconvenience', 'Material detour burden', 'Limited alternative access', 'Sole access — community severed'],
        binding: { sourceType: 'Manual', sourceRef: 'communityCriticality' },
        weight: 1.5, policy: 'neutral' },
      { code: 'UTILITIES', name: 'Services carried', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'IPWEA IIMM', description: 'Water / power / comms utilities carried by the structure.',
        levels: ['None', 'Minor comms', 'Local distribution', 'Major utility', 'Trunk lifeline services'],
        binding: { sourceType: 'Manual', sourceRef: 'utilitiesCarried' },
        weight: 0.5, policy: 'exclude' },
      { code: 'HERITAGE', name: 'Heritage significance', category: 'Modifier', valueType: 'Level1to5',
        standardRef: 'Burra Charter practice', description: 'Heritage listing / significance (raises intervention complexity).',
        levels: ['None', 'Local interest', 'Local listing', 'State listing', 'National/world significance'],
        binding: { sourceType: 'Manual', sourceRef: 'heritageSignificance' },
        weight: 0.5, policy: 'exclude' }
    ],
    rules: [
      { ruleType: 'SafetyFloor', criterion: 'COND_OVERALL', config: { when: '>=90', floorBand: 'P1', forceReview: true },
        rationale: 'A structure in Critical condition (band 5) can never be compensated below P1 — AS 5100.7 / AASHTO MBE practice.', priority: 1 },
      { ruleType: 'SafetyFloor', criterion: 'COND_OVERALL', config: { when: '>=75', floorBand: 'P2' },
        rationale: 'Very Poor condition (band 4) floors at P2 regardless of consequence scores.', priority: 2 },
      { ruleType: 'Escalate', criterion: 'SCOUR', config: { on: 'raw', when: '==Scour-critical', raiseBands: 1, forceReview: true },
        rationale: 'FHWA HEC-18: scour-critical structures escalate one band and are held for engineering review.', priority: 3 },
      { ruleType: 'HurdleMin', criterion: 'LOAD_RATING', config: { when: '>=75', capBand: 'P2' },
        rationale: 'RF < 1.0 (posting territory) cannot rank below P2 — load-posting is an active safety control.', priority: 4 },
      { ruleType: 'ConfidenceWeight', criterion: null, config: { maxAgeMonths: 24, floor: 0.5 },
        rationale: 'Austroads AGBM Level 2 inspection cycle: data older than 24 months decays toward half confidence.', priority: 9 }
    ]
  },

  // ═══ 2. SEALED ROAD PAVEMENTS ═════════════════════════════════════════════
  {
    t: 2,
    code: 'TPL-ROAD-PAVEMENT-V1',
    name: 'Sealed Road Pavements — Network Asset Management',
    sector: 'Transport',
    scope: 'Sealed road pavements & surfacings',
    standards: 'Austroads AGAM/AGPT; ASTM E1926 (IRI); AusRAP/iRAP; ISO 55000; IPWEA IIMM',
    description: 'Pavement prioritisation per Austroads asset-management and pavement-technology ' +
      'guides: ride quality (IRI), rutting, cracking and skid resistance on the condition axis; ' +
      'traffic loading, functional class and AusRAP safety risk on the consequence axis. Skid ' +
      'resistance below investigatory level is treated as a non-compensatory safety floor.',
    criteria: [
      { code: 'IRI', name: 'Roughness (IRI)', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'ASTM E1926; Austroads AGAM', description: 'Lane IRI in m/km; intervention thresholds per Austroads network practice.',
        bands: [[0, 2, 5, '< 2 — very good ride'], [2, 3, 25, '2–3'], [3, 4, 50, '3–4'], [4, 5.5, 75, '4–5.5 — intervention'], [5.5, 99, 100, '> 5.5 — poor']],
        binding: { sourceType: 'Attribute', sourceRef: 'IRI_MKM', unit: 'm/km' },
        weight: 2.5, policy: 'flag' },
      { code: 'RUTTING', name: 'Rut depth', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'Austroads AGPT; aquaplaning threshold', description: 'Mean rut depth; > 12 mm risks water ponding and aquaplaning.',
        bands: [[0, 8, 10, '< 8 mm'], [8, 12, 40, '8–12 mm'], [12, 20, 70, '12–20 mm — aquaplaning risk'], [20, 999, 100, '> 20 mm']],
        binding: { sourceType: 'Attribute', sourceRef: 'RUT_DEPTH_MM', unit: 'mm' },
        weight: 2.0, policy: 'flag' },
      { code: 'CRACKING', name: 'Surface cracking', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'Austroads visual condition', description: 'Cracked area as % of lane area — moisture-ingress precursor to structural failure.',
        bands: [[0, 2, 10, '< 2%'], [2, 5, 35, '2–5%'], [5, 15, 65, '5–15%'], [15, 100, 100, '> 15%']],
        binding: { sourceType: 'Attribute', sourceRef: 'CRACKED_AREA_PCT', unit: '%' },
        weight: 1.5, policy: 'neutral' },
      { code: 'SKID', name: 'Skid resistance vs investigatory level', category: 'Likelihood', valueType: 'Discrete',
        standardRef: 'Austroads skid management; CS 228', description: 'Measured friction against the site-category investigatory level (IL).',
        bands: [['Above IL', 10], ['At IL', 60], ['Below IL', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'SKID_VS_IL' },
        weight: 2.5, policy: 'penalise:60' },
      { code: 'STRUCT_LIFE', name: 'Remaining structural life', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'Austroads AGPT Part 5 (FWD)', description: 'Deflection-derived remaining structural life.',
        bands: [[50, 100, 10, '> 50% remaining'], [25, 50, 40, '25–50%'], [10, 25, 70, '10–25%'], [0, 10, 100, '< 10%']],
        binding: { sourceType: 'Attribute', sourceRef: 'STRUCT_LIFE_REMAIN_PCT', unit: '%' },
        weight: 1.5, policy: 'flag' },
      { code: 'MAINT_INTENSITY', name: 'Reactive maintenance intensity', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'IPWEA IIMM', description: 'Reactive maintenance spend vs network mean — a leading indicator of terminal condition.',
        levels: ['Well below mean', 'Below mean', 'At mean', 'Above mean', 'Far above mean — terminal'],
        binding: { sourceType: 'Manual', sourceRef: 'maintenanceIntensity' },
        weight: 1.0, policy: 'neutral' },
      { code: 'TRAFFIC', name: 'Traffic volume (AADT)', category: 'Consequence', valueType: 'Numeric',
        standardRef: 'Austroads AGAM', description: 'Annual average daily traffic.',
        bands: [[0, 1000, 10, '< 1k'], [1000, 10000, 35, '1–10k'], [10000, 40000, 60, '10–40k'], [40000, 90000, 80, '40–90k'], [90000, 9999999, 100, '> 90k']],
        binding: { sourceType: 'Attribute', sourceRef: 'AADT', unit: 'veh/day' },
        weight: 2.0, policy: 'neutral' },
      { code: 'HV_PCT', name: 'Heavy vehicle share', category: 'Consequence', valueType: 'Numeric',
        standardRef: 'Austroads pavement loading (ESA)', description: 'Heavy vehicles as % of AADT — drives pavement consumption rate.',
        bands: [[0, 5, 10, '< 5%'], [5, 10, 35, '5–10%'], [10, 20, 60, '10–20%'], [20, 35, 80, '20–35%'], [35, 100, 100, '> 35%']],
        binding: { sourceType: 'Attribute', sourceRef: 'HV_PCT', unit: '%' },
        weight: 1.5, policy: 'neutral' },
      { code: 'ROAD_CLASS', name: 'Functional class', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Austroads functional hierarchy', description: 'Functional classification of the carriageway.',
        levels: ['Local access', 'Collector', 'Sub-arterial', 'Arterial', 'Motorway / national corridor'],
        binding: { sourceType: 'Manual', sourceRef: 'functionalClass' },
        weight: 1.5, policy: 'neutral' },
      { code: 'CRASH_RISK', name: 'Road safety star rating', category: 'Consequence', valueType: 'Discrete',
        standardRef: 'AusRAP / iRAP star rating', description: 'Infrastructure safety star rating of the corridor.',
        bands: [['4-5 star', 10], ['3 star', 50], ['1-2 star', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'AUSRAP_STARS' },
        weight: 2.0, policy: 'flag' },
      { code: 'REDUNDANCY', name: 'Network redundancy', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Austroads AGAM resilience', description: 'Availability of practical alternative routes.',
        levels: ['Multiple parallel routes', 'Good alternatives', 'Single practical alternative', 'Long detour only', 'No practical alternative'],
        binding: { sourceType: 'Manual', sourceRef: 'networkRedundancy' },
        weight: 1.0, policy: 'neutral' }
    ],
    rules: [
      { ruleType: 'SafetyFloor', criterion: 'SKID', config: { when: '>=90', floorBand: 'P2', forceReview: true },
        rationale: 'Skid resistance below investigatory level is the pavement parameter most directly correlated with casualty crashes — floors at P2 and is held for review.', priority: 1 },
      { ruleType: 'Escalate', criterion: 'IRI', config: { when: '>=90', raiseBands: 1 },
        rationale: 'IRI beyond the poor threshold escalates one band: ride quality at this level indicates accelerating structural distress.', priority: 2 },
      { ruleType: 'ConfidenceWeight', criterion: null, config: { maxAgeMonths: 36, floor: 0.6 },
        rationale: 'Triennial network-survey cycle: condition data decays to 0.6 confidence past 36 months.', priority: 9 }
    ]
  },

  // ═══ 3. RAIL TRACK & FORMATION ════════════════════════════════════════════
  {
    t: 3,
    code: 'TPL-RAIL-TRACK-V1',
    name: 'Rail Track & Formation — Geometry-led Practice',
    sector: 'Transport',
    scope: 'Rail track, formation & earthworks (per segment)',
    standards: 'EN 13848-5; UIC 714; AREMA; RISSB AS 7635; ONRSR SFAIRP',
    description: 'Track-segment prioritisation led by EN 13848 geometry quality levels (QN1 planning, ' +
      'QN2 intervention, QN3 immediate action), with ultrasonic rail-defect density — the principal ' +
      'broken-rail/derailment precursor — as a second non-compensatory axis. Consequence follows ' +
      'UIC 714 traffic class, line speed and passenger / dangerous-goods exposure per ONRSR SFAIRP.',
    criteria: [
      { code: 'TQI', name: 'Track geometry quality', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'EN 13848-5 (QN levels)', description: '35 m SD composite against speed-band limits.',
        levels: ['Well within QN1', 'Approaching QN1 (planning)', 'QN1 exceeded — plan works', 'QN2 exceeded — intervene', 'QN3 — immediate action / speed restriction'],
        binding: { sourceType: 'Attribute', sourceRef: 'TQI_QN_LEVEL' },
        weight: 3.0, policy: 'penalise:80' },
      { code: 'RAIL_DEFECTS', name: 'Ultrasonic rail defects', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'UT inspection practice', description: 'Actionable internal defects per km — the leading broken-rail precursor.',
        bands: [[0, 0.5, 10, '< 0.5 /km'], [0.5, 2, 40, '0.5–2 /km'], [2, 5, 70, '2–5 /km'], [5, 999, 100, '> 5 /km']],
        binding: { sourceType: 'Attribute', sourceRef: 'UT_DEFECTS_PER_KM', unit: '/km' },
        weight: 2.5, policy: 'flag' },
      { code: 'SLEEPERS', name: 'Sleeper & fastening condition', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'AREMA Ch.30; RISSB', description: 'Defective sleepers/fastenings as % of segment.',
        bands: [[0, 5, 10, '< 5%'], [5, 15, 40, '5–15%'], [15, 30, 70, '15–30%'], [30, 100, 100, '> 30%']],
        binding: { sourceType: 'Attribute', sourceRef: 'SLEEPER_DEFECTIVE_PCT', unit: '%' },
        weight: 1.5, policy: 'neutral' },
      { code: 'BALLAST', name: 'Ballast & drainage condition', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'AREMA; Selig & Waters', description: 'Fouling index and drainage performance.',
        levels: ['Clean, free-draining', 'Minor fouling', 'Moderate fouling', 'Heavily fouled / wet spots', 'Fully fouled — pumping'],
        binding: { sourceType: 'Manual', sourceRef: 'ballastCondition' },
        weight: 1.5, policy: 'neutral' },
      { code: 'RAIL_WEAR', name: 'Railhead wear', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'Rail wear / grinding limits', description: 'Railhead wear as % of condemning limit.',
        bands: [[0, 50, 10, '< 50% of limit'], [50, 75, 40, '50–75%'], [75, 90, 70, '75–90%'], [90, 999, 100, '> 90% — renewal due']],
        binding: { sourceType: 'Attribute', sourceRef: 'RAILHEAD_WEAR_PCT', unit: '%' },
        weight: 1.5, policy: 'flag' },
      { code: 'FORMATION', name: 'Formation & earthworks stability', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'Geotechnical asset practice', description: 'Mud holes, pumping, embankment/cutting instability.',
        levels: ['Stable', 'Isolated soft spots', 'Recurrent mud holes', 'Active settlement/pumping', 'Unstable — speed restricted'],
        binding: { sourceType: 'Manual', sourceRef: 'formationCondition' },
        weight: 1.5, policy: 'neutral' },
      { code: 'TONNAGE', name: 'Traffic tonnage (MGT)', category: 'Consequence', valueType: 'Numeric',
        standardRef: 'UIC 714 line classification', description: 'Million gross tonnes per annum.',
        bands: [[0, 5, 10, '< 5 MGT'], [5, 20, 40, '5–20 MGT'], [20, 60, 70, '20–60 MGT'], [60, 9999, 100, '> 60 MGT — heavy haul']],
        binding: { sourceType: 'Attribute', sourceRef: 'MGT_PA', unit: 'MGT/yr' },
        weight: 2.0, policy: 'neutral' },
      { code: 'LINE_SPEED', name: 'Line speed', category: 'Consequence', valueType: 'Numeric',
        standardRef: 'Derailment-energy scaling', description: 'Permissible line speed — derailment consequence scales with speed.',
        bands: [[0, 80, 20, '≤ 80 km/h'], [80, 115, 50, '80–115 km/h'], [115, 160, 75, '115–160 km/h'], [160, 999, 100, '> 160 km/h']],
        binding: { sourceType: 'Attribute', sourceRef: 'LINE_SPEED_KMH', unit: 'km/h' },
        weight: 2.0, policy: 'neutral' },
      { code: 'PAX_EXPOSURE', name: 'Passenger exposure', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'ONRSR SFAIRP', description: 'Passenger service intensity over the segment.',
        levels: ['Freight only', 'Occasional passenger', 'Regional passenger', 'Frequent suburban', 'High-frequency metro'],
        binding: { sourceType: 'Manual', sourceRef: 'passengerExposure' },
        weight: 2.5, policy: 'neutral' },
      { code: 'DG_FREIGHT', name: 'Dangerous goods exposure', category: 'Consequence', valueType: 'Discrete',
        standardRef: 'DG routing practice', description: 'Dangerous-goods traffic over the segment.',
        bands: [['None', 10], ['Routine', 60], ['High', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'DG_EXPOSURE' },
        weight: 1.0, policy: 'neutral' },
      { code: 'NETWORK_CRIT', name: 'Network criticality', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'UIC 714; network resilience', description: 'Single-line dependency and diversionary options.',
        levels: ['Fully duplicated, alternatives', 'Duplicated', 'Partially single line', 'Single line, diversion possible', 'Single line, no diversion'],
        binding: { sourceType: 'Manual', sourceRef: 'networkCriticality' },
        weight: 1.5, policy: 'neutral' },
      { code: 'LX_EXPOSURE', name: 'Level crossing exposure', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'ALCAM-style exposure', description: 'Level-crossing density and exposure over the segment.',
        levels: ['None', 'Grade-separated only', 'Few protected crossings', 'Multiple active crossings', 'Passive crossings present'],
        binding: { sourceType: 'Manual', sourceRef: 'levelCrossingExposure' },
        weight: 1.0, policy: 'neutral' }
    ],
    rules: [
      { ruleType: 'SafetyFloor', criterion: 'TQI', config: { when: '>=90', floorBand: 'P1', forceReview: true },
        rationale: 'EN 13848 QN3 means immediate action — the segment floors at P1 and is held for engineering review.', priority: 1 },
      { ruleType: 'Escalate', criterion: 'RAIL_DEFECTS', config: { when: '>=90', raiseBands: 1, forceReview: true },
        rationale: 'High actionable-defect density is the principal broken-rail / derailment precursor.', priority: 2 },
      { ruleType: 'ConfidenceWeight', criterion: null, config: { maxAgeMonths: 12, floor: 0.5 },
        rationale: 'Geometry-car and UT cycles are at most annual on prioritised lines; older data halves in confidence.', priority: 9 }
    ]
  },

  // ═══ 4. MINING — TAILINGS STORAGE FACILITIES ══════════════════════════════
  {
    t: 4,
    code: 'TPL-MINE-TSF-V1',
    name: 'Tailings Storage Facilities — GISTM Practice',
    sector: 'Mining',
    scope: 'Tailings storage facilities (per facility)',
    standards: 'GISTM (2020); ANCOLD Tailings Dams; ICOLD Bulletin 194; ISO 31000',
    description: 'Facility prioritisation per the Global Industry Standard on Tailings Management: ' +
      'consequence is led by ANCOLD category and population at risk; likelihood by stability ' +
      'compliance, raise method (upstream construction carries the dominant share of historical ' +
      'failures — ICOLD B121), freeboard and Engineer-of-Record findings. Extreme-consequence ' +
      'facilities are non-compensatorily pinned to the top band, per GISTM intent.',
    criteria: [
      { code: 'STABILITY', name: 'Stability compliance (FoS)', category: 'Likelihood', valueType: 'Discrete',
        standardRef: 'ANCOLD / GISTM stability criteria', description: 'Factor of safety against drained/undrained criteria from the latest DSR.',
        bands: [['Meets criteria', 10], ['Marginal', 60], ['Below criteria', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'FOS_STATUS' },
        weight: 3.0, policy: 'penalise' },
      { code: 'RAISE_METHOD', name: 'Raise method', category: 'Likelihood', valueType: 'Discrete',
        standardRef: 'ICOLD B121 failure statistics', description: 'Construction method — upstream raises carry the dominant share of recorded failures.',
        bands: [['Downstream', 15], ['Centreline', 50], ['Upstream', 90]],
        binding: { sourceType: 'Attribute', sourceRef: 'RAISE_METHOD' },
        weight: 2.0, policy: 'penalise:70' },
      { code: 'SEEPAGE', name: 'Seepage & piezometric trend', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'GISTM Principle 7 monitoring', description: 'Phreatic surface trend against design expectations.',
        levels: ['Below design, stable', 'At design, stable', 'At design, rising', 'Above design', 'Above design, accelerating'],
        binding: { sourceType: 'Manual', sourceRef: 'seepageTrend' },
        weight: 2.0, policy: 'flag' },
      { code: 'FREEBOARD', name: 'Freeboard adequacy', category: 'Likelihood', valueType: 'Discrete',
        standardRef: 'Design storm (PMP/AEP) capacity', description: 'Spillway/freeboard capacity against the design flood.',
        bands: [['Adequate', 10], ['Marginal', 60], ['Deficient', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'FREEBOARD_STATUS' },
        weight: 2.5, policy: 'penalise' },
      { code: 'MONITORING', name: 'Instrumentation & monitoring coverage', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'GISTM Principle 7', description: 'Coverage and review cadence of instrumentation (sparse monitoring raises uncertainty).',
        levels: ['Comprehensive, real-time', 'Comprehensive, routine review', 'Adequate coverage', 'Sparse coverage', 'Minimal / none'],
        binding: { sourceType: 'Manual', sourceRef: 'monitoringCoverage' },
        weight: 1.5, policy: 'neutral' },
      { code: 'EOR_FINDINGS', name: 'Engineer-of-Record open findings', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'GISTM EoR regime', description: 'Severity of open EoR / ITRB findings.',
        levels: ['None open', 'Minor observations', 'Material findings, plans in place', 'Material findings, overdue', 'Critical findings open'],
        binding: { sourceType: 'Manual', sourceRef: 'eorFindings' },
        weight: 2.0, policy: 'flag' },
      { code: 'ANCOLD_CAT', name: 'ANCOLD consequence category', category: 'Consequence', valueType: 'Discrete',
        standardRef: 'ANCOLD consequence framework', description: 'Dam-break consequence category from the latest assessment.',
        bands: [['Low', 10], ['Significant', 30], ['High C', 55], ['High B', 70], ['High A', 85], ['Extreme', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'ANCOLD_CATEGORY' },
        weight: 3.0, policy: 'penalise' },
      { code: 'PAR', name: 'Population at risk', category: 'Consequence', valueType: 'Numeric',
        standardRef: 'ANCOLD PAR bands', description: 'Population at risk in the inundation path.',
        bands: [[0, 0.99, 5, 'Zero'], [1, 10, 40, '1–10'], [10, 100, 65, '10–100'], [100, 1000, 85, '100–1,000'], [1000, 99999999, 100, '> 1,000']],
        binding: { sourceType: 'Attribute', sourceRef: 'PAR_COUNT', unit: 'persons' },
        weight: 2.5, policy: 'penalise' },
      { code: 'ENV_RECEPTOR', name: 'Environmental receptor sensitivity', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'ICMM environmental practice', description: 'Sensitivity of receiving environment (waterways, protected areas).',
        levels: ['Contained / benign', 'Low sensitivity', 'Moderate sensitivity', 'High sensitivity', 'Protected / drinking-water catchment'],
        binding: { sourceType: 'Manual', sourceRef: 'environmentalReceptor' },
        weight: 1.5, policy: 'neutral' },
      { code: 'LIFECYCLE', name: 'Lifecycle stage', category: 'Modifier', valueType: 'Discrete',
        standardRef: 'GISTM closure planning', description: 'Operational status — active facilities carry higher change-driven risk.',
        bands: [['Closed-rehabilitated', 10], ['Closed-care', 35], ['Inactive', 55], ['Active', 75]],
        binding: { sourceType: 'Attribute', sourceRef: 'TSF_STATUS' },
        weight: 1.0, policy: 'neutral' }
    ],
    rules: [
      { ruleType: 'Veto', criterion: 'ANCOLD_CAT', config: { on: 'raw', when: '==Extreme', floorBand: 'P1' },
        rationale: 'GISTM intent: an Extreme-consequence facility is pinned to the top band regardless of condition scores — consequence of failure dominates.', priority: 1 },
      { ruleType: 'SafetyFloor', criterion: 'STABILITY', config: { when: '>=90', floorBand: 'P1', forceReview: true },
        rationale: 'Stability below criteria floors at P1 and is held for Engineer-of-Record review.', priority: 2 },
      { ruleType: 'Escalate', criterion: 'RAISE_METHOD', config: { on: 'raw', when: '==Upstream', raiseBands: 1 },
        rationale: 'Upstream-raised facilities escalate one band — the construction method carries the dominant share of historical failures (ICOLD B121).', priority: 3 },
      { ruleType: 'ConfidenceWeight', criterion: null, config: { maxAgeMonths: 12, floor: 0.4 },
        rationale: 'GISTM requires at least annual DSR cadence; stale facility data decays sharply.', priority: 9 }
    ]
  },

  // ═══ 5. MINING — HAUL ROADS & SITE CIRCUITS ═══════════════════════════════
  {
    t: 5,
    code: 'TPL-MINE-HAUL-V1',
    name: 'Mine Haul Roads & Site Circuits',
    sector: 'Mining',
    scope: 'Haul roads, ramps & site traffic circuits (per segment)',
    standards: 'Thompson & Visser haul-road methodology; ISO 17757; site traffic management practice',
    description: 'Haul-road prioritisation per the Thompson & Visser functional-design methodology: ' +
      'rolling resistance and surface condition drive cost and productivity; geometry compliance ' +
      'against the largest operating vehicle and dust/visibility drive the safety axis. Autonomous ' +
      'haulage corridors (ISO 17757) tolerate less geometric deviation and weight accordingly.',
    criteria: [
      { code: 'ROLL_RESIST', name: 'Rolling resistance', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'Thompson & Visser', description: 'Estimated rolling resistance — each 1% costs ~10% truck productivity.',
        bands: [[0, 2, 10, '< 2% — well maintained'], [2, 3, 35, '2–3%'], [3, 5, 65, '3–5%'], [5, 99, 100, '> 5% — severe']],
        binding: { sourceType: 'Attribute', sourceRef: 'ROLLING_RESIST_PCT', unit: '%' },
        weight: 2.0, policy: 'flag' },
      { code: 'SURFACE', name: 'Surface condition', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'Thompson & Visser defect scoring', description: 'Potholes, corrugation, loose material, spillage.',
        levels: ['Defect-free', 'Minor defects', 'Moderate defects', 'Frequent defects', 'Severe — speed restricted'],
        binding: { sourceType: 'Manual', sourceRef: 'surfaceCondition' },
        weight: 2.0, policy: 'neutral' },
      { code: 'GEOMETRY', name: 'Geometric compliance', category: 'Likelihood', valueType: 'Discrete',
        standardRef: 'Design for largest vehicle', description: 'Width, grade, superelevation and sight distance against design for the largest operating truck.',
        bands: [['Compliant', 10], ['Minor deviation', 55], ['Major deviation', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'GEOM_COMPLIANCE' },
        weight: 2.5, policy: 'penalise:60' },
      { code: 'DUST_VIS', name: 'Dust & visibility', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'Site visibility standards', description: 'Dust generation and visibility impairment — a leading vehicle-interaction fatality factor.',
        levels: ['Controlled', 'Occasional impairment', 'Regular impairment', 'Frequent severe impairment', 'Chronic — interaction risk'],
        binding: { sourceType: 'Manual', sourceRef: 'dustVisibility' },
        weight: 2.0, policy: 'neutral' },
      { code: 'DRAINAGE', name: 'Drainage & windrow condition', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'Thompson & Visser; site standards', description: 'Cross-fall, drains and safety-berm/windrow integrity.',
        levels: ['Fully compliant', 'Minor deficiencies', 'Localised failures', 'Widespread deficiencies', 'Non-compliant berms/windrows'],
        binding: { sourceType: 'Manual', sourceRef: 'drainageWindrows' },
        weight: 1.5, policy: 'neutral' },
      { code: 'PROD_CRIT', name: 'Production criticality', category: 'Consequence', valueType: 'Numeric',
        standardRef: 'Production dependency', description: 'Material movement through the segment.',
        bands: [[0, 10, 10, '< 10 kt/day'], [10, 50, 40, '10–50 kt/day'], [50, 150, 70, '50–150 kt/day'], [150, 99999, 100, '> 150 kt/day']],
        binding: { sourceType: 'Attribute', sourceRef: 'KT_PER_DAY', unit: 'kt/day' },
        weight: 2.5, policy: 'neutral' },
      { code: 'INTERACTION', name: 'Vehicle interaction exposure', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Traffic management plans', description: 'Light/heavy vehicle mix, intersections and congestion points.',
        levels: ['Segregated heavy only', 'Minimal interaction', 'Controlled interaction points', 'Frequent mixed traffic', 'Uncontrolled mixed traffic'],
        binding: { sourceType: 'Manual', sourceRef: 'vehicleInteraction' },
        weight: 2.5, policy: 'neutral' },
      { code: 'AUTONOMY', name: 'Autonomous haulage dependency', category: 'Consequence', valueType: 'Discrete',
        standardRef: 'ISO 17757', description: 'AHS corridors tolerate less surface/geometry deviation.',
        bands: [['None', 10], ['Mixed fleet', 60], ['AHS corridor', 90]],
        binding: { sourceType: 'Attribute', sourceRef: 'AHS_DEPENDENCY' },
        weight: 1.5, policy: 'neutral' },
      { code: 'REDUNDANCY', name: 'Alternative route availability', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Mine planning', description: 'Ability to reroute haulage if the segment closes.',
        levels: ['Multiple alternatives', 'Practical alternative', 'Alternative with penalty', 'Severe rerouting penalty', 'No alternative — pit-critical'],
        binding: { sourceType: 'Manual', sourceRef: 'routeRedundancy' },
        weight: 1.0, policy: 'neutral' }
    ],
    rules: [
      { ruleType: 'SafetyFloor', criterion: 'GEOMETRY', config: { when: '>=90', floorBand: 'P2', forceReview: true },
        rationale: 'Major geometric deviation against the design vehicle (sight distance, width, grade) is a rollover/collision precursor — floors at P2.', priority: 1 },
      { ruleType: 'Escalate', criterion: 'DUST_VIS', config: { when: '>=80', raiseBands: 1 },
        rationale: 'Chronic visibility impairment escalates one band — vehicle-interaction events dominate surface-mining fatality statistics.', priority: 2 },
      { ruleType: 'ConfidenceWeight', criterion: null, config: { maxAgeMonths: 6, floor: 0.5 },
        rationale: 'Haul-road condition changes weekly; data older than 6 months halves in confidence.', priority: 9 }
    ]
  },

  // ═══ 6. CULVERTS & STORMWATER DRAINAGE ════════════════════════════════════
  {
    t: 6,
    code: 'TPL-CULVERT-V1',
    name: 'Culverts & Stormwater Drainage Structures',
    sector: 'Infrastructure',
    scope: 'Cross-drainage culverts & stormwater structures',
    standards: 'FHWA Culvert Inspection Manual; Austroads AGRD 5/5A; ARR 2019; IPWEA IIMM',
    description: 'Drainage-structure prioritisation: structural condition and hydraulic adequacy ' +
      'against current design-storm science (ARR 2019) on the likelihood axis; road class above, ' +
      'embankment height (stored failure energy) and flood consequence on the consequence axis. ' +
      'Culverts fail suddenly and invisibly — condition floors are deliberately conservative.',
    criteria: [
      { code: 'STRUCT_COND', name: 'Structural condition', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'FHWA Culvert Inspection Manual', description: 'Barrel, joints, headwalls and wingwalls.',
        levels: ['Like new', 'Minor deterioration', 'Moderate — barrel distortion onset', 'Major — section loss/deflection', 'Critical — collapse risk'],
        binding: { sourceType: 'Manual', sourceRef: 'culvertCondition' },
        weight: 3.0, policy: 'flag' },
      { code: 'HYDRAULIC', name: 'Hydraulic capacity', category: 'Likelihood', valueType: 'Discrete',
        standardRef: 'ARR 2019 design AEP', description: 'Capacity against the current design storm for the road class.',
        bands: [['Adequate', 10], ['Marginal', 55], ['Deficient', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'HYD_CAPACITY' },
        weight: 2.0, policy: 'flag' },
      { code: 'SCOUR_EROSION', name: 'Inlet/outlet scour', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'FHWA HEC-14', description: 'Scour and erosion at inlet, outlet and around the barrel.',
        levels: ['None', 'Minor', 'Moderate', 'Undermining onset', 'Active undermining'],
        binding: { sourceType: 'Manual', sourceRef: 'culvertScour' },
        weight: 2.0, policy: 'neutral' },
      { code: 'BLOCKAGE', name: 'Blockage propensity', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'ARR blockage assessment', description: 'Debris blockage history and catchment debris potential.',
        levels: ['Clear history', 'Occasional minor debris', 'Regular partial blockage', 'Frequent significant blockage', 'Chronic blockage'],
        binding: { sourceType: 'Manual', sourceRef: 'blockageHistory' },
        weight: 1.5, policy: 'neutral' },
      { code: 'MATERIAL_DEG', name: 'Material degradation', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'Durability practice (CSP invert loss etc.)', description: 'Material-specific degradation: CSP invert corrosion, RCP joint wear, masonry loss.',
        levels: ['None', 'Surface only', 'Measurable loss', 'Significant section loss', 'Through-section loss'],
        binding: { sourceType: 'Manual', sourceRef: 'materialDegradation' },
        weight: 1.5, policy: 'neutral' },
      { code: 'ROAD_ABOVE', name: 'Road class carried', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Austroads functional hierarchy', description: 'Functional class of the road over the structure.',
        levels: ['Local access', 'Collector', 'Sub-arterial', 'Arterial', 'Motorway / national corridor'],
        binding: { sourceType: 'Manual', sourceRef: 'roadClassAbove' },
        weight: 2.0, policy: 'neutral' },
      { code: 'EMBANKMENT_M', name: 'Embankment height', category: 'Consequence', valueType: 'Numeric',
        standardRef: 'Failure-energy proxy', description: 'Fill height over the structure — failure consequence scales with stored energy.',
        bands: [[0, 2, 10, '< 2 m'], [2, 5, 40, '2–5 m'], [5, 10, 70, '5–10 m'], [10, 999, 100, '> 10 m']],
        binding: { sourceType: 'Attribute', sourceRef: 'EMBANK_HEIGHT_M', unit: 'm' },
        weight: 1.5, policy: 'neutral' },
      { code: 'FLOOD_CONSEQ', name: 'Flood consequence', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'ARR 2019; floodplain practice', description: 'Upstream/downstream property and access impact if blocked or failed.',
        levels: ['Rural, no receptors', 'Isolated rural property', 'Several properties', 'Urban area affected', 'Major urban / critical facility'],
        binding: { sourceType: 'Manual', sourceRef: 'floodConsequence' },
        weight: 2.0, policy: 'neutral' },
      { code: 'WATERWAY_ENV', name: 'Waterway significance', category: 'Modifier', valueType: 'Level1to5',
        standardRef: 'Fish-passage guidelines', description: 'Environmental significance incl. fish passage obligations.',
        levels: ['None', 'Minor drain', 'Named watercourse', 'Fish-passage obligation', 'Protected waterway'],
        binding: { sourceType: 'Manual', sourceRef: 'waterwaySignificance' },
        weight: 1.0, policy: 'exclude' }
    ],
    rules: [
      { ruleType: 'SafetyFloor', criterion: 'STRUCT_COND', config: { when: '>=90', floorBand: 'P1', forceReview: true },
        rationale: 'Culverts fail suddenly and invisibly under live traffic — Critical condition floors at P1 with engineering review.', priority: 1 },
      { ruleType: 'Escalate', criterion: 'HYDRAULIC', config: { on: 'raw', when: '==Deficient', raiseBands: 1 },
        rationale: 'Hydraulically deficient structures escalate — overtopping under the ARR 2019 design storm is an embankment-failure precursor.', priority: 2 },
      { ruleType: 'ConfidenceWeight', criterion: null, config: { maxAgeMonths: 60, floor: 0.6 },
        rationale: 'Typical culvert inspection cycle is 5-yearly; older data decays to 0.6 confidence.', priority: 9 }
    ]
  },

  // ═══ 7. WATER DISTRIBUTION MAINS ══════════════════════════════════════════
  {
    t: 7,
    code: 'TPL-WATER-MAINS-V1',
    name: 'Water Distribution Mains — Utility Practice',
    sector: 'Government',
    scope: 'Potable water trunk & reticulation mains (per segment)',
    standards: 'ISO 24516-1; AWWA M28; IPWEA IIMM; WSAA practice',
    description: 'Mains-renewal prioritisation per ISO 24516 / AWWA M28: break-rate benchmarking ' +
      'and material-cohort survival analysis on the likelihood axis; customers served, critical ' +
      'customers (hospitals, dialysis), trunk role and third-party damage consequence on the ' +
      'consequence axis. Critical-customer exposure escalates non-compensatorily.',
    criteria: [
      { code: 'BREAK_RATE', name: 'Break rate', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'AWWA benchmarking', description: 'Breaks per 100 km per year (rolling 5-year).',
        bands: [[0, 10, 10, '< 10 — good'], [10, 25, 40, '10–25'], [25, 40, 70, '25–40'], [40, 9999, 100, '> 40 — poor']],
        binding: { sourceType: 'Attribute', sourceRef: 'BREAKS_PER_100KM_YR', unit: '/100km/yr' },
        weight: 2.5, policy: 'flag' },
      { code: 'COHORT', name: 'Material / vintage cohort', category: 'Likelihood', valueType: 'Discrete',
        standardRef: 'Cohort survival analysis', description: 'Material-vintage cohort risk from network survival curves.',
        bands: [['Modern PE/DICL', 10], ['PVC vintage', 35], ['Cast iron pre-1960', 70], ['AC late-life', 90]],
        binding: { sourceType: 'Attribute', sourceRef: 'MATERIAL_COHORT' },
        weight: 2.0, policy: 'neutral' },
      { code: 'WALL_LOSS', name: 'Sampled wall loss', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'Condition sampling practice', description: 'Wall loss from coupon/CCTV/acoustic sampling.',
        bands: [[0, 20, 10, '< 20%'], [20, 40, 40, '20–40%'], [40, 60, 70, '40–60%'], [60, 100, 100, '> 60%']],
        binding: { sourceType: 'Attribute', sourceRef: 'WALL_LOSS_PCT', unit: '%' },
        weight: 2.0, policy: 'flag' },
      { code: 'PRESSURE', name: 'Pressure / transient exposure', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'WSAA operating practice', description: 'Operating pressure regime and transient (water-hammer) exposure.',
        levels: ['Low, stable', 'Moderate, stable', 'High, stable', 'High with transients', 'Severe transient regime'],
        binding: { sourceType: 'Manual', sourceRef: 'pressureRegime' },
        weight: 1.5, policy: 'neutral' },
      { code: 'SOIL', name: 'Soil corrosivity', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'Soil corrosivity mapping', description: 'External corrosion environment for ferrous cohorts.',
        levels: ['Benign', 'Low', 'Moderate', 'Aggressive', 'Highly aggressive / stray current'],
        binding: { sourceType: 'Manual', sourceRef: 'soilCorrosivity' },
        weight: 1.0, policy: 'neutral' },
      { code: 'CUSTOMERS', name: 'Customers served', category: 'Consequence', valueType: 'Numeric',
        standardRef: 'ISO 24516 service impact', description: 'Connections losing supply on segment failure.',
        bands: [[0, 100, 10, '< 100'], [100, 1000, 40, '100–1,000'], [1000, 10000, 70, '1,000–10,000'], [10000, 99999999, 100, '> 10,000']],
        binding: { sourceType: 'Attribute', sourceRef: 'CUSTOMERS_SERVED', unit: 'connections' },
        weight: 2.5, policy: 'neutral' },
      { code: 'CRITICAL_CUST', name: 'Critical customers', category: 'Consequence', valueType: 'Discrete',
        standardRef: 'Utility criticality registers', description: 'Hospitals, dialysis patients, critical industry on the segment.',
        bands: [['None', 10], ['Present', 60], ['Multiple', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'CRITICAL_CUSTOMERS' },
        weight: 2.0, policy: 'penalise:50' },
      { code: 'MAIN_ROLE', name: 'Network role', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'ISO 24516 hierarchy', description: 'Trunk vs reticulation role.',
        levels: ['Minor reticulation', 'Reticulation', 'Distribution main', 'Trunk main', 'Sole-feed trunk'],
        binding: { sourceType: 'Manual', sourceRef: 'mainRole' },
        weight: 2.0, policy: 'neutral' },
      { code: 'DAMAGE_CONSEQ', name: 'Third-party damage consequence', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Burst-consequence practice', description: 'Burst consequence to surroundings (CBD, under rail, steep terrain).',
        levels: ['Open land', 'Residential street', 'Commercial precinct', 'CBD / transport corridor', 'Under rail / critical infrastructure'],
        binding: { sourceType: 'Manual', sourceRef: 'damageConsequence' },
        weight: 1.5, policy: 'neutral' },
      { code: 'REDUNDANCY', name: 'Supply redundancy', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Network configuration', description: 'Looped vs dead-end supply configuration.',
        levels: ['Fully looped', 'Looped, ample capacity', 'Looped, limited capacity', 'Single feed, rezone possible', 'Dead-end single feed'],
        binding: { sourceType: 'Manual', sourceRef: 'supplyRedundancy' },
        weight: 1.5, policy: 'neutral' }
    ],
    rules: [
      { ruleType: 'Escalate', criterion: 'CRITICAL_CUST', config: { on: 'raw', when: '==Multiple', raiseBands: 1 },
        rationale: 'Multiple critical customers (hospitals, dialysis) escalate one band — supply continuity is a clinical-safety issue.', priority: 1 },
      { ruleType: 'SafetyFloor', criterion: 'BREAK_RATE', config: { when: '>=90', floorBand: 'P2' },
        rationale: 'Break rate beyond the AWWA poor benchmark floors at P2 — the cohort is in run-to-fail territory.', priority: 2 },
      { ruleType: 'ConfidenceWeight', criterion: null, config: { maxAgeMonths: 48, floor: 0.6 },
        rationale: 'Cohort statistics refresh ~4-yearly; older condition sampling decays to 0.6 confidence.', priority: 9 }
    ]
  },

  // ═══ 8. GOVERNMENT BUILDINGS & COMMUNITY FACILITIES ═══════════════════════
  {
    t: 8,
    code: 'TPL-GOVT-FACILITIES-V1',
    name: 'Government Buildings & Community Facilities',
    sector: 'Government',
    scope: 'Public buildings & community facilities (per facility)',
    standards: 'IPWEA IIMM; APPA FCI; NCC; AS 1851; ISO 41001',
    description: 'Facility prioritisation per IPWEA IIMM and APPA facility-condition practice: the ' +
      'Facility Condition Index (backlog ÷ replacement value) anchors the condition axis, with ' +
      'statutory life-safety compliance (NCC, AS 1851 fire, access) as a non-compensatory floor. ' +
      'Consequence follows service criticality, occupancy and community dependency.',
    criteria: [
      { code: 'FCI', name: 'Facility Condition Index', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'APPA FCI bands', description: 'Maintenance backlog ÷ current replacement value.',
        bands: [[0, 0.05, 10, '< 0.05 — good'], [0.05, 0.1, 35, '0.05–0.10 — fair'], [0.1, 0.3, 65, '0.10–0.30 — poor'], [0.3, 99, 100, '> 0.30 — critical']],
        binding: { sourceType: 'Attribute', sourceRef: 'FCI_RATIO', unit: 'ratio' },
        weight: 2.5, policy: 'flag' },
      { code: 'STRUCT_ENV', name: 'Structure & envelope condition', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'IPWEA IIMM condition', description: 'Structure, roof, façade and waterproofing condition.',
        levels: ['Like new', 'Minor wear', 'Moderate deterioration', 'Major defects / water ingress', 'Structural concern'],
        binding: { sourceType: 'Manual', sourceRef: 'structureEnvelope' },
        weight: 2.0, policy: 'neutral' },
      { code: 'SERVICES', name: 'Building services condition', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'ISO 41001 FM practice', description: 'HVAC, electrical, vertical transport, hydraulics.',
        levels: ['New / recently renewed', 'Serviceable', 'Ageing, increasing faults', 'Frequent failures', 'End-of-life / obsolete'],
        binding: { sourceType: 'Manual', sourceRef: 'buildingServices' },
        weight: 2.0, policy: 'neutral' },
      { code: 'COMPLIANCE', name: 'Statutory compliance gaps', category: 'Likelihood', valueType: 'Discrete',
        standardRef: 'NCC; AS 1851; access standards', description: 'Open fire-safety (AS 1851), essential-services and access compliance gaps.',
        bands: [['None', 10], ['Minor', 55], ['Major', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'STATUTORY_GAPS' },
        weight: 3.0, policy: 'penalise' },
      { code: 'FUNCTIONALITY', name: 'Functional suitability', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'IPWEA IIMM service levels', description: 'Fitness of the facility for its current service delivery.',
        levels: ['Purpose-ideal', 'Suitable', 'Workable with constraints', 'Materially constrains service', 'Unfit for service'],
        binding: { sourceType: 'Manual', sourceRef: 'functionalSuitability' },
        weight: 1.5, policy: 'neutral' },
      { code: 'SERVICE_CRIT', name: 'Service criticality', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Community service hierarchy', description: 'Criticality of the service delivered from the facility.',
        levels: ['Storage / ancillary', 'Administrative', 'Community / recreation', 'Education / care', 'Emergency / health-critical'],
        binding: { sourceType: 'Manual', sourceRef: 'serviceCriticality' },
        weight: 2.5, policy: 'neutral' },
      { code: 'OCCUPANCY', name: 'Peak occupancy', category: 'Consequence', valueType: 'Numeric',
        standardRef: 'Life-safety exposure', description: 'Peak occupant load.',
        bands: [[0, 50, 10, '< 50'], [50, 250, 40, '50–250'], [250, 1000, 70, '250–1,000'], [1000, 9999999, 100, '> 1,000']],
        binding: { sourceType: 'Attribute', sourceRef: 'PEAK_OCCUPANCY', unit: 'persons' },
        weight: 1.5, policy: 'neutral' },
      { code: 'COMMUNITY_DEP', name: 'Community dependency', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'IPWEA IIMM', description: 'Availability of alternative facilities for the community served.',
        levels: ['Many alternatives', 'Alternatives nearby', 'Limited alternatives', 'Sole facility in district', 'Sole facility, vulnerable users'],
        binding: { sourceType: 'Manual', sourceRef: 'communityDependency' },
        weight: 1.5, policy: 'neutral' },
      { code: 'HERITAGE', name: 'Heritage significance', category: 'Modifier', valueType: 'Level1to5',
        standardRef: 'Burra Charter practice', description: 'Heritage status (raises intervention complexity and cost).',
        levels: ['None', 'Local interest', 'Local listing', 'State listing', 'National significance'],
        binding: { sourceType: 'Manual', sourceRef: 'heritageStatus' },
        weight: 0.5, policy: 'exclude' }
    ],
    rules: [
      { ruleType: 'SafetyFloor', criterion: 'COMPLIANCE', config: { when: '>=90', floorBand: 'P1', forceReview: true },
        rationale: 'Major statutory life-safety gaps (fire systems, egress) floor at P1 — these are legal obligations, not trade-offs.', priority: 1 },
      { ruleType: 'Escalate', criterion: 'FCI', config: { when: '>=90', raiseBands: 1 },
        rationale: 'FCI beyond 0.30 (APPA critical) escalates — backlog at this level compounds faster than budgets recover it.', priority: 2 },
      { ruleType: 'ConfidenceWeight', criterion: null, config: { maxAgeMonths: 36, floor: 0.6 },
        rationale: 'Triennial facility condition audit cycle.', priority: 9 }
    ]
  },

  // ═══ 9. MARITIME — WHARVES, JETTIES & MARINE STRUCTURES ═══════════════════
  {
    t: 9,
    code: 'TPL-MARINE-WHARF-V1',
    name: 'Wharves, Jetties & Marine Structures',
    sector: 'Maritime',
    scope: 'Wharves, jetties, ferry terminals & marine structures',
    standards: 'PIANC inspection guidance; AS 4997; ASCE/COPRI waterfront practice',
    description: 'Marine-structure prioritisation per PIANC and ASCE waterfront inspection ' +
      'practice: pile section loss (including accelerated low-water corrosion, the dominant ' +
      'hidden failure mode of steel piles), splash-zone deterioration and deck load compliance ' +
      'on the likelihood axis; berth criticality, dangerous-goods transfer and public exposure ' +
      'on the consequence axis.',
    criteria: [
      { code: 'COND_STRUCT', name: 'Structural condition', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'PIANC condition grading', description: 'Deck, headstocks, beams and piles overall grade.',
        levels: ['Like new', 'Minor defects', 'Moderate deterioration', 'Major defects — capacity affected', 'Severe — partial closure warranted'],
        binding: { sourceType: 'Manual', sourceRef: 'marineStructCondition' },
        weight: 3.0, policy: 'flag' },
      { code: 'PILE_LOSS', name: 'Pile section loss', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'ALWC / marine-borer practice', description: 'Worst measured pile section loss — accelerated low-water corrosion and borers act below the visible zone.',
        bands: [[0, 10, 10, '< 10%'], [10, 25, 40, '10–25%'], [25, 40, 70, '25–40%'], [40, 100, 100, '> 40% — capacity-critical']],
        binding: { sourceType: 'Attribute', sourceRef: 'PILE_SECTION_LOSS_PCT', unit: '%' },
        weight: 2.5, policy: 'penalise:60' },
      { code: 'SPLASH_ZONE', name: 'Splash/tidal zone deterioration', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'AS 4997 durability', description: 'Concrete spalling / steel corrosion in the most aggressive exposure zone.',
        levels: ['Sound', 'Surface staining', 'Localised spalling', 'Widespread spalling, exposed reinforcement', 'Section loss in primary members'],
        binding: { sourceType: 'Manual', sourceRef: 'splashZoneCondition' },
        weight: 2.0, policy: 'neutral' },
      { code: 'LOAD_COMPLIANCE', name: 'Deck load compliance', category: 'Likelihood', valueType: 'Discrete',
        standardRef: 'AS 4997 / berth operating limits', description: 'Rated deck capacity against current cargo and plant operations.',
        bands: [['Compliant', 10], ['Marginal', 60], ['Non-compliant', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'DECK_LOAD_STATUS' },
        weight: 2.5, policy: 'penalise:60' },
      { code: 'FENDER_COND', name: 'Fender & berthing systems', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'PIANC WG 33 fender practice', description: 'Energy-absorption capacity of fenders and berthing hardware.',
        levels: ['Full capacity', 'Minor wear', 'Reduced capacity', 'Localised failures', 'Inadequate for design vessel'],
        binding: { sourceType: 'Manual', sourceRef: 'fenderCondition' },
        weight: 1.5, policy: 'neutral' },
      { code: 'SEABED_SCOUR', name: 'Berth-pocket scour', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'Hydrographic survey practice', description: 'Seabed scour at piles/quay toe from propeller wash.',
        levels: ['None', 'Minor', 'Monitored deepening', 'Approaching pile design depth', 'Undermining toe/piles'],
        binding: { sourceType: 'Manual', sourceRef: 'berthScour' },
        weight: 1.5, policy: 'neutral' },
      { code: 'BERTH_CRIT', name: 'Berth/terminal criticality', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Port trade dependency', description: 'Trade or service throughput dependent on the berth.',
        levels: ['Lay-by / recreational', 'Minor cargo', 'Significant trade share', 'Major trade gateway', 'Sole berth for critical trade'],
        binding: { sourceType: 'Manual', sourceRef: 'berthCriticality' },
        weight: 2.5, policy: 'neutral' },
      { code: 'HAZMAT', name: 'Dangerous goods transfer', category: 'Consequence', valueType: 'Discrete',
        standardRef: 'Port DG handling codes', description: 'Bulk liquids / dangerous goods transferred over the structure.',
        bands: [['None', 10], ['Routine', 60], ['High volume', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'DG_TRANSFER' },
        weight: 2.0, policy: 'neutral' },
      { code: 'PUBLIC_ACCESS', name: 'Public access exposure', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Ferry/public wharf practice', description: 'Public and passenger exposure (ferry terminals score high).',
        levels: ['No public access', 'Occasional access', 'Regular public use', 'Daily passenger service', 'High-volume ferry terminal'],
        binding: { sourceType: 'Manual', sourceRef: 'publicAccessExposure' },
        weight: 2.0, policy: 'neutral' },
      { code: 'REDUNDANCY', name: 'Alternate berth availability', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Port operations planning', description: 'Ability to relocate operations if the berth closes.',
        levels: ['Multiple equivalent berths', 'Practical alternative', 'Alternative with constraints', 'Severe operational penalty', 'No alternative'],
        binding: { sourceType: 'Manual', sourceRef: 'berthRedundancy' },
        weight: 1.0, policy: 'neutral' }
    ],
    rules: [
      { ruleType: 'SafetyFloor', criterion: 'COND_STRUCT', config: { when: '>=90', floorBand: 'P1', forceReview: true },
        rationale: 'Severe structural condition on a live berth floors at P1 — collapse under cargo or passengers is a multiple-fatality scenario.', priority: 1 },
      { ruleType: 'Escalate', criterion: 'LOAD_COMPLIANCE', config: { on: 'raw', when: '==Non-compliant', raiseBands: 1, forceReview: true },
        rationale: 'Operating beyond rated deck capacity escalates with review hold — an active, controllable overload condition.', priority: 2 },
      { ruleType: 'ConfidenceWeight', criterion: null, config: { maxAgeMonths: 60, floor: 0.5 },
        rationale: 'PIANC underwater inspection cycles run to 5 years; older dive data halves in confidence.', priority: 9 }
    ]
  },

  // ═══ 10. ENERGY — DISTRIBUTION POLES & TOWERS ═════════════════════════════
  {
    t: 10,
    code: 'TPL-POWER-POLES-V1',
    name: 'Electricity Distribution Poles & Towers',
    sector: 'Energy',
    scope: 'Distribution poles, towers & pole-top structures (per feeder/cohort)',
    standards: 'AS/NZS 7000; Energy Networks Australia practice; ISO 55000',
    description: 'Pole/tower prioritisation per AS/NZS 7000 residual-strength practice: poles are ' +
      'condemned on residual strength, with decay/termite activity and cohort failure history as ' +
      'leading indicators. Consequence is dominated by bushfire ignition risk — pole-top failure in ' +
      'an extreme bushfire-risk zone escalates non-compensatorily — plus customers served and ' +
      'critical loads.',
    criteria: [
      { code: 'POLE_STRENGTH', name: 'Residual strength', category: 'Likelihood', valueType: 'Numeric',
        standardRef: 'AS/NZS 7000 serviceability', description: 'Residual strength as % of as-new design capacity.',
        bands: [[80, 999, 10, '> 80%'], [65, 80, 35, '65–80%'], [50, 65, 70, '50–65% — intervention zone'], [0, 50, 100, '< 50% — condemnable']],
        binding: { sourceType: 'Attribute', sourceRef: 'RESIDUAL_STRENGTH_PCT', unit: '%' },
        weight: 3.0, policy: 'penalise:70' },
      { code: 'DECAY_TERMITE', name: 'Decay / termite activity', category: 'Likelihood', valueType: 'Discrete',
        standardRef: 'Timber-pole inspection practice', description: 'Internal decay or termite activity from drill/sound inspection.',
        bands: [['None', 10], ['Detected', 60], ['Active', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'DECAY_STATUS' },
        weight: 2.0, policy: 'flag' },
      { code: 'CORROSION', name: 'Steel/concrete deterioration', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'AS/NZS 7000 durability', description: 'Corrosion of steel poles/towers, concrete spalling, stay condition.',
        levels: ['Sound', 'Surface corrosion', 'Measurable section loss', 'Significant loss / cracked concrete', 'Structural capacity affected'],
        binding: { sourceType: 'Manual', sourceRef: 'poleCorrosion' },
        weight: 1.5, policy: 'neutral' },
      { code: 'AGE_COHORT', name: 'Age vs cohort survival', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'Cohort survival analysis', description: 'Position of the asset within its material/vintage survival curve.',
        levels: ['Early life', 'Mid life', 'Approaching mean life', 'Beyond mean life', 'Tail of survival curve'],
        binding: { sourceType: 'Manual', sourceRef: 'ageCohortPosition' },
        weight: 1.5, policy: 'neutral' },
      { code: 'DEFECT_HIST', name: 'Feeder defect history', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'ENA reliability practice', description: 'Defect and unassisted-failure history on the feeder/cohort.',
        levels: ['Clean history', 'Isolated defects', 'Recurring defects', 'Multiple failures', 'Chronic failure cohort'],
        binding: { sourceType: 'Manual', sourceRef: 'feederDefectHistory' },
        weight: 1.5, policy: 'neutral' },
      { code: 'BUSHFIRE_ZONE', name: 'Bushfire risk zone', category: 'Consequence', valueType: 'Discrete',
        standardRef: 'Bushfire-prone land mapping', description: 'Fire-loss consequence of pole-top failure or conductor drop.',
        bands: [['Low', 10], ['Moderate', 40], ['High', 70], ['Extreme', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'BUSHFIRE_ZONE' },
        weight: 3.0, policy: 'penalise' },
      { code: 'CUSTOMERS', name: 'Customers on feeder', category: 'Consequence', valueType: 'Numeric',
        standardRef: 'Reliability (SAIDI) exposure', description: 'Customers interrupted by failure of the asset.',
        bands: [[0, 50, 10, '< 50'], [50, 500, 40, '50–500'], [500, 5000, 70, '500–5,000'], [5000, 99999999, 100, '> 5,000']],
        binding: { sourceType: 'Attribute', sourceRef: 'FEEDER_CUSTOMERS', unit: 'customers' },
        weight: 2.0, policy: 'neutral' },
      { code: 'CRITICAL_LOAD', name: 'Critical loads', category: 'Consequence', valueType: 'Discrete',
        standardRef: 'Utility criticality registers', description: 'Hospitals, water pumping, communications on the feeder.',
        bands: [['None', 10], ['Present', 60], ['Multiple', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'CRITICAL_LOADS' },
        weight: 2.0, policy: 'neutral' },
      { code: 'PUBLIC_EXPOSURE', name: 'Public exposure at location', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Public-safety exposure', description: 'Pedestrian/vehicle exposure beneath the asset (school zones, busy roadsides).',
        levels: ['Remote rural', 'Low-traffic rural', 'Suburban street', 'Busy road / shared path', 'School zone / high pedestrian'],
        binding: { sourceType: 'Manual', sourceRef: 'publicExposure' },
        weight: 1.5, policy: 'neutral' },
      { code: 'NETWORK_REDUND', name: 'Feeder redundancy', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Network switching capability', description: 'Backfeed/switching options to restore supply around the asset.',
        levels: ['Full backfeed', 'Backfeed with constraints', 'Partial restoration only', 'Radial — generator support possible', 'Radial — no alternative'],
        binding: { sourceType: 'Manual', sourceRef: 'feederRedundancy' },
        weight: 1.0, policy: 'neutral' }
    ],
    rules: [
      { ruleType: 'SafetyFloor', criterion: 'POLE_STRENGTH', config: { when: '>=90', floorBand: 'P1', forceReview: true },
        rationale: 'Residual strength below the condemnable limit floors at P1 — unassisted pole failure over public space is intolerable.', priority: 1 },
      { ruleType: 'Escalate', criterion: 'BUSHFIRE_ZONE', config: { on: 'raw', when: '==Extreme', raiseBands: 1, forceReview: true },
        rationale: 'Extreme bushfire-risk zones escalate with review hold — asset-initiated ignition is the dominant catastrophic-loss scenario for distribution networks.', priority: 2 },
      { ruleType: 'ConfidenceWeight', criterion: null, config: { maxAgeMonths: 48, floor: 0.5 },
        rationale: 'Ground-line inspection cycles run 4–5 years; older inspection data halves in confidence.', priority: 9 }
    ]
  },

  // ═══ 11. ROAD & RAIL TUNNELS ══════════════════════════════════════════════
  {
    t: 11,
    code: 'TPL-TUNNEL-V1',
    name: 'Road & Rail Tunnels',
    sector: 'Transport',
    scope: 'Road & rail tunnels (per tube)',
    standards: 'PIARC Road Tunnels Manual; EU Directive 2004/54/EC practice; NFPA 502',
    description: 'Tunnel prioritisation per PIARC and NFPA 502 practice: civil condition (lining, ' +
      'groundwater ingress, portal stability) plus the life-safety systems axis — fire detection/ ' +
      'suppression, ventilation and egress — where compliance gaps floor non-compensatorily. ' +
      'Consequence scales with traffic, tube length (egress difficulty) and dangerous-goods policy.',
    criteria: [
      { code: 'LINING_COND', name: 'Lining condition', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'PIARC tunnel inspection', description: 'Cracking, spalling, delamination and joint condition of the lining.',
        levels: ['Sound', 'Minor cracking', 'Moderate spalling', 'Widespread defects / delamination', 'Falling-object or structural risk'],
        binding: { sourceType: 'Manual', sourceRef: 'liningCondition' },
        weight: 2.5, policy: 'flag' },
      { code: 'WATER_INGRESS', name: 'Groundwater ingress', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'Tunnel drainage practice', description: 'Ingress severity and effect on equipment, icing and corrosion.',
        levels: ['Dry', 'Damp patches', 'Dripping — managed', 'Flowing — affecting systems', 'Severe — structural washout risk'],
        binding: { sourceType: 'Manual', sourceRef: 'waterIngress' },
        weight: 1.5, policy: 'neutral' },
      { code: 'MEP_SYSTEMS', name: 'Life-safety systems condition', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'NFPA 502; PIARC M&E', description: 'Ventilation, fire detection/suppression, emergency lighting and comms condition.',
        levels: ['New / fully tested', 'Serviceable', 'Ageing, rising fault rate', 'Frequent failures / obsolete parts', 'Degraded — reduced protection'],
        binding: { sourceType: 'Manual', sourceRef: 'lifeSafetySystems' },
        weight: 2.5, policy: 'flag' },
      { code: 'FIRE_COMPLIANCE', name: 'Fire-safety compliance', category: 'Likelihood', valueType: 'Discrete',
        standardRef: 'NFPA 502 / EU 2004/54/EC', description: 'Compliance of fire-life-safety provisions against current code.',
        bands: [['Compliant', 10], ['Gaps — mitigated', 60], ['Major gaps', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'FIRE_COMPLIANCE' },
        weight: 3.0, policy: 'penalise' },
      { code: 'GEOTECH', name: 'Portal & ground stability', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'Geotechnical asset practice', description: 'Portal slopes, rock bolts, ground movement monitoring.',
        levels: ['Stable', 'Minor weathering', 'Localised instability', 'Active movement — monitored', 'Unstable — intervention due'],
        binding: { sourceType: 'Manual', sourceRef: 'portalStability' },
        weight: 1.5, policy: 'neutral' },
      { code: 'TRAFFIC', name: 'Traffic volume', category: 'Consequence', valueType: 'Numeric',
        standardRef: 'PIARC risk exposure', description: 'AADT (road) or services/day equivalent (rail).',
        bands: [[0, 5000, 10, '< 5k'], [5000, 30000, 40, '5–30k'], [30000, 80000, 70, '30–80k'], [80000, 9999999, 100, '> 80k']],
        binding: { sourceType: 'Attribute', sourceRef: 'TUNNEL_AADT', unit: 'veh/day' },
        weight: 2.0, policy: 'neutral' },
      { code: 'TUBE_LENGTH', name: 'Tube length', category: 'Consequence', valueType: 'Numeric',
        standardRef: 'EU 2004/54/EC thresholds', description: 'Length drives egress difficulty and incident consequence.',
        bands: [[0, 300, 10, '< 300 m'], [300, 1000, 40, '300–1,000 m'], [1000, 3000, 70, '1–3 km'], [3000, 99999, 100, '> 3 km']],
        binding: { sourceType: 'Attribute', sourceRef: 'TUBE_LENGTH_M', unit: 'm' },
        weight: 2.0, policy: 'neutral' },
      { code: 'DG_TRANSIT', name: 'Dangerous goods policy', category: 'Consequence', valueType: 'Discrete',
        standardRef: 'ADR tunnel categories', description: 'Dangerous-goods transit permission for the tube.',
        bands: [['Prohibited', 10], ['Escorted/limited', 55], ['Permitted', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'DG_POLICY' },
        weight: 1.5, policy: 'neutral' },
      { code: 'REDUNDANCY', name: 'Network alternative', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Network resilience', description: 'Practical alternative route if the tube closes.',
        levels: ['Parallel tube + surface route', 'Surface alternative', 'Long detour', 'Severe detour penalty', 'No practical alternative'],
        binding: { sourceType: 'Manual', sourceRef: 'tunnelRedundancy' },
        weight: 1.5, policy: 'neutral' }
    ],
    rules: [
      { ruleType: 'SafetyFloor', criterion: 'FIRE_COMPLIANCE', config: { when: '>=90', floorBand: 'P1', forceReview: true },
        rationale: 'Major fire-life-safety gaps floor at P1 — tunnel fire history (Mont Blanc, Gotthard) drove the EU directive for a reason.', priority: 1 },
      { ruleType: 'Escalate', criterion: 'MEP_SYSTEMS', config: { when: '>=80', raiseBands: 1 },
        rationale: 'Degraded ventilation/detection escalates — life-safety systems are the consequence-control layer for every other tunnel risk.', priority: 2 },
      { ruleType: 'ConfidenceWeight', criterion: null, config: { maxAgeMonths: 24, floor: 0.5 },
        rationale: 'Tunnel principal inspections and systems testing run on 1–2 year cycles.', priority: 9 }
    ]
  },

  // ═══ 12. WATER SUPPLY & FLOOD MITIGATION DAMS ═════════════════════════════
  {
    t: 12,
    code: 'TPL-WATER-DAM-V1',
    name: 'Water Supply & Flood Mitigation Dams',
    sector: 'Government',
    scope: 'Water supply, flood mitigation & weir structures (per dam)',
    standards: 'ANCOLD guidelines; ICOLD bulletins; state dam-safety regulation',
    description: 'Dam-safety prioritisation per ANCOLD/ICOLD portfolio risk practice: spillway ' +
      'adequacy against the design flood, piping/seepage indicators (the leading embankment ' +
      'failure mode) and Dam Safety Review findings on likelihood; ANCOLD consequence category ' +
      'and population at risk dominating consequence — Extreme-category dams pin to the top band.',
    criteria: [
      { code: 'DSR_FINDINGS', name: 'Dam Safety Review findings', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'ANCOLD DSR practice', description: 'Severity of open findings from the latest comprehensive DSR.',
        levels: ['None open', 'Minor observations', 'Material findings — programmed', 'Material findings — overdue', 'Critical findings open'],
        binding: { sourceType: 'Manual', sourceRef: 'dsrFindings' },
        weight: 2.5, policy: 'flag' },
      { code: 'STABILITY_FOS', name: 'Stability compliance', category: 'Likelihood', valueType: 'Discrete',
        standardRef: 'ANCOLD stability criteria', description: 'Factor of safety against current loading criteria incl. seismic.',
        bands: [['Meets criteria', 10], ['Marginal', 60], ['Below criteria', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'DAM_FOS_STATUS' },
        weight: 3.0, policy: 'penalise' },
      { code: 'SPILLWAY_CAP', name: 'Spillway capacity', category: 'Likelihood', valueType: 'Discrete',
        standardRef: 'ANCOLD acceptable flood capacity', description: 'Capacity against the dam-break design flood for the consequence category.',
        bands: [['Adequate', 10], ['Marginal', 60], ['Deficient', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'SPILLWAY_STATUS' },
        weight: 3.0, policy: 'penalise' },
      { code: 'SEEPAGE', name: 'Seepage & piping indicators', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'ICOLD internal-erosion bulletins', description: 'Seepage quantity/clarity trends — piping is the leading embankment failure mode.',
        levels: ['Dry / clear, stable', 'Clear, stable flow', 'Increasing clear flow', 'Turbid or new exit points', 'Active internal erosion indicators'],
        binding: { sourceType: 'Manual', sourceRef: 'damSeepage' },
        weight: 2.5, policy: 'flag' },
      { code: 'STRUCT_COND', name: 'Structure & appurtenances condition', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'ANCOLD surveillance', description: 'Embankment/concrete condition, outlet works, gates and valves.',
        levels: ['Excellent', 'Good', 'Fair — programmed works', 'Poor — capability affected', 'Very poor — reliability doubtful'],
        binding: { sourceType: 'Manual', sourceRef: 'damStructCondition' },
        weight: 2.0, policy: 'neutral' },
      { code: 'INSTRUMENT', name: 'Surveillance & instrumentation', category: 'Likelihood', valueType: 'Level1to5',
        standardRef: 'ANCOLD surveillance guidelines', description: 'Instrumentation coverage and surveillance cadence (sparse raises uncertainty).',
        levels: ['Comprehensive, telemetered', 'Comprehensive, routine reads', 'Adequate', 'Sparse', 'Minimal / none'],
        binding: { sourceType: 'Manual', sourceRef: 'damInstrumentation' },
        weight: 1.5, policy: 'neutral' },
      { code: 'ANCOLD_CAT', name: 'ANCOLD consequence category', category: 'Consequence', valueType: 'Discrete',
        standardRef: 'ANCOLD consequence framework', description: 'Dam-break consequence category.',
        bands: [['Low', 10], ['Significant', 30], ['High C', 55], ['High B', 70], ['High A', 85], ['Extreme', 100]],
        binding: { sourceType: 'Attribute', sourceRef: 'DAM_ANCOLD_CATEGORY' },
        weight: 3.0, policy: 'penalise' },
      { code: 'PAR', name: 'Population at risk', category: 'Consequence', valueType: 'Numeric',
        standardRef: 'ANCOLD PAR bands', description: 'Population at risk in the dam-break inundation path.',
        bands: [[0, 0.99, 5, 'Zero'], [1, 10, 40, '1–10'], [10, 100, 65, '10–100'], [100, 1000, 85, '100–1,000'], [1000, 99999999, 100, '> 1,000']],
        binding: { sourceType: 'Attribute', sourceRef: 'DAM_PAR_COUNT', unit: 'persons' },
        weight: 2.5, policy: 'penalise' },
      { code: 'SUPPLY_ROLE', name: 'Water supply criticality', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Urban water security planning', description: 'Supply role — sole town supply scores highest.',
        levels: ['Recreation/amenity only', 'Supplementary supply', 'Significant supply share', 'Major system storage', 'Sole supply for community'],
        binding: { sourceType: 'Manual', sourceRef: 'supplyRole' },
        weight: 2.0, policy: 'neutral' },
      { code: 'ENV_DOWNSTREAM', name: 'Downstream environmental consequence', category: 'Consequence', valueType: 'Level1to5',
        standardRef: 'Environmental flow practice', description: 'Environmental consequence of uncontrolled release or loss of storage.',
        levels: ['Minimal', 'Low', 'Moderate', 'High', 'Protected/critical ecosystems'],
        binding: { sourceType: 'Manual', sourceRef: 'downstreamEnvironment' },
        weight: 1.0, policy: 'neutral' }
    ],
    rules: [
      { ruleType: 'Veto', criterion: 'ANCOLD_CAT', config: { on: 'raw', when: '==Extreme', floorBand: 'P1' },
        rationale: 'ANCOLD portfolio practice: an Extreme-consequence dam is pinned to the top band regardless of condition scores.', priority: 1 },
      { ruleType: 'SafetyFloor', criterion: 'SPILLWAY_CAP', config: { when: '>=90', floorBand: 'P1', forceReview: true },
        rationale: 'Spillway deficiency against the acceptable flood is the dominant historical dam-failure mechanism — floors at P1.', priority: 2 },
      { ruleType: 'Escalate', criterion: 'SEEPAGE', config: { when: '>=80', raiseBands: 1, forceReview: true },
        rationale: 'Turbid seepage or new exit points are internal-erosion precursors — escalate and hold for dam engineer review.', priority: 3 },
      { ruleType: 'ConfidenceWeight', criterion: null, config: { maxAgeMonths: 12, floor: 0.4 },
        rationale: 'ANCOLD surveillance is at least annual; stale dam data decays sharply.', priority: 9 }
    ]
  }
]

// ─────────────────────────────────────────────────────────────────────────────
// Expansion: spec → seed rows (deterministic IDs; parent-first table order)
// ─────────────────────────────────────────────────────────────────────────────
function expand () {
  const SEED = { PrioritisationModel: [], ModelCriterion: [], CriterionSourceBinding: [], CriterionValueBand: [], AssetClassCriterionWeight: [], AggregationRule: [] }
  for (const tpl of TEMPLATES) {
    const modelID = uid(tpl.t, 0, 1)
    SEED.PrioritisationModel.push({
      ID: modelID, code: tpl.code, name: tpl.name, version: 1, status: 'Template',
      aggregationMethod: 'WeightedSumWithRules', description: tpl.description,
      reviewedBy: null, reviewedAt: null,
      reviewSource: 'docs/prioritisation/TEMPLATE-LIBRARY.md',
      isTemplate: true, sector: tpl.sector, assetClassScope: tpl.scope, standardsBasis: tpl.standards
    })
    const critIdByCode = {}
    let bandSeq = 0
    tpl.criteria.forEach((c, ci) => {
      const critID = uid(tpl.t, 1, ci + 1)
      critIdByCode[c.code] = critID
      const rubric = c.levels ? JSON.stringify(Object.fromEntries(c.levels.map((l, i) => [String(i + 1), l]))) : null
      SEED.ModelCriterion.push({
        ID: critID, model_ID: modelID, code: c.code, name: c.name, category: c.category,
        valueType: c.valueType, standardRef: c.standardRef, description: c.description,
        rubric, displayOrder: ci + 1, active: true
      })
      SEED.CriterionSourceBinding.push({
        ID: uid(tpl.t, 2, ci + 1), criterion_ID: critID,
        sourceType: c.binding.sourceType, sourceRef: c.binding.sourceRef,
        unit: c.binding.unit || null, transform: c.binding.transform || null
      })
      const bands = c.levels
        ? c.levels.map((l, i) => ({ lowerBound: i + 1, upperBound: i + 1, textValue: null, score: L5_SCORES[i + 1], label: l, displayOrder: i + 1 }))
        : (typeof c.bands[0][0] === 'string')
            ? c.bands.map((b, i) => ({ lowerBound: null, upperBound: null, textValue: b[0], score: b[1], label: b[2] || b[0], displayOrder: i + 1 }))
            : c.bands.map((b, i) => ({ lowerBound: b[0], upperBound: b[1], textValue: null, score: b[2], label: b[3] || null, displayOrder: i + 1 }))
      for (const b of bands) {
        bandSeq += 1
        SEED.CriterionValueBand.push(Object.assign({ ID: uid(tpl.t, 3, bandSeq), criterion_ID: critID }, b))
      }
      SEED.AssetClassCriterionWeight.push({
        ID: uid(tpl.t, 4, ci + 1), model_ID: modelID, assetClass: '*', transportMode: '*',
        criterion_ID: critID, included: true, weight: c.weight, missingDataPolicy: c.policy
      })
    })
    tpl.rules.forEach((r, ri) => {
      SEED.AggregationRule.push({
        ID: uid(tpl.t, 5, ri + 1), model_ID: modelID, ruleType: r.ruleType,
        criterion_ID: r.criterion ? critIdByCode[r.criterion] : null,
        config: JSON.stringify(r.config), rationale: r.rationale, priority: r.priority, active: true
      })
    })
  }
  return SEED
}

const SEED = expand()

const rowLabel = (row) => row.code || row.name || row.ruleType || row.label || String(row.ID)

// Insert-if-missing seeding keyed on the fixed UUIDs above. Mirrors
// ensureModelBuilderSeed: never touches existing rows; ChangeLogs every insert.
async function ensureTemplateLibrarySeed (db, { changedBy = 'system' } = {}) {
  const batchId = cds.utils.uuid()
  let inserted = 0
  const perTable = {}
  for (const table of TABLES) {
    const rows = SEED[table] || []
    const existing = await db.run(SELECT.from(NS + table).columns('ID'))
    const have = new Set((existing || []).map((r) => String(r.ID).toLowerCase()))
    const missing = rows.filter((r) => !have.has(String(r.ID).toLowerCase()))
    perTable[table] = missing.length
    if (!missing.length) continue
    await db.run(INSERT.into(NS + table).entries(missing))
    await writeChangeLogs(db, {
      objectType: 'Lookup',
      objectId: table,
      objectName: `${table} (template-library seed)`,
      source: 'Calibration',
      batchId,
      changedBy,
      changes: missing.map((row) => ({ fieldName: String(row.ID), oldValue: '', newValue: rowLabel(row) }))
    })
    inserted += missing.length
  }
  return { inserted, perTable }
}

module.exports = { TABLES, SEED, TEMPLATES, ensureTemplateLibrarySeed }
