using {bridge.management as my} from '../db/schema';

// ── G9 + SAC/Datasphere consumption layer (read-only OData V4; integration scope included so a
// technical user / DSP connection can consume without UI roles). Flattened, dimension-rich views. ──
@requires: ['view', 'integration']
service PrioritisationAnalyticsService @(path: '/odata/v4/prioritisation-analytics') {

  // One row per immutable run, flattened with register dimensions — the SAC/DSP fact view.
  @readonly
  entity Runs as projection on my.PrioritisationAssessment {
    key ID,
    bridgeRef, bridgeName, modelCode, modelVersion, band, priorityScore,
    // Council B4: run-type discriminator exposed to every consumer — 'fleet' = data-only batch
    // run (no engineer judgement), 'manual'/null = engineer-judgement run. SAC/DSP stories can
    // (and should) slice on it instead of mistaking batch scores for assessments.
    runType,
    fleetRunId, fleetRank, criticality, tier, residual, likelihood,
    likelihoodOverridden, restrictionFlag,
    inputsAvailable, inputsTotal, conditionAsAtMonths,
    likelyFailureCostAud, mitigationCostAud,
    assessedBy, assessedAt, active, weightSetHash,
    bridge.assetClass    as assetClass,
    bridge.transportMode as transportMode,
    bridge.network       as network,
    bridge.region        as region,
    bridge.lga           as lga,
    bridge.latitude      as latitude,
    bridge.longitude     as longitude,
    bridge.conditionRating as conditionRating,
    bridge.importanceLevel as importanceLevel
  };

  // Band aggregate for dashboards (counts + $ exposure per band, active runs only).
  @readonly
  entity BandSummary as
    select from my.PrioritisationAssessment {
      key band,
      count(*)                  as runs              : Integer,
      sum(mitigationCostAud)    as mitigationAud     : Decimal(17,2),
      sum(likelyFailureCostAud) as failureExposureAud : Decimal(17,2),
      avg(priorityScore)        as avgScore          : Decimal(6,2)
    } where active = true group by band;

  // BSI/BHI across modes (G-BHI): per-transport-mode condition health for SAC/DSP + dashboards.
  @readonly
  entity ConditionByMode as
    select from my.Bridges {
      key transportMode,
      count(*)        as bridges  : Integer,
      avg(bsiScore)   as avgBsi   : Decimal(4,2),
      min(bsiScore)   as worstBsi : Decimal(4,2),
      avg(bhiScore)   as avgBhi   : Decimal(5,1),
      min(bhiScore)   as worstBhi : Decimal(5,1),
      avg(conditionRating) as avgCondition : Decimal(4,2)
    } group by transportMode;

  // Model catalogue (criteria + standards refs) for lineage/metadata in DSP.
  @readonly
  entity ModelCatalogue as projection on my.ModelCriterion {
    key ID, code, name, category, valueType, standardRef, active,
    model.code as modelCode, model.version as modelVersion, model.status as modelStatus
  };
}

annotate PrioritisationAnalyticsService.Runs with @(UI: {
  HeaderInfo: { TypeName: '{i18n>PrioritisationRun}', TypeNamePlural: '{i18n>PrioritisationRuns}', Title: { Value: bridgeName } },
  SelectionFields: [ band, modelCode, assetClass, transportMode, region, runType, fleetRunId, active ],
  LineItem: [
    { Value: fleetRank,        Label: '{i18n>Rank}' },
    { Value: band,             Label: '{i18n>Band}', Criticality: bandCriticality },
    { Value: bridgeRef,        Label: '{i18n>Bridge}' },
    { Value: bridgeName,       Label: '{i18n>Name}' },
    { Value: priorityScore,    Label: '{i18n>Score}' },
    { Value: runType,          Label: '{i18n>RunType}' },
    { Value: assetClass,       Label: '{i18n>AssetClass}' },
    { Value: transportMode,    Label: '{i18n>TransportMode}' },
    { Value: modelCode,        Label: '{i18n>Model}' },
    { Value: conditionRating,  Label: '{i18n>Condition}' },
    { Value: mitigationCostAud, Label: '{i18n>MitigationCost}' },
    { Value: assessedAt,       Label: '{i18n>Assessed}' }
  ],
  // ── Council B10: the report tile previously opened ALL runs (active + superseded) unsorted,
  // double-counting superseded runs in FE and SAC. Default view = active runs only, ranked
  // band-frozen fleetRank first, then priorityScore. Users can still clear the filter to see
  // run history — the default just stops the double-count.
  SelectionVariant #Default: {
    Text         : '{i18n>ActiveRunsOnly}',
    SelectOptions: [{
      PropertyName: active,
      Ranges      : [{ Sign: #I, Option: #EQ, Low: true }]
    }]
  },
  PresentationVariant #Default: {
    Text          : '{i18n>RankedByFleetRank}',
    SortOrder     : [
      { Property: fleetRank,     Descending: false },
      { Property: priorityScore, Descending: true }
    ],
    Visualizations: ['@UI.LineItem']
  },
  SelectionPresentationVariant #Default: {
    Text               : '{i18n>RankedActiveRuns}',
    SelectionVariant   : ![@UI.SelectionVariant#Default],
    PresentationVariant: ![@UI.PresentationVariant#Default]
  }
}) {
  band    @Common.Label: '{i18n>PriorityBand}';
  runType @Common.Label: '{i18n>RunTypeLong}';
};
extend projection PrioritisationAnalyticsService.Runs with {
  // 1=red P1/P2, 2=amber P3, 3=green P4/P5 — FE criticality colouring (label always shown too)
  case band when 'P1' then 1 when 'P2' then 1 when 'P3' then 2 else 3 end as bandCriticality : Integer
}
