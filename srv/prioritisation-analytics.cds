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
  HeaderInfo: { TypeName: 'Prioritisation Run', TypeNamePlural: 'Prioritisation Runs', Title: { Value: bridgeName } },
  SelectionFields: [ band, modelCode, assetClass, transportMode, region, fleetRunId, active ],
  LineItem: [
    { Value: fleetRank,        Label: 'Rank' },
    { Value: band,             Label: 'Band', Criticality: bandCriticality },
    { Value: bridgeRef,        Label: 'Bridge' },
    { Value: bridgeName,       Label: 'Name' },
    { Value: priorityScore,    Label: 'Score' },
    { Value: assetClass,       Label: 'Asset class' },
    { Value: transportMode,    Label: 'Mode' },
    { Value: modelCode,        Label: 'Model' },
    { Value: conditionRating,  Label: 'Condition' },
    { Value: mitigationCostAud, Label: 'Mitigation $' },
    { Value: assessedAt,       Label: 'Assessed' }
  ]
}) {
  band @Common.Label: 'Priority band';
};
extend projection PrioritisationAnalyticsService.Runs with {
  // 1=red P1/P2, 2=amber P3, 3=green P4/P5 — FE criticality colouring (label always shown too)
  case band when 'P1' then 1 when 'P2' then 1 when 'P3' then 2 else 3 end as bandCriticality : Integer
}
