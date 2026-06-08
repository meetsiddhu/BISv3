using {bridge.management as my} from '../db/schema';

// Bounded prioritisation service. XSUAA-first, reusing the existing scopes (view=read,
// manage=create a run, admin=config) — no new scope (avoids a role-collection re-grant).
@requires: ['view', 'manage', 'admin']
service PrioritisationService {

  // Immutable, append-only runs: READ for view, CREATE for manage. NO update/delete granted —
  // a correction creates a NEW run (linked via supersededBy); removal is soft (deactivate, admin).
  @restrict: [
    { grant: 'READ',       to: 'view'   },
    { grant: 'CREATE',     to: 'manage' },
    { grant: 'deactivate', to: 'admin'  }
  ]
  entity Assessments as projection on my.PrioritisationAssessment actions {
    action deactivate() returns Assessments;
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
  };
}
