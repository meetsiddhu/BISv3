// ─────────────────────────────────────────────────────────────────────────────
// BHI/BSI configuration as a GOVERNED, VERSIONED, RELATIONAL model (additive, CLAUDE.md §2.1).
// Migrates the per-class BHI config off the single SystemConfig 'bhiWeights' JSON blob onto
// first-class rows, reusing the shared governed-config lifecycle aspect (clone → version →
// activate) — the same pattern PrioritisationModel proves. The compute engine (srv/lib/bhi.js)
// keeps its shape: config is assembled from the ACTIVE model's rows into the exact object
// resolveBhiConfig already understands. See docs/CONFIGURABLE-ENGINES-ASSESSMENT.md §6.
// ─────────────────────────────────────────────────────────────────────────────
using { plugins.governedconfig.governedModel } from '../srv/lib/plugins/governed-config/governed-config-schema';
using { cuid } from '@sap/cds/common';

namespace bridge.management;

// A named, versioned BHI weight-set. Exactly one version per `code` is Active at a time.
entity BhiModel : governedModel {
  // Element weights (mode defaults + per-class overrides) and environmental coefficients.
  weights      : Composition of many BhiWeight       on weights.model = $self;
  coefficients : Composition of many BhiCoefficient  on coefficients.model = $self;
}

// One element-group weight. The (assetClass, mode) pair is the precedence key resolved by the
// governed-config precedenceResolve ladder: assetClass '*' = the mode-level default; a real
// assetClass = a per-class override for that mode. `calibrated` is the per-mode honesty flag
// (meaningful on the assetClass='*' rows).
entity BhiWeight : cuid {
  model      : Association to BhiModel;
  assetClass : String(40) default '*';   // '*' = all classes (mode default); else -> AssetClasses.code
  mode       : String(40);               // Road | RoadOverWater | Rail | Pedestrian
  bucket     : String(40);               // deck | superstructure | substructure | bearings | drainage | approach
  weight     : Decimal(6, 4);            // relative weight (BSI normalises by the total)
  calibrated : Boolean default false;    // per-mode: is this mode's weighting standards-calibrated?
}

// One environmental / age / importance coefficient (e.g. floodStep, ageSpanYears, rslUtilisation).
entity BhiCoefficient : cuid {
  model      : Association to BhiModel;
  coeffKey   : String(40);
  coeffValue : Decimal(12, 4);
}
