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

  // ── Multi-modal lookups (Phase 1) ──
  @restrict: [{ grant: 'READ', to: 'view' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'admin' }]
  entity TransportModes as projection on my.TransportModes;

  @restrict: [{ grant: 'READ', to: 'view' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'admin' }]
  entity Networks as projection on my.Networks;

  @restrict: [{ grant: 'READ', to: 'view' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'admin' }]
  entity LaneAvailabilityTypes as projection on my.LaneAvailabilityTypes;

  @restrict: [{ grant: 'READ', to: 'view' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'admin' }]
  entity RestrictionSeverities as projection on my.RestrictionSeverities;

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
  entity EAMCodeMapping as projection on my.EAMCodeMapping;

  // ── Risk & Asset-Class Strategy governance (Phase 4) ──
  @restrict: [{ grant: 'READ', to: 'view' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'admin' }]
  entity AssetClassStrategy as projection on my.AssetClassStrategy;

  @restrict: [{ grant: 'READ', to: 'view' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'admin' }]
  entity RiskConfig as projection on my.RiskConfig;

  @restrict: [{ grant: 'READ', to: 'view' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'admin' }]
  entity RiskBand as projection on my.RiskBand;

  // Recalculate risk scores for all active bridges (admin) — Phase 2 backfill/refresh.
  @requires: 'admin'
  action recalcRisk() returns String;

  @restrict: [{ grant: '*', to: 'admin' }]
  entity BnacEnvironment as projection on my.BnacEnvironment;

  @restrict: [{ grant: '*', to: 'admin' }]
  entity BnacObjectIdMap as projection on my.BnacObjectIdMap;

  // ── Audit and monitoring — manager+admin read only ──
  @readonly
  @restrict: [{ grant: 'READ', to: 'manage' }]
  entity ChangeLog as projection on my.ChangeLog;

  // ── Unified Change-Document report (ALV / Fiori Elements) ──
  // Standard field changes (ChangeLog) + custom-attribute value changes
  // (AttributeValueHistory) in one read-only entity for the FE List Report.
  @readonly
  @restrict: [{ grant: 'READ', to: 'manage' }]
  entity ChangeDocumentReport as
    select from my.ChangeLog {
      key ID,
          changedAt,
          changedBy,
          objectType,
          objectId,
          objectName,
          fieldName,
          oldValue,
          newValue,
          changeSource,
          batchId,
          'Field' as changeKind : String(20)
    }
    union all
    select from my.AttributeValueHistory {
      key historyId as ID,
          changedAt,
          changedBy,
          ( case objectType
              when 'bridge'      then 'Bridge'
              when 'restriction' then 'Restriction'
              else objectType
            end ) as objectType : String(40),
          objectId,
          objectId      as objectName : String(255),
          attributeKey  as fieldName  : String(111),
          coalesce(
            oldValueText,
            cast(oldValueInteger as String),
            cast(oldValueDecimal as String),
            cast(oldValueDate as String),
            case when oldValueBoolean = true then 'true' when oldValueBoolean = false then 'false' else null end
          ) as oldValue : LargeString,
          coalesce(
            newValueText,
            cast(newValueInteger as String),
            cast(newValueDecimal as String),
            cast(newValueDate as String),
            case when newValueBoolean = true then 'true' when newValueBoolean = false then 'false' else null end
          ) as newValue : LargeString,
          changeSource,
          null          as batchId : String(111),
          'Attribute' as changeKind : String(20)
    };

  // ── Multi-mode Network Restrictions report (ALV / ALP) — Phase 3 ──
  // Joins restrictions with parent-bridge mode/network/risk for slice-and-dice.
  @readonly
  @cds.redirection.target: false
  @restrict: [{ grant: 'READ', to: 'view' }]
  entity NetworkRestrictionReport as
    select from my.BridgeRestrictions {
      key ID,
          bridge.bridgeId                          as bridgeId   : String(40),
          bridge.bridgeName                        as bridgeName : String(111),
          coalesce(transportMode, bridge.transportMode) as transportMode : String(40),
          coalesce(network, bridge.network)        as network    : String(80),
          bridge.state                             as state      : String(40),
          bridge.region                            as region     : String(80),
          bridge.riskPriority                      as riskPriority : String(20),
          restrictionRef,
          restrictionCategory,
          restrictionType,
          restrictionValue,
          restrictionUnit,
          restrictionSeverity,
          laneAvailability,
          lanesOpen,
          lanesTotal,
          laneWidthLimit,
          grossMassLimit,
          heightLimit,
          widthLimit,
          restrictionStatus,
          issuingAuthority,
          effectiveFrom,
          effectiveTo,
          active,
          1 as restrUnit : Integer   // SUM(restrUnit) = restriction count, for the ALP chart measure
    };

  // ── Bridge Risk report (ALV) — Phase 2 ──
  @readonly
  @cds.redirection.target: false
  @restrict: [{ grant: 'READ', to: 'view' }]
  entity BridgeRiskReport as
    select from my.Bridges {
      key ID,
          bridgeId,
          bridgeName,
          transportMode,
          network,
          state,
          region,
          assetClass,
          condition,
          conditionRating,
          structuralAdequacyRating,
          importanceLevel,
          averageDailyTraffic,
          highPriorityAsset,
          riskConsequence,
          riskLikelihood,
          riskScore,
          riskPriority,
          riskOverride,
          ( case riskPriority when 'Very High' then 1 when 'High' then 1 when 'Medium' then 2 when 'Low' then 3 else 0 end ) as riskCriticality : Integer,
          postingStatus,
          lastInspectionDate,
          status
    };

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
