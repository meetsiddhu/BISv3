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
    virtual hasCapacity : Boolean,
    // FE_UX-1: object-page risk criticality. VIRTUAL (computed in an after-READ handler),
    // NOT a calculated SQL column — a calculated CASE on a draft-enabled entity is
    // mis-translated by the CAP draft engine to invalid SQL and 500s draftEdit.
    virtual riskCriticality : Integer,
    // External Systems tab: BNAC object-id links surfaced by business-key match on
    // bridgeId (BnacObjectIdMap is keyed by bridgeId; no managed FK). Read-only on the page.
    _bnacLinks : Association to many my.BnacObjectIdMap on _bnacLinks.bridgeId = bridgeId
  } actions {
    action deactivate() returns Bridges;
    action reactivate() returns Bridges;
  };

  // ── Bridge value help — same source as the live Bridges register ──────────
  // AdminService.Bridges injects status='Active' into collection reads with no
  // explicit status filter (the register default). The Restrictions app value
  // help reads THIS dedicated read-only projection on the SAME
  // bridge.management.Bridges table, with no injector, so any bridge the
  // register can show (Active or Inactive via its status filter) is linkable.
  // Parity is asserted by test/restrictions-value-help.test.js.
  @readonly
  @cds.redirection.target: false
  @restrict: [{ grant: 'READ', to: 'view' }]
  entity BridgeValueHelp as projection on my.Bridges {
    key ID,
        bridgeId,
        bridgeName,
        state,
        region,
        transportMode,
        status
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

  // EAM-T5: EAM integration config is operated by the dedicated 'integration' scope
  // (separate from app admin) or admin.
  @restrict: [{ grant: '*', to: ['admin','integration'] }]
  entity EAMCodeMapping as projection on my.EAMCodeMapping;

  // EAM-2: admin-configurable BIS<->EAM field mapping (no hardcoded maps in sync code).
  @restrict: [{ grant: '*', to: ['admin','integration'] }]
  entity EAMFieldMapping as projection on my.EAMFieldMapping;

  // EAM-3: append-only EAM sync audit trail — read-only, admin/integration.
  @readonly
  @restrict: [{ grant: 'READ', to: ['admin','integration'] }]
  entity EAMSyncLog as projection on my.EAMSyncLog;

  // INSPECT-4 / EAM-4: bridge element hierarchy + element-type codelist.
  @restrict: [{ grant: 'READ', to: 'view' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'manage' }]
  entity BridgeElements as projection on my.BridgeElements;
  @readonly
  @restrict: [{ grant: 'READ', to: 'view' }]
  entity ElementTypes as projection on my.ElementTypes;

  // AUDIT-009: NSW bridge-classification codelist behind importanceLevel.
  @restrict: [{ grant: 'READ', to: 'view' }, { grant: ['CREATE','UPDATE','DELETE'], to: 'admin' }]
  entity ImportanceLevels as projection on my.ImportanceLevels;

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

  // READ for view/manage so the bridge object page can show BNAC links; maintain = admin.
  @restrict: [
    { grant: 'READ', to: ['view','manage','admin'] },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'admin' }
  ]
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
          cast(( case objectType
              when 'bridge'      then 'Bridge'
              when 'restriction' then 'Restriction'
              else objectType
            end ) as String(40)) as objectType : String(40),
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
  // R6 UNIFICATION: reads my.UnifiedRestrictions — the UNION view over BOTH
  // restriction masters (Restrictions app rows AND Bridges-register
  // BridgeRestrictions rows) — so this report can never disagree with the
  // operational dashboard again. `sourceMaster` discloses which master a row
  // came from. Bridge mode/network/risk columns come pre-joined from the view.
  @readonly
  @cds.redirection.target: false
  @restrict: [{ grant: 'READ', to: 'view' }]
  entity NetworkRestrictionReport as
    select from my.UnifiedRestrictions {
      key ID,
          sourceMaster,
          bridgeId,
          bridgeName,
          transportMode,
          network,
          state,
          region,
          riskPriority,
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
          // ── New type-relevant attributes surfaced for slice-and-dice (additive) ──
          appliesToVehicleClass,
          direction,
          speedLimit,
          lengthLimit,
          axleMassLimit,
          grossCombinationLimit,
          permitRequired,
          escortRequired,
          gazetteNumber,
          gazetteExpiryDate,
          reviewDueDate,
          restrictionReason,
          detourRoute,
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
          // Gap A / INSPECT-1/2: strategy-driven inspection-due signal in the worklist.
          assetClassStrategy.name                     as strategyName             : String,
          assetClassStrategy.inspectionIntervalMonths as inspectionIntervalMonths : Integer,
          nextInspectionDue,
          inspectionOverdue,
          ( case inspectionOverdue when true then 1 else 3 end ) as overdueCriticality : Integer,
          // ISO-AUDIT-005: SAMP policy-intervention signal.
          policyInterventionDue,
          // ELEM-1/AUDIT-010: worst rolled-up element condition + provenance of the rating.
          worstElementCondition,
          conditionSource,
          // ISO 55000 capital-planning columns (RISK-2/4) — decision-support.
          estimatedRulYears,
          likelyFailureCostAud,
          expectedValueAud,
          benefitCostRatio,
          // ISO-AUDIT-009: explicit ROI decision band so a null/0 ratio isn't ambiguous.
          ( case
              when benefitCostRatio is null then 'Insufficient Data'
              when benefitCostRatio > 1     then 'Viable'
              when benefitCostRatio >= 0    then 'Marginal'
              else 'Unviable'
            end ) as roiStatus : String(20),
          mitigationCostAud,
          status
    };

  // NET-1: network-level portfolio analytics — aggregate condition/risk/backlog per
  // network + transport mode for capital-planning ALP consumption (PIARC/Austroads AGAM
  // network view). Read-only; the per-bridge worklist remains BridgeRiskReport.
  // PRE-MORTEM MUST-FIX 6/7: rendered as a flat ListReport of pre-aggregated rows (NOT an FE
  // ALP with $apply re-aggregation — that would re-aggregate already-aggregated columns and
  // average-of-averages incorrectly). Single non-null synthetic key (network+mode are
  // nullable, and network alone collided across modes); dimensions COALESCE'd so a bridge with
  // no network/mode still groups into a stable "Unassigned" row instead of a null OData key.
  @readonly
  @cds.redirection.target: false
  @restrict: [{ grant: 'READ', to: 'view' }]
  entity NetworkPortfolioReport as
    select from my.Bridges {
      key (coalesce(network, 'Unassigned') || ' | ' || coalesce(transportMode, 'Unassigned')) as portfolioKey : String(170),
          coalesce(network, 'Unassigned')                                             as network              : String(80),
          coalesce(transportMode, 'Unassigned')                                       as transportMode        : String(40),
          count(*)                                                                    as bridgeCount          : Integer,
          avg(conditionRating)                                                        as avgCondition         : Decimal(4, 2),
          avg(riskScore)                                                              as avgRiskScore         : Decimal(6, 2),
          sum(case when riskPriority = 'Very High' or riskPriority = 'High' then 1 else 0 end) as highRiskCount : Integer,
          // HANA requires an explicit boolean comparison in a searched CASE (a bare boolean
          // column is invalid — "syntax near THEN"); SQLite tolerates the bare form.
          sum(case when inspectionOverdue = true then 1 else 0 end)                   as overdueCount         : Integer,
          sum(case when policyInterventionDue = true then 1 else 0 end)               as interventionDueCount : Integer,
          sum(expectedValueAud)                                                       as totalExpectedValueAud: Decimal(15, 2),
          sum(mitigationCostAud)                                                      as totalMitigationCostAud: Decimal(15, 2)
    }
    group by network, transportMode;

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

// Free-text search for the bridge value-help dialog (Restrictions app).
annotate AdminService.BridgeValueHelp with @cds.search: {
  bridgeId,
  bridgeName,
  state
};
