using { bridge.management.Restrictions } from '../../db/schema';
using { AdminService } from '../../srv/admin-service';

////////////////////////////////////////////////////////////////////////////
//  Search configuration (service-agnostic — applies to all services)
////////////////////////////////////////////////////////////////////////////

annotate Restrictions with @cds.search: {
  restrictionRef,
  name,
  bridge.bridgeId,
  bridge.bridgeName,
  legalReference,
  issuingAuthority
};

////////////////////////////////////////////////////////////////////////////
//  List Report — AdminService.Restrictions
////////////////////////////////////////////////////////////////////////////

annotate AdminService.Restrictions with @(
  Capabilities.InsertRestrictions.Insertable : true,
  Capabilities.UpdateRestrictions.Updatable  : true,
  Capabilities.DeleteRestrictions.Deletable  : false,
  UI.HeaderInfo: {
    TypeName      : 'Restriction',
    TypeNamePlural: 'Restrictions',
    Title         : { Value: restrictionRef },
    Description   : { Value: bridge.bridgeName }
  },
  UI.SelectionFields: [
    restrictionRef, bridgeRef, restrictionType,
    restrictionStatus, restrictionCategory,
    permitRequired, temporary, active
  ],
  UI.LineItem: [
    { Value: restrictionRef,          Label: 'Restriction Ref' },
    { Value: bridge.bridgeId,         Label: 'Bridge ID' },
    { Value: bridge.bridgeName,       Label: 'Bridge' },
    { Value: restrictionCategory,     Label: 'Category' },
    { Value: restrictionType,         Label: 'Type' },
    { Value: restrictionValue,        Label: 'Value' },
    { Value: restrictionUnit,         Label: 'Unit' },
    { Value: appliesToVehicleClass,   Label: 'Vehicle Class' },
    { Value: restrictionStatus,       Label: 'Status' },
    { Value: temporary,               Label: 'Temp' },
    { Value: permitRequired,          Label: 'Permit Req.' },
    { Value: effectiveFrom,           Label: 'From' },
    { Value: effectiveTo,             Label: 'To' },
    { Value: active,                  Label: 'Active' },
    { Value: restrictionSeverity,     Label: 'Severity' },
    { Value: gazetteExpiryDate,       Label: 'Gazette Expiry' },
    { Value: reviewDueDate,           Label: 'Review Due' },
  ],
  UI.Identification: [
    {
      $Type       : 'UI.DataFieldForAction',
      Action      : 'AdminService.deactivate',
      Label       : 'Deactivate',
      Criticality : #Negative,
      ![@UI.Hidden]: { $edmJson: { $Or: [
        { $Eq: [{ $Path: 'active' }, false] },
        { $Not: { $Path: 'IsActiveEntity' } }
      ] } }
    },
    {
      $Type       : 'UI.DataFieldForAction',
      Action      : 'AdminService.reactivate',
      Label       : 'Reactivate',
      Criticality : #Positive,
      ![@UI.Hidden]: { $edmJson: { $Or: [
        { $Ne: [{ $Path: 'active' }, false] },
        { $Not: { $Path: 'IsActiveEntity' } }
      ] } }
    }
  ]
);

////////////////////////////////////////////////////////////////////////////
//  Object Page — AdminService.Restrictions
////////////////////////////////////////////////////////////////////////////

annotate AdminService.Restrictions with @(
  UI: {
    Facets: [
      // ── Tab 1: Restriction Classification (3 sub-sections) ───────────────
      {
        $Type : 'UI.CollectionFacet',
        Label : 'Restriction Classification',
        ID    : 'RstClassification',
        Facets: [
          {$Type: 'UI.ReferenceFacet', Label: 'Identification', Target: '@UI.FieldGroup#RstIdentification'},
          {$Type: 'UI.ReferenceFacet', Label: 'Applicability',  Target: '@UI.FieldGroup#RstApplicability'},
          {$Type: 'UI.ReferenceFacet', Label: 'Value',          Target: '@UI.FieldGroup#RstValue'},
        ]
      },
      // ── Tab 2: Physical Limits (4 sub-sections) ──────────────────────────
      {
        $Type : 'UI.CollectionFacet',
        Label : 'Physical Limits',
        ID    : 'RstPhysicalLimits',
        Facets: [
          {$Type: 'UI.ReferenceFacet', Label: 'Mass Limits (t)',    Target: '@UI.FieldGroup#RstMassLimits'},
          {$Type: 'UI.ReferenceFacet', Label: 'Dimensional Limits', Target: '@UI.FieldGroup#RstDimLimits'},
          {$Type: 'UI.ReferenceFacet', Label: 'Axle & Combination Limits (t)', Target: '@UI.FieldGroup#RstAxleLimits'},
          {$Type: 'UI.ReferenceFacet', Label: 'Lane Configuration', Target: '@UI.FieldGroup#RstLaneConfig'},
        ]
      },
      // ── Tab 3: Validity & Approval (5 sub-sections) ──────────────────────
      {
        $Type : 'UI.CollectionFacet',
        Label : 'Validity & Approval',
        ID    : 'RstValidity',
        Facets: [
          {$Type: 'UI.ReferenceFacet', Label: 'Effective Period',    Target: '@UI.FieldGroup#RstEffective'},
          {$Type: 'UI.ReferenceFacet', Label: 'Temporary Condition', Target: '@UI.FieldGroup#RstTemporary'},
          {$Type: 'UI.ReferenceFacet', Label: 'Approval & Legal',    Target: '@UI.FieldGroup#RstApproval'},
          {$Type: 'UI.ReferenceFacet', Label: 'Gazette & Review',    Target: '@UI.FieldGroup#RstGazette'},
          {$Type: 'UI.ReferenceFacet', Label: 'Enforcement',         Target: '@UI.FieldGroup#RstEnforcement'},
        ]
      },
      // ── Tab 4: Notes ─────────────────────────────────────────────────────
      {$Type: 'UI.ReferenceFacet', Label: 'Notes', Target: '@UI.FieldGroup#RstNotes'},
    ],

    // ── FieldGroups ─────────────────────────────────────────────────────────

    // Tab 1 — Classification
    FieldGroup#RstIdentification: {
      Data: [
        {Value: restrictionRef},   // server-generated and read-only
        {Value: bridgeRef},
        {Value: restrictionCategory},
        {Value: restrictionType},
        {Value: restrictionStatus},
        {Value: active},           // read-only — managed by Deactivate / Reactivate actions
      ]
    },
    FieldGroup#RstApplicability: {
      Data: [
        {Value: appliesToVehicleClass},
        {Value: pbsClassApplicable},
        {Value: direction},
        {Value: permitRequired},
        {Value: escortRequired},
        {Value: pilotVehicleCount},
        {Value: signageRequired},
        // 'temporary' boolean is auto-derived from restrictionCategory — not shown in form
      ]
    },
    FieldGroup#RstValue: {
      Data: [
        {Value: restrictionValue},
        {Value: restrictionUnit},
      ]
    },

    // Tab 2 — Physical Limits
    FieldGroup#RstMassLimits: {
      Data: [
        {Value: grossMassLimit},
        {Value: axleMassLimit},
      ]
    },
    FieldGroup#RstDimLimits: {
      Data: [
        {Value: heightLimit},
        {Value: widthLimit},
        {Value: lengthLimit},
        {Value: speedLimit},
      ]
    },
    // New per-type limits (Axle Group Limit / Gross Combination Mass types)
    FieldGroup#RstAxleLimits: {
      Data: [
        {Value: grossCombinationLimit},
        {Value: steerAxleLimit},
        {Value: tandemAxleLimit},
        {Value: triAxleLimit},
      ]
    },
    // Lane Restriction type attributes (parity with BridgeRestrictions)
    FieldGroup#RstLaneConfig: {
      Data: [
        {Value: laneAvailability},
        {Value: lanesOpen},
        {Value: lanesTotal},
        {Value: laneWidthLimit},
        {Value: restrictionSeverity},
      ]
    },

    // Tab 3 — Validity & Approval
    FieldGroup#RstEffective: {
      Data: [
        {Value: effectiveFrom},   // mandatory — see field annotation below
        {Value: effectiveTo},
      ]
    },
    // Temporary-only fields — hidden when restrictionCategory != 'Temporary'
    FieldGroup#RstTemporary: {
      Data: [
        {
          $Type : 'UI.DataField',
          Value : temporaryFrom,
          ![@UI.Hidden]: { $edmJson: { $Ne: [{ $Path: 'restrictionCategory' }, 'Temporary'] } }
        },
        {
          $Type : 'UI.DataField',
          Value : temporaryTo,
          ![@UI.Hidden]: { $edmJson: { $Ne: [{ $Path: 'restrictionCategory' }, 'Temporary'] } }
        },
        {
          $Type : 'UI.DataField',
          Value : temporaryReason,
          ![@UI.Hidden]: { $edmJson: { $Ne: [{ $Path: 'restrictionCategory' }, 'Temporary'] } }
        },
      ]
    },
    FieldGroup#RstApproval: {
      Data: [
        {Value: approvedBy},
        {Value: approvalDate},
        {Value: approvalReference},
        {Value: legalReference},
        {Value: issuingAuthority},
      ]
    },
    // NSW gazettal workflow attributes (ported from the nhvr model — additive)
    FieldGroup#RstGazette: {
      Data: [
        {Value: gazetteNumber},
        {Value: gazettePublicationDate},
        {Value: gazetteExpiryDate},
        {Value: reviewDueDate},
      ]
    },
    FieldGroup#RstEnforcement: {
      Data: [
        {Value: enforcementAuthority},
        {Value: restrictionReason},
        {Value: detourRoute},
        {Value: conditionTrigger},
      ]
    },

    // Tab 4 — Notes
    FieldGroup#RstNotes: {
      Data: [
        {Value: remarks},
        {Value: descr},
      ]
    },
  }
);

////////////////////////////////////////////////////////////////////////////
//  Field-level annotations — AdminService.Restrictions
////////////////////////////////////////////////////////////////////////////

annotate AdminService.Restrictions with {
  // System-managed
  ID             @Core.Computed;
  createdBy      @UI.Hidden;
  createdAt      @UI.Hidden;
  modifiedBy     @UI.Hidden;
  modifiedAt     @UI.Hidden;
  // Auto-generated on create (RST-NNNN); immutable after first save.
  // NOT marked Mandatory — the server pre-fills it; user may override before saving.
  restrictionRef @Core.Computed  @Common.FieldControl: #ReadOnly  @title: 'Restriction No. (auto-generated)';
  // Lifecycle managed exclusively by Deactivate / Reactivate actions
  active         @Common.FieldControl: #ReadOnly  @title: 'Active';
  // name is auto-set by server handler from restrictionRef; not user-facing
  name           @UI.Hidden;
  // parent/children — managed by tree view, not editable in flat form
  parent         @UI.Hidden;
  // descr — free-text, multiline
  descr          @title: 'Description'  @UI.MultiLineText;
};

annotate AdminService.Restrictions with {
  // Mandatory fields
  // Value help reads BridgeValueHelp — the SAME bridge.management.Bridges table
  // the register shows, WITHOUT the Active-only default injected on
  // AdminService.Bridges collection reads. Any register bridge (incl. Inactive
  // ones surfaced via the register's status filter) is therefore linkable here.
  bridgeRef @(
    Common.FieldControl: #Mandatory,
    Common.ValueList: {
      CollectionPath : 'BridgeValueHelp',
      SearchSupported: true,
      Parameters     : [
        { $Type: 'Common.ValueListParameterInOut',      ValueListProperty: 'bridgeId',   LocalDataProperty: bridgeRef },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'bridgeName' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'state' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'transportMode' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'status' },
      ],
    },
    Common.Text: bridge.bridgeName,
    Common.TextArrangement: #TextOnly
  )  @title: 'Bridge';
  restrictionCategory @(
    Common.FieldControl: #Mandatory,
    ValueList.entity:'RestrictionCategories',
    Common.ValueListWithFixedValues
  )  @title: 'Category';
  restrictionType @(
    Common.FieldControl: #Mandatory,
    ValueList.entity:'RestrictionTypes',
    Common.ValueListWithFixedValues
  )  @title: 'Restriction Type';
  restrictionValue @(
    Common.FieldControl: #Mandatory
  )  @title: 'Value';
  restrictionUnit @(
    Common.FieldControl: #Mandatory,
    ValueList.entity:'RestrictionUnits',
    Common.ValueListWithFixedValues
  )  @title: 'Unit';

  // Value lists
  restrictionStatus @(
    ValueList.entity:'RestrictionStatuses',
    Common.ValueListWithFixedValues
  )  @title: 'Status';
  appliesToVehicleClass @(
    ValueList.entity:'VehicleClasses',
    Common.ValueListWithFixedValues
  )  @title: 'Applies to Vehicle Class';
  direction @(
    ValueList.entity:'RestrictionDirections',
    Common.ValueListWithFixedValues
  )  @title: 'Direction';

  // New coded fields (additive)
  restrictionSeverity @(
    ValueList.entity:'RestrictionSeverities',
    Common.ValueListWithFixedValues
  )  @title: 'Severity';
  laneAvailability @(
    ValueList.entity:'LaneAvailabilityTypes',
    Common.ValueListWithFixedValues
  )  @title: 'Lane Availability';
  pbsClassApplicable @(
    ValueList.entity:'PbsApprovalClasses',
    Common.ValueListWithFixedValues
  )  @title: 'PBS Class Applicable';

  // Labels + mandatory rules
  temporary            @UI.Hidden;  // auto-derived from restrictionCategory; not shown in form
  permitRequired       @title: 'Permit Required';
  escortRequired       @title: 'Escort Required';
  grossMassLimit       @title: 'Gross Mass Limit (t)';
  axleMassLimit        @title: 'Axle Mass Limit (t)';
  heightLimit          @title: 'Height Limit (m)';
  widthLimit           @title: 'Width Limit (m)';
  lengthLimit          @title: 'Length Limit (m)';
  speedLimit           @title: 'Speed Limit (km/h)';
  effectiveFrom        @title: 'Effective From'  @Common.FieldControl: #Mandatory;
  effectiveTo          @title: 'Effective To';
  temporaryFrom        @title: 'Temporary From';
  temporaryTo          @title: 'Temporary To';
  temporaryReason      @title: 'Temporary Reason'  @UI.MultiLineText;
  approvedBy           @title: 'Approved By';
  approvalDate         @title: 'Approval Date';
  approvalReference    @title: 'Approval Reference';
  legalReference       @title: 'Gazette / Legal Reference';
  issuingAuthority     @title: 'Issuing Authority';
  enforcementAuthority @title: 'Enforcement Authority';
  remarks              @title: 'Notes'  @UI.MultiLineText;
  // New NSW/NHVR attributes (additive)
  gazetteNumber          @title: 'Gazette Number';
  gazettePublicationDate @title: 'Gazette Publication Date';
  gazetteExpiryDate      @title: 'Gazette Expiry Date';
  reviewDueDate          @title: 'Review Due Date';
  restrictionReason      @title: 'Restriction Reason';
  detourRoute            @title: 'Detour Route';
  conditionTrigger       @title: 'Condition Trigger';
  grossCombinationLimit  @title: 'Gross Combination (GCM) Limit (t)';
  steerAxleLimit         @title: 'Steer Axle Limit (t)';
  tandemAxleLimit        @title: 'Tandem Axle Group Limit (t)';
  triAxleLimit           @title: 'Tri-Axle Group Limit (t)';
  pilotVehicleCount      @title: 'Pilot Vehicle Count';
  signageRequired        @title: 'Signage Required';
  lanesOpen              @title: 'Lanes Open';
  lanesTotal             @title: 'Lanes Total';
  laneWidthLimit         @title: 'Lane Width Limit (m)';
};

////////////////////////////////////////////////////////////////////////////
//  Validation constraints — numeric range rules
////////////////////////////////////////////////////////////////////////////

annotate AdminService.Restrictions with {
  speedLimit     @assert.range: [0, 130]  @Common.QuickInfo: 'Valid range: 0 – 130 km/h';
  grossMassLimit @assert.range: [0, 1000] @Common.QuickInfo: 'Valid range: 0 – 1,000 t';
  axleMassLimit  @assert.range: [0, 500]  @Common.QuickInfo: 'Valid range: 0 – 500 t';
  heightLimit    @assert.range: [0, 30]   @Common.QuickInfo: 'Valid range: 0 – 30 m';
  widthLimit     @assert.range: [0, 100]  @Common.QuickInfo: 'Valid range: 0 – 100 m';
  lengthLimit    @assert.range: [0, 1000] @Common.QuickInfo: 'Valid range: 0 – 1,000 m';
  // New per-type limits (additive)
  grossCombinationLimit @assert.range: [0, 1000] @Common.QuickInfo: 'Valid range: 0 – 1,000 t';
  steerAxleLimit        @assert.range: [0, 500]  @Common.QuickInfo: 'Valid range: 0 – 500 t';
  tandemAxleLimit       @assert.range: [0, 500]  @Common.QuickInfo: 'Valid range: 0 – 500 t';
  triAxleLimit          @assert.range: [0, 500]  @Common.QuickInfo: 'Valid range: 0 – 500 t';
  laneWidthLimit        @assert.range: [0, 100]  @Common.QuickInfo: 'Valid range: 0 – 100 m';
  lanesOpen             @assert.range: [0, 99]   @Common.QuickInfo: 'Valid range: 0 – 99 lanes';
  lanesTotal            @assert.range: [0, 99]   @Common.QuickInfo: 'Valid range: 0 – 99 lanes';
  pilotVehicleCount     @assert.range: [0, 10]   @Common.QuickInfo: 'Valid range: 0 – 10 vehicles';
};

////////////////////////////////////////////////////////////////////////////
//  Draft
////////////////////////////////////////////////////////////////////////////

annotate AdminService.Restrictions with @odata.draft.enabled;
annotate bridge.management.Restrictions with @fiori.draft.enabled;

////////////////////////////////////////////////////////////////////////////
//  Tree Views and Value Helps (defined in separate files)
////////////////////////////////////////////////////////////////////////////

using from './tree-view';
using from './value-help';
