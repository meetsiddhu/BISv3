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
  };
}
