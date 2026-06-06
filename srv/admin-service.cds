using {bridge.management as my} from '../db/schema';

@requires: ['view', 'manage', 'admin']
service AdminService {

  // ── Bridges ── viewer: read | manager: create/update/soft-delete actions
  // Soft-delete only (locked architectural rule): no hard DELETE is granted to any
  // role. Removal is performed via the `deactivate` action, preserving the audit trail.
  @restrict: [
    { grant: 'READ',                                         to: 'view'   },
    { grant: ['CREATE','UPDATE','deactivate','reactivate'],  to: 'manage' }
  ]
  entity Bridges as projection on my.Bridges {
    *,
    virtual hasCapacity : Boolean
  } actions {
    action deactivate() returns Bridges;
    action reactivate() returns Bridges;
  };

  // ── Restrictions ── viewer: read | manager: create/update/soft-delete actions
  // Soft-delete only: no hard DELETE granted. Use the `deactivate` action.
  @restrict: [
    { grant: 'READ',                                         to: 'view'   },
    { grant: ['CREATE','UPDATE','deactivate','reactivate'],  to: 'manage' }
  ]
  entity Restrictions as projection on my.Restrictions actions {
    action deactivate() returns Restrictions;
    action reactivate() returns Restrictions;
  };

  // ── Bridge Restrictions ── viewer: read | manager: create/update/soft-delete actions
  // Soft-delete only: no hard DELETE granted. Use the `deactivate` action.
  @restrict: [
    { grant: 'READ',                                         to: 'view'   },
    { grant: ['CREATE','UPDATE','deactivate','reactivate'],  to: 'manage' }
  ]
  entity BridgeRestrictions as projection on my.BridgeRestrictions actions {
    action deactivate() returns BridgeRestrictions;
    action reactivate() returns BridgeRestrictions;
  };

  // ── Bridge detail entities ── viewer: read | manager: write
  @restrict: [
    { grant: 'READ',                       to: 'view'   },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'manage' }
  ]
  entity BridgeCapacities as projection on my.BridgeCapacities;

  @restrict: [
    { grant: 'READ',                       to: 'view'   },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'manage' }
  ]
  entity BridgeAttributes as projection on my.BridgeAttributes;

  @restrict: [
    { grant: 'READ',                       to: 'view'    },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'manage'  }
  ]
  entity BridgeInspections as projection on my.BridgeInspections;

  @restrict: [
    { grant: 'READ',                       to: 'view'    },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'manage'  }
  ]
  entity BridgeDefects as projection on my.BridgeDefects;

  @restrict: [
    { grant: 'READ',                       to: 'view'   },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'manage' }
  ]
  entity BridgeDocuments as projection on my.BridgeDocuments;

  // ── Lookup tables ── viewer: read | admin: mutate
  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity AssetClasses as projection on my.AssetClasses;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity States as projection on my.States;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity Regions as projection on my.Regions;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity StructureTypes as projection on my.StructureTypes;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity DesignLoads as projection on my.DesignLoads;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity PostingStatuses as projection on my.PostingStatuses;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity CapacityStatuses as projection on my.CapacityStatuses;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity ConditionStates as projection on my.ConditionStates;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity PbsApprovalClasses as projection on my.PbsApprovalClasses;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity ConditionSummaries as projection on my.ConditionSummaries;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity StructuralAdequacyTypes as projection on my.StructuralAdequacyTypes;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity RestrictionTypes as projection on my.RestrictionTypes;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity RestrictionStatuses as projection on my.RestrictionStatuses;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity VehicleClasses as projection on my.VehicleClasses;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity RestrictionCategories as projection on my.RestrictionCategories;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity RestrictionUnits as projection on my.RestrictionUnits;

  @restrict: [
    { grant: 'READ',                       to: 'view'  },
    { grant: ['CREATE','UPDATE','DELETE'],  to: 'admin' }
  ]
  entity RestrictionDirections as projection on my.RestrictionDirections;

  // ── Read-only for all authenticated users ──
  @readonly
  @restrict: [{ grant: 'READ', to: 'view' }]
  entity AttributeValues as projection on my.AttributeValues;

  @readonly
  @restrict: [{ grant: 'READ', to: 'view' }]
  entity AttributeValueHistory as projection on my.AttributeValueHistory;

  // ── Admin tile — configuration entities — admin only ──
  @restrict: [{ grant: '*', to: 'admin' }]
  entity GISConfig as projection on my.GISConfig;

  @restrict: [{ grant: '*', to: 'admin' }]
  entity ReferenceLayerConfig as projection on my.ReferenceLayerConfig;

  @restrict: [{ grant: '*', to: 'admin' }]
  entity SystemConfig as projection on my.SystemConfig;

  @restrict: [{ grant: '*', to: 'admin' }]
  entity DataQualityRules as projection on my.DataQualityRules;

  @restrict: [{ grant: '*', to: 'admin' }]
  entity AttributeGroups as projection on my.AttributeGroups;

  @restrict: [{ grant: '*', to: 'admin' }]
  entity AttributeDefinitions as projection on my.AttributeDefinitions;

  @restrict: [{ grant: '*', to: 'admin' }]
  entity AttributeAllowedValues as projection on my.AttributeAllowedValues;

  @restrict: [{ grant: '*', to: 'admin' }]
  entity AttributeObjectTypeConfig as projection on my.AttributeObjectTypeConfig;

  @restrict: [{ grant: '*', to: 'admin' }]
  entity BnacEnvironment as projection on my.BnacEnvironment;

  @restrict: [{ grant: '*', to: 'admin' }]
  entity BnacObjectIdMap as projection on my.BnacObjectIdMap;

  // ── Audit and monitoring — manager+admin read only ──
  @readonly
  @restrict: [{ grant: 'READ', to: 'manage' }]
  entity ChangeLog as projection on my.ChangeLog;

  @readonly
  @restrict: [{ grant: 'READ', to: 'admin' }]
  entity UserActivity as projection on my.UserActivity;

  @readonly
  @restrict: [{ grant: 'READ', to: 'admin' }]
  entity BnacLoadHistory as projection on my.BnacLoadHistory;

  // ── Demo Mode — admin only ──
  @requires: 'admin'
  action loadDemoData()  returns String;

  @requires: 'admin'
  action clearDemoData() returns String;

  // Synthetic value list for the Bridge status filter — served inline, no DB table.
  @readonly
  @cds.persistence.skip
  entity BridgeStatusValues {
    key code : String(20);
        name : String(30);
  }

  // Synthetic value lists for integer-rated fields (severity, urgency, accreditation level).
  // Rendered as dropdowns to prevent stale UI5 integer-parse validation messages.
  @readonly @cds.persistence.skip
  entity SeverityValues {
    key code : Integer;
        name : String(30);
  }
  @readonly @cds.persistence.skip
  entity UrgencyValues {
    key code : Integer;
        name : String(30);
  }
  @readonly @cds.persistence.skip
  entity AccreditationLevelValues {
    key code : Integer;
        name : String(30);
  }
}

annotate AdminService.Bridges     with { modifiedAt @odata.etag }
annotate AdminService.Restrictions with { modifiedAt @odata.etag }
