// ─────────────────────────────────────────────────────────────────────────────
// Risk categorisation as a GOVERNED, VERSIONED, RELATIONAL model (additive, CLAUDE.md §2.1).
// Same pattern as BhiModel / PrioritisationModel: an admin default that users can CLONE into a
// Draft, tune, and ACTIVATE (retiring the prior version) — fully audited. The active version's
// factor weights + band thresholds are what the risk engine (srv/lib/risk.js) consumes; the legacy
// global RiskConfig / RiskBand tables remain as a fallback + are migrated into the seed model.
// Reuses the shared governed-config lifecycle aspect. See docs/CONFIGURABLE-ENGINES-ASSESSMENT.md §6.
// ─────────────────────────────────────────────────────────────────────────────
using { plugins.governedconfig.governedModel } from '../srv/lib/plugins/governed-config/governed-config-schema';
using { cuid } from '@sap/cds/common';

namespace bridge.management;

// A named, versioned risk-scoring configuration (weighting factors + band thresholds).
entity RiskModel : governedModel {
  factors : Composition of many RiskModelFactor on factors.model = $self;
  bands   : Composition of many RiskModelBand   on bands.model = $self;
}

// One consequence/likelihood weighting factor. assetClass '*' = the default for all classes; a real
// assetClass is a per-class override, resolved by the governed-config precedence ladder.
entity RiskModelFactor : cuid {
  model      : Association to RiskModel;
  assetClass : String(40) default '*';   // '*' = all classes; else -> AssetClasses.code
  factorKey  : String(40);               // -> RiskConfig.factor (business key)
  name       : String(111);
  weight     : Decimal(5, 2);            // 0..10 (srv/lib/risk.js enforces the range)
}

// One risk band (score threshold → category). assetClass '*' = the default band ladder for all classes.
entity RiskModelBand : cuid {
  model        : Association to RiskModel;
  assetClass   : String(40) default '*';
  code         : String(20);             // VeryHigh | High | Medium | Low
  name         : String(40);
  minScore     : Decimal(6, 2);
  maxScore     : Decimal(6, 2);
  colour       : String(20);
  sortOrder    : Integer default 0;
  rationale    : LargeString;            // documented justification for the threshold (auditable)
  reviewedBy   : String(111);
  reviewedAt   : Date;
  reviewSource : String(255);
}
