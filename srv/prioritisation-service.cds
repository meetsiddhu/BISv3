using {bridge.management as my} from '../db/schema';

// Bounded prioritisation service. XSUAA-first, reusing the existing scopes (view=read,
// manage=create a run, admin=config) — no new scope (avoids a role-collection re-grant).
@requires: ['view', 'manage', 'admin']
service PrioritisationService {

  // Immutable, append-only runs: READ for view, CREATE for manage. NO update/delete granted —
  // a correction creates a NEW run (linked via supersededBy); removal is soft (deactivate, admin).
  @restrict: [
    { grant: 'READ',              to: 'view'   },
    { grant: 'CREATE',            to: 'manage' },
    { grant: 'raiseWorkRequest',  to: 'manage' },
    { grant: 'deactivate',        to: 'admin'  }
  ]
  entity Assessments as projection on my.PrioritisationAssessment actions {
    action deactivate() returns Assessments;
    // Raise an inspection/intervention WORK REQUEST to SAP EAM for this asset. Creates a local
    // outbound record only (never writes EAM master). manage-gated.
    @Common.SideEffects: { TargetEntities: ['/WorkRequests'] }
    action raiseWorkRequest(requestType : String, notes : String) returns WorkRequests;
  };

  // Outbound EAM work-request queue/audit (read for view; created only via raiseWorkRequest;
  // soft-delete via deactivate). Append-only at the data layer — no direct CREATE/UPDATE.
  @restrict: [
    { grant: 'READ',       to: 'view'   },
    { grant: 'deactivate', to: 'manage' }
  ]
  entity WorkRequests as projection on my.EamWorkRequest actions {
    action deactivate() returns WorkRequests;
  };

  // Versioned engine config — read for everyone, only admin writes a new version.
  @restrict: [
    { grant: 'READ',              to: 'view'  },
    { grant: ['CREATE','UPDATE'], to: 'admin' }
  ]
  entity Config as projection on my.PrioritisationConfig;

  // Read-only register slice for the "pick a bridge" + worklist context (federated facts).
  @readonly
  entity AssessableBridges as projection on my.Bridges {
    key ID, bridgeId, bridgeName, transportMode, network, state,
        riskScore, riskPriority, conditionRating, structuralAdequacyRating,
        importanceLevel, lastInspectionDate, loadRating, ratingStandardType, postingStatus
  };

  // Prefill the Assess screen with read-only federated facts + engine-derived defaults for a
  // bridge. Pure read (never writes). The user supplies only judgement on top of these.
  action prefill(bridgeID : Integer) returns {
    bridgeRef            : String;
    bridgeName           : String;
    conditionRating      : Integer;
    structuralAdequacyRating : Integer;
    loadRating           : Decimal;
    ratingStandardType   : String;
    restrictionFlag      : Boolean;
    restrictionSummary   : String;
    derivedLikelihood    : Integer;
    inputsAvailable      : Integer;
    inputsTotal          : Integer;
    conditionAsAtMonths  : Integer;
    // RULE-ENGINE (additive): the model resolved for this asset's class/mode + a read-only
    // preview of the auto-bound criteria (raw value, source, value-function score) as JSON.
    modelCode            : String;
    modelVersion         : Integer;
    modelName            : String;
    aggregationMethod    : String;
    autoCriteria         : LargeString;
  };

  // ── Configurable rule engine — governed config (Model Builder backend). READ for view;
  // writes admin-only; every CUD ChangeLogged; soft-delete via status/active. ──
  @restrict: [
    { grant: 'READ',               to: 'view'  },
    { grant: ['CREATE', 'UPDATE'], to: 'admin' }
  ]
  entity Models as projection on my.PrioritisationModel;

  @restrict: [
    { grant: 'READ',               to: 'view'  },
    { grant: ['CREATE', 'UPDATE'], to: 'admin' }
  ]
  entity ModelCriteria as projection on my.ModelCriterion;

  @restrict: [
    { grant: 'READ',               to: 'view'  },
    { grant: ['CREATE', 'UPDATE'], to: 'admin' }
  ]
  entity ModelClassWeights as projection on my.AssetClassCriterionWeight;

  @restrict: [
    { grant: 'READ',               to: 'view'  },
    { grant: ['CREATE', 'UPDATE'], to: 'admin' }
  ]
  entity ModelRules as projection on my.AggregationRule;

  @restrict: [
    { grant: 'READ',               to: 'view'  },
    { grant: ['CREATE', 'UPDATE'], to: 'admin' }
  ]
  entity ModelBindings as projection on my.CriterionSourceBinding;

  @restrict: [
    { grant: 'READ',               to: 'view'  },
    { grant: ['CREATE', 'UPDATE'], to: 'admin' }
  ]
  entity ModelValueBands as projection on my.CriterionValueBand;

  // Server-rendered, branded, paginated A4 PDF of the exec one-pager (figures computed server-side
  // from the immutable runs — reproducible, not the client's view). Returns base64 bytes so it
  // travels over the existing /odata route + honours @restrict; the client wraps it in a Blob.
  function reportPdf() returns {
    filename       : String;
    contentType    : String;
    contentBase64  : LargeString;
    docId          : String;
  };
}

// G4/G8 (additive): fleet batch scoring + portfolio data-readiness.
extend service PrioritisationService with {
  // Council B2 (additive): the result now carries the ACTIVE-fleet denominator + a loud
  // truncation flag so a capped run can never be mistaken for a full fleet ranking.
  @(requires: ['manage', 'admin'])
  action scoreFleet(limit : Integer) returns { fleetRunId : String; scored : Integer; excluded : Integer; excludedDetail : LargeString; fleetTotal : Integer; truncated : Boolean; };
  function dataReadiness() returns { criteria : LargeString; };
  // BSI/BHI: compute + persist the element-weighted indices for one bridge (or all when null).
  @(requires: ['manage', 'admin'])
  action computeBhi(bridgeID : Integer) returns { updated : Integer; };
  // BHI/BSI explorer detail: per-bridge factors, element buckets, all-mode model comparison and
  // the substituted formulas (mirrors the approved calculator page). Read-only.
  function bhiDetail(bridgeID : Integer) returns { detail : LargeString; };

  @restrict: [{ grant: 'READ', to: 'view' }, { grant: ['CREATE','UPDATE'], to: 'admin' }]
  entity UserTypesConfig as projection on my.UserTypes;
  @restrict: [{ grant: 'READ', to: 'view' }, { grant: ['CREATE','UPDATE'], to: 'admin' }]
  entity ModelUserTypeWeights as projection on my.UserTypeCriterionWeight;
  @restrict: [{ grant: 'READ', to: 'view' }, { grant: ['CREATE','UPDATE'], to: 'admin' }]
  entity PreFilters as projection on my.PrioritisationPreFilter;

  // B6b: the governed change path for a referenced Active model. In-place MATERIAL edits on an
  // Active model that active assessment runs reference are rejected (409); this action instead
  // deep-copies the full bundle (model + criteria + bindings + value bands + class weights +
  // rules + user-type weights) to version = max(version)+1 as a new Draft with fresh UUIDs.
  // Admin-only; the clone is ChangeLogged with its source model and bundle counts.
  @(requires: 'admin')
  action cloneModel(modelID : UUID) returns {
    modelID         : UUID;
    code            : String;
    version         : Integer;
    status          : String;
    criteria        : Integer;
    bindings        : Integer;
    bands           : Integer;
    classWeights    : Integer;
    rules           : Integer;
    userTypeWeights : Integer;
  };
}
