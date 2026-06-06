using { AdminService } from '../../srv/admin-service';
using from '../common';

////////////////////////////////////////////////////////////////////////////
//  List Report — Bridges
////////////////////////////////////////////////////////////////////////////

annotate AdminService.Bridges with @(
  UI.HeaderInfo: {
    TypeName      : 'Bridge',
    TypeNamePlural: 'Bridges',
    Title         : { $Type: 'UI.DataField', Value: bridgeName },
    Description   : { $Type: 'UI.DataField', Value: bridgeId }
  },
  UI.SelectionFields: [
    bridgeId, bridgeName, transportMode, network, state, region,
    condition, postingStatus, status,
    highPriorityAsset, assetClass
  ],
  UI.LineItem: [
    { Value: bridgeId,           Label: 'Bridge ID' },
    { Value: bridgeName,         Label: 'Bridge Name' },
    { Value: transportMode,      Label: 'Mode' },
    { Value: network,            Label: 'Network' },
    { Value: state,              Label: 'State' },
    { Value: region,             Label: 'Region' },
    { Value: condition,          Label: 'Condition' },
    { Value: conditionRating,    Label: 'Rating' },
    { Value: postingStatus,      Label: 'Posting Status' },
    { Value: status,             Label: 'Status' },
    { Value: lastInspectionDate, Label: 'Last Inspected' },
    { Value: highPriorityAsset,  Label: 'High Priority' }
  ]
);

////////////////////////////////////////////////////////////////////////////
//  Object Page — Bridges
////////////////////////////////////////////////////////////////////////////

annotate AdminService.Bridges with {
  hasCapacity @UI.Hidden;
};

annotate AdminService.Bridges with @(
  Capabilities.InsertRestrictions.Insertable  : true,
  Capabilities.UpdateRestrictions.Updatable   : true,
  Capabilities.DeleteRestrictions.Deletable   : false,
  Capabilities.NavigationRestrictions: {
    RestrictedProperties: [{
      NavigationProperty: capacities,
      InsertRestrictions: {
        Insertable: { $edmJson: { $Not: { $Path: 'hasCapacity' } } }
      }
    }]
  },
  UI: {
    CreateHidden: false,
    UpdateHidden: false,
    DeleteHidden: true,

    Facets: [
      // ── Tab 1: Core Identity & Location (3 sub-sections) ─────────────────
      {
        $Type : 'UI.CollectionFacet',
        Label : 'Core Identity & Location',
        ID    : 'IdentityLocation',
        Facets: [
          {$Type: 'UI.ReferenceFacet', Label: 'Asset Identity',     Target: '@UI.FieldGroup#AssetIdentity'},
          {$Type: 'UI.ReferenceFacet', Label: 'Mode & Network',     Target: '@UI.FieldGroup#ModeNetwork'},
          {$Type: 'UI.ReferenceFacet', Label: 'Geographic Location', Target: '@UI.FieldGroup#GeoLocation'},
          {$Type: 'UI.ReferenceFacet', Label: 'Ownership',           Target: '@UI.FieldGroup#Ownership'},
        ]
      },
      // ── Tab 2: Physical Characteristics (2 sub-sections) ─────────────────
      {
        $Type : 'UI.CollectionFacet',
        Label : 'Physical Characteristics',
        ID    : 'PhysicalCharacteristics',
        Facets: [
          {$Type: 'UI.ReferenceFacet', Label: 'Structure',  Target: '@UI.FieldGroup#Structure'},
          {$Type: 'UI.ReferenceFacet', Label: 'Dimensions', Target: '@UI.FieldGroup#Dimensions'},
        ]
      },
      // ── Tab 3: NHVR & Traffic Approvals (3 sub-sections) ────────────────
      {
        $Type : 'UI.CollectionFacet',
        Label : 'NHVR & Traffic Approvals',
        ID    : 'NHVRTraffic',
        Facets: [
          {$Type: 'UI.ReferenceFacet', Label: 'Traffic Data',        Target: '@UI.FieldGroup#TrafficData'},
          {$Type: 'UI.ReferenceFacet', Label: 'Route Classification', Target: '@UI.FieldGroup#RouteClass'},
          {$Type: 'UI.ReferenceFacet', Label: 'NHVR Approvals',       Target: '@UI.FieldGroup#NHVRApprovals'},
        ]
      },
      // ── Tab 8: Data Provenance (source + audit sub-sections) ─────────────
      {
        $Type : 'UI.CollectionFacet',
        Label : 'Data Provenance',
        ID    : 'DataProvenance',
        Facets: [
          {$Type: 'UI.ReferenceFacet', Label: 'Source Information', Target: '@UI.FieldGroup#SourceInfo'},
          {$Type: 'UI.ReferenceFacet', Label: 'Audit Trail',        Target: '@UI.FieldGroup#AuditTrail'},
        ]
      },
    ],

    // ── FieldGroups ─────────────────────────────────────────────────────────

    // Tab 1 — Core Identity & Location
    FieldGroup#AssetIdentity: {
      Data: [
        {Value: bridgeId},        // server-generated and read-only
        {Value: bridgeName},
        {Value: assetClass},
        {Value: status},          // @Common.FieldControl #ReadOnly — lifecycle managed by actions
        {Value: postingStatus},   // moved here from Condition & Inspection tab
        {Value: highPriorityAsset},
      ]
    },
    FieldGroup#ModeNetwork: {
      Data: [
        {Value: transportMode},
        {Value: secondaryModes},
        {Value: network},
        {Value: networkOperator},
        {Value: corridor},
      ]
    },
    FieldGroup#GeoLocation: {
      Data: [
        {Value: state},
        {Value: region},
        {Value: lga},
        {Value: route},
        {Value: routeNumber},
        {Value: latitude},
        {Value: longitude},
        {Value: location},
      ]
    },
    FieldGroup#Ownership: {
      Data: [
        {Value: assetOwner},
        {Value: managingAuthority},
        {Value: descr},
        {Value: remarks},         // moved here from Condition & Inspection tab
      ]
    },

    // Tab 2 — Physical Characteristics
    FieldGroup#Structure: {
      Data: [
        {Value: structureType},
        {Value: material},
        {Value: yearBuilt},
        {Value: designLoad},
        {Value: designStandard},
      ]
    },
    FieldGroup#Dimensions: {
      Data: [
        {Value: spanCount},
        {Value: spanLength},
        {Value: totalLength},
        {Value: deckWidth},
        {Value: clearanceHeight},
        {Value: numberOfLanes},
        {Value: seismicZone},           // moved here from Condition & Inspection tab
        {Value: floodImmunityAriYears},
        {Value: floodImpacted},
      ]
    },

    // Tab 3 — NHVR & Traffic Approvals
    FieldGroup#TrafficData: {
      Data: [
        {Value: averageDailyTraffic},
        {Value: heavyVehiclePercent},
        {Value: importanceLevel},
      ]
    },
    FieldGroup#RouteClass: {
      Data: [
        {Value: loadRating},
        {Value: pbsApprovalClass},
        {Value: freightRoute},
        {Value: overMassRoute},
        {Value: hmlApproved},
        {Value: bDoubleApproved},
      ]
    },
    FieldGroup#NHVRApprovals: {
      Data: [
        {Value: nhvrAssessed},
        {Value: nhvrAssessmentDate},
        {Value: gazetteReference},
        {Value: nhvrReferenceUrl},
      ]
    },

    // Tab 8 — Data Provenance
    FieldGroup#SourceInfo: {
      Data: [
        {Value: dataSource},
        {Value: sourceReferenceUrl},
        {Value: openDataReference},
        {Value: sourceRecordId},
      ]
    },
    FieldGroup#AuditTrail: {
      Data: [
        {Value: createdBy},
        {Value: createdAt},
        {Value: modifiedBy},
        {Value: modifiedAt},
      ]
    },

    // ── ObjectPage Header Actions ─────────────────────────────────────────
    Identification: [
      {
        $Type       : 'UI.DataFieldForAction',
        Action      : 'AdminService.deactivate',
        Label       : 'Deactivate',
        Criticality : #Negative,
        ![@UI.Hidden]: { $edmJson: { $Or: [
          { $Eq: [{ $Path: 'status' }, 'Inactive'] },
          { $Not: { $Path: 'IsActiveEntity' } }
        ] } }
      },
      {
        $Type       : 'UI.DataFieldForAction',
        Action      : 'AdminService.reactivate',
        Label       : 'Reactivate',
        Criticality : #Positive,
        ![@UI.Hidden]: { $edmJson: { $Or: [
          { $Ne: [{ $Path: 'status' }, 'Inactive'] },
          { $Not: { $Path: 'IsActiveEntity' } }
        ] } }
      }
    ]
  }
);

////////////////////////////////////////////////////////////////////////////
//  Field-level annotations — Bridges
////////////////////////////////////////////////////////////////////////////

annotate AdminService.Bridges with {
  // System-managed — never editable
  ID         @Core.Computed;
  createdBy  @Core.Computed  @title: 'Created By';
  createdAt  @Core.Computed  @title: 'Created At';
  modifiedBy @Core.Computed  @title: 'Last Modified By';
  modifiedAt @Core.Computed  @title: 'Last Modified At';
  // Bridge status is managed exclusively by Deactivate / Reactivate actions
  status @(
    Common.FieldControl: #ReadOnly,
    Common.ValueListWithFixedValues,
    Common.ValueList: {
      SearchSupported: false,
      CollectionPath : 'BridgeStatusValues',
      Parameters     : [
        { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: status, ValueListProperty: 'code' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
      ]
    }
  ) @title: 'Bridge Status';
  // GeoJSON is maintained on the object page, not in the create dialog
  geoJson    @UI.Hidden  @title: 'Bridge Geometry (GeoJSON)';  // maintained via GIS map, not shown in form
  // Bridge ID auto-generated on create; never user-entered.
  // The ValueList on Bridges itself powers the search-help in the filter bar.
  bridgeId @(
    Core.Computed,
    Common.FieldControl: #ReadOnly,
    Common.ValueList: {
      SearchSupported : true,
      CollectionPath  : 'Bridges',
      Parameters      : [
        { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: bridgeId,   ValueListProperty: 'bridgeId'   },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'bridgeName' },
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'state'      }
      ]
    }
  ) @title: 'Bridge ID (auto-generated)';
};

annotate AdminService.Bridges with {
  // Mandatory fields
  bridgeName @Common.FieldControl: #Mandatory
             @title: 'Bridge Name'
             @mandatory.message: 'Bridge Name is required';
  state @(
    Common.FieldControl: #Mandatory,
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'States', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: state, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'State'
    @mandatory.message: 'State is required';
  assetOwner   @Common.FieldControl: #Mandatory  @title: 'Asset Owner'
               @mandatory.message: 'Asset Owner is required';
  latitude     @Common.FieldControl: #Mandatory  @title: 'Latitude (°)'  @Common.QuickInfo: 'Valid range: -90 to 90'
               @mandatory.message: 'Latitude is required';
  longitude    @Common.FieldControl: #Mandatory  @title: 'Longitude (°)'  @Common.QuickInfo: 'Valid range: -180 to 180'
               @mandatory.message: 'Longitude is required';
  postingStatus @(
    Common.FieldControl: #Mandatory,
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'PostingStatuses', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: postingStatus, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Posting Status'
    @mandatory.message: 'Posting Status is required';
  conditionRating @title: 'Condition Rating (1–10)';  // populated from BridgeInspections

  // Value lists
  assetClass @(
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'AssetClasses', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: assetClass, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Asset Class';
  transportMode @(
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'TransportModes', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: transportMode, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Transport Mode';
  network @(
    Common.ValueList: { SearchSupported: true, CollectionPath: 'Networks', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: network, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'operator' }
    ]}
  ) @title: 'Network';
  secondaryModes  @title: 'Secondary Modes';
  networkOperator @title: 'Network Operator';
  corridor        @title: 'Corridor';
  region @(
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'Regions', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: region, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Region';
  structureType @(
    Common.FieldControl: #Mandatory,
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'StructureTypes', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: structureType, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Structure Type'
    @mandatory.message: 'Structure Type is required';
  designLoad @(
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'DesignLoads', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: designLoad, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Design Load';
  condition @(
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: false, CollectionPath: 'ConditionStates', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: condition, ValueListProperty: 'code' }
    ]}
  ) @title: 'Condition State';
  pbsApprovalClass @(
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'PbsApprovalClasses', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: pbsApprovalClass, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'PBS Approval Class';

  // Restriction value help
  restriction @(Common: {
    Label    : 'Linked Restriction',
    ValueList: {
      CollectionPath: 'Restrictions',
      Parameters    : [
        { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' },
        { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: restriction_ID, ValueListProperty: 'ID' }
      ],
    }
  });

  // All remaining field labels
  managingAuthority      @title: 'Managing Authority';
  lga                    @title: 'Local Government Area (LGA)';
  location               @title: 'Location Description';
  route                  @title: 'Route';
  routeNumber            @title: 'Route Number';
  descr                  @title: 'Description'  @UI.MultiLineText;
  material               @title: 'Material';
  yearBuilt              @title: 'Year Built';
  designStandard         @title: 'Design Standard';
  clearanceHeight        @title: 'Clearance Height (m)';
  spanLength             @title: 'Span Length (m)';
  totalLength            @title: 'Total Length (m)';
  deckWidth              @title: 'Deck Width (m)';
  spanCount              @title: 'Number of Spans';
  numberOfLanes          @title: 'Number of Lanes';
  conditionStandard      @title: 'Condition Rating Standard';
  structuralAdequacyRating @title: 'Structural Adequacy Rating (1–10)';
  lastInspectionDate     @title: 'Last Inspection Date';  // populated from BridgeInspections
  highPriorityAsset      @title: 'High Priority Asset';
  asBuiltDrawingReference @title: 'As-Built Drawing Reference';
  seismicZone            @title: 'Seismic Zone';
  floodImmunityAriYears  @title: 'Flood Immunity (ARI years)';
  floodImpacted          @title: 'Flood Impacted';
  remarks                @title: 'Remarks'  @UI.MultiLineText;
  loadRating             @title: 'Load Rating (t)';
  importanceLevel        @title: 'Importance Level (1–4)';
  averageDailyTraffic    @title: 'Average Daily Traffic (ADT)';
  heavyVehiclePercent    @title: 'Heavy Vehicle Percentage (%)';
  freightRoute           @title: 'Freight Route';
  overMassRoute          @title: 'Over Mass Route';
  hmlApproved            @title: 'HML Approved';
  bDoubleApproved        @title: 'B-Double Approved';
  nhvrAssessed           @title: 'NHVR Assessed';
  nhvrAssessmentDate     @title: 'NHVR Assessment Date';
  gazetteReference       @title: 'Gazette Reference';
  nhvrReferenceUrl       @title: 'NHVR Reference URL';
  dataSource             @title: 'Data Source';
  sourceReferenceUrl     @title: 'Source Reference URL';
  openDataReference      @title: 'Open Data Reference';
  sourceRecordId         @title: 'Source Record ID';
  conditionSummary @(
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'ConditionSummaries', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: conditionSummary, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Condition Summary';
  conditionAssessor      @title: 'Assessed By';
  conditionReportRef     @title: 'Report Reference';
  structuralAdequacy @(
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'StructuralAdequacyTypes', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: structuralAdequacy, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Structural Adequacy';
  conditionNotes         @title: 'Condition Notes'  @UI.MultiLineText;
};

// Hide the ID on the Restrictions VH so it doesn't appear as a column
annotate AdminService.Restrictions with {
  ID @UI.Hidden;
};

////////////////////////////////////////////////////////////////////////////
//  BridgeRestrictions — sub-entity on Bridge ObjectPage
////////////////////////////////////////////////////////////////////////////

annotate AdminService.BridgeRestrictions with {
  ID    @UI.Hidden;
  bridge @(
    Common.FieldControl: #Mandatory,
    Common.Text: bridge.bridgeName,
    Common.TextArrangement: #TextOnly,
    Common.ValueList: { CollectionPath: 'Bridges', Parameters: [
      { $Type: 'Common.ValueListParameterOut',      LocalDataProperty: bridge_ID,   ValueListProperty: 'ID' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'bridgeName' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'bridgeId'   }
    ]}
  ) @title: 'Bridge';
  createdAt @UI.Hidden;  createdBy @UI.Hidden;  modifiedAt @UI.Hidden;  modifiedBy @UI.Hidden;
  // ── Holistic / multi-modal restriction fields (Phase 1) ──
  transportMode @(
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'TransportModes', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: transportMode, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Transport Mode';
  network @(
    Common.ValueList: { SearchSupported: true, CollectionPath: 'Networks', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: network, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Network';
  laneAvailability @(
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'LaneAvailabilityTypes', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: laneAvailability, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Lane Availability';
  restrictionSeverity @(
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'RestrictionSeverities', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: restrictionSeverity, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Severity';
  lanesOpen      @title: 'Lanes Open';
  lanesTotal     @title: 'Lanes Total';
  laneWidthLimit @title: 'Lane Width Limit (m)';
  // Auto-generated (BR-NNNN); never user-entered
  restrictionRef        @Core.Computed  @Common.FieldControl: #ReadOnly  @title: 'Reference (auto-generated)';
  // Mandatory classification fields
  restrictionCategory @(
    Common.FieldControl: #Mandatory,
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'RestrictionCategories', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: restrictionCategory, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Category';
  restrictionType @(
    Common.FieldControl: #Mandatory,
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'RestrictionTypes', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: restrictionType, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Restriction Type';
  restrictionValue      @Common.FieldControl: #Mandatory  @title: 'Value';
  restrictionUnit @(
    Common.FieldControl: #Mandatory,
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'RestrictionUnits', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: restrictionUnit, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Unit';
  // Status — auto-defaulted to Active on create; managed by Deactivate / Reactivate actions thereafter
  restrictionStatus @(
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'RestrictionStatuses', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: restrictionStatus, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Status';
  // Active flag — read-only; controlled by Deactivate / Reactivate actions only
  active                @Common.FieldControl: #ReadOnly  @title: 'Active';
  // temporary boolean auto-derived from category — not shown in form
  temporary             @UI.Hidden;
  appliesToVehicleClass @(
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'VehicleClasses', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: appliesToVehicleClass, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Applies to Vehicle Class';
  direction @(
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'RestrictionDirections', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: direction, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Direction';
  effectiveFrom         @Common.FieldControl: #Mandatory  @title: 'Effective From';
  effectiveTo           @title: 'Effective To';
  grossMassLimit        @title: 'Gross Mass Limit (t)';
  axleMassLimit         @title: 'Axle Mass Limit (t)';
  heightLimit           @title: 'Height Limit (m)';
  widthLimit            @title: 'Width Limit (m)';
  lengthLimit           @title: 'Length Limit (m)';
  speedLimit            @title: 'Speed Limit (km/h)';
  permitRequired        @title: 'Permit Required';
  escortRequired        @title: 'Escort Required';
  approvedBy            @title: 'Approved By';
  approvalReference     @title: 'Approval Reference';
  legalReference        @title: 'Gazette / Legal Reference';
  issuingAuthority      @title: 'Issuing Authority';
  enforcementAuthority  @title: 'Enforcement Authority';
  temporaryFrom         @title: 'Temporary From';
  temporaryTo           @title: 'Temporary To';
  temporaryReason       @title: 'Temporary Reason'  @UI.MultiLineText;
  remarks               @title: 'Remarks'  @UI.MultiLineText;
  name                  @UI.Hidden;
  descr                 @UI.Hidden;
};

annotate AdminService.BridgeRestrictions with @(
  Capabilities.InsertRestrictions.Insertable : true,
  Capabilities.UpdateRestrictions.Updatable  : true,
  // Deletable kept true so draft-mode rows can be removed; server blocks delete on committed records
  Capabilities.DeleteRestrictions.Deletable  : true,
  UI: {
    HeaderInfo: {
      TypeName      : 'Bridge Restriction',
      TypeNamePlural: 'Bridge Restrictions',
      Title         : { $Type: 'UI.DataField', Value: restrictionType },
      Description   : { $Type: 'UI.DataField', Value: restrictionRef }
    },
    // ── Inline table actions — deactivate / reactivate committed restriction rows ──
    Identification: [
      {
        $Type       : 'UI.DataFieldForAction',
        Action      : 'AdminService.deactivate',
        Label       : 'Retire (Soft-Delete)',
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
    ],
    SelectionFields: [bridge_ID, transportMode, network, restrictionType, restrictionSeverity, restrictionStatus, active, effectiveFrom],
    LineItem: [
      {Value: bridge.bridgeName,     Label: 'Bridge'},
      {Value: bridge.bridgeId,       Label: 'Bridge ID'},
      {Value: transportMode,         Label: 'Mode'},
      {Value: network,               Label: 'Network'},
      {Value: restrictionRef,        Label: 'Reference'},
      {Value: restrictionCategory,   Label: 'Category'},
      {Value: restrictionType,       Label: 'Type'},
      {Value: restrictionValue,      Label: 'Value'},
      {Value: restrictionUnit,       Label: 'Unit'},
      {Value: laneAvailability,      Label: 'Lane Availability'},
      {Value: restrictionSeverity,   Label: 'Severity'},
      {Value: restrictionStatus,     Label: 'Status'},
      {Value: appliesToVehicleClass, Label: 'Vehicle Class'},
      {Value: permitRequired,        Label: 'Permit Req.'},
      {Value: effectiveFrom,         Label: 'From'},
      {Value: effectiveTo,           Label: 'To'},
      {Value: active,                Label: 'Active'},
      // Inline Retire / Reactivate action buttons per row
      {
        $Type       : 'UI.DataFieldForAction',
        Action      : 'AdminService.BridgeRestrictions/AdminService.deactivate',
        Label       : 'Retire',
        Criticality : #Negative,
        Inline      : true,
        ![@UI.Hidden]: { $edmJson: { $Or: [
          { $Eq: [{ $Path: 'active' }, false] },
          { $Not: { $Path: 'IsActiveEntity' } }
        ] } }
      },
      {
        $Type       : 'UI.DataFieldForAction',
        Action      : 'AdminService.BridgeRestrictions/AdminService.reactivate',
        Label       : 'Reactivate',
        Criticality : #Positive,
        Inline      : true,
        ![@UI.Hidden]: { $edmJson: { $Or: [
          { $Ne: [{ $Path: 'active' }, false] },
          { $Not: { $Path: 'IsActiveEntity' } }
        ] } }
      },
    ],
    Facets: [
      {
        $Type : 'UI.CollectionFacet',
        Label : 'Classification',
        ID    : 'BRClassification',
        Facets: [
          {$Type: 'UI.ReferenceFacet', Label: 'Restriction Details', Target: '@UI.FieldGroup#BRDetails'},
          {$Type: 'UI.ReferenceFacet', Label: 'Applicability',       Target: '@UI.FieldGroup#BRApplicability'},
        ]
      },
      {
        $Type : 'UI.CollectionFacet',
        Label : 'Physical Limits',
        ID    : 'BRPhysicalLimits',
        Facets: [
          {$Type: 'UI.ReferenceFacet', Label: 'Mass Limits (t)',    Target: '@UI.FieldGroup#BRMassLimits'},
          {$Type: 'UI.ReferenceFacet', Label: 'Dimensional Limits', Target: '@UI.FieldGroup#BRDimLimits'},
        ]
      },
      {
        $Type : 'UI.CollectionFacet',
        Label : 'Validity & Approval',
        ID    : 'BRValidity',
        Facets: [
          {$Type: 'UI.ReferenceFacet', Label: 'Effective Period',    Target: '@UI.FieldGroup#BREffective'},
          // Temporary Condition sub-section shown only for Temporary restrictions (fields self-hide otherwise)
          {$Type: 'UI.ReferenceFacet', Label: 'Temporary Condition', Target: '@UI.FieldGroup#BRTemporary'},
          {$Type: 'UI.ReferenceFacet', Label: 'Approval & Legal',    Target: '@UI.FieldGroup#BRApproval'},
          {$Type: 'UI.ReferenceFacet', Label: 'Enforcement',         Target: '@UI.FieldGroup#BREnforcement'},
        ]
      },
    ],
    FieldGroup#BRDetails: {
      Data: [
        {Value: bridge_ID, Label: 'Bridge'},
        {Value: bridge.bridgeId},
        {Value: restrictionRef},    // auto-generated BR-NNNN
        {Value: transportMode},
        {Value: network},
        {Value: restrictionCategory},
        {Value: restrictionType},
        {Value: restrictionValue},
        {Value: restrictionUnit},
        {Value: restrictionSeverity},
        {Value: laneAvailability},
        {Value: lanesOpen},
        {Value: lanesTotal},
        {Value: laneWidthLimit},
        {Value: restrictionStatus},
        {Value: active},            // read-only — use Retire / Reactivate buttons
      ]
    },
    FieldGroup#BRApplicability: {
      Data: [
        {Value: appliesToVehicleClass},
        {Value: direction},
        {Value: permitRequired},
        {Value: escortRequired},
        // 'temporary' boolean auto-derived from restrictionCategory — not shown in form
      ]
    },
    FieldGroup#BRMassLimits: {
      Data: [
        {Value: grossMassLimit},
        {Value: axleMassLimit},
      ]
    },
    FieldGroup#BRDimLimits: {
      Data: [
        {Value: heightLimit},
        {Value: widthLimit},
        {Value: lengthLimit},
        {Value: speedLimit},
      ]
    },
    FieldGroup#BREffective: {
      Data: [
        {Value: effectiveFrom},   // mandatory — see field annotation
        {Value: effectiveTo},
      ]
    },
    // Temporary-only fields — hidden when restrictionCategory != 'Temporary'
    FieldGroup#BRTemporary: {
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
    FieldGroup#BRApproval: {
      Data: [
        {Value: approvedBy},
        {Value: approvalReference},
        {Value: legalReference},
        {Value: issuingAuthority},
      ]
    },
    FieldGroup#BREnforcement: {
      Data: [
        {Value: enforcementAuthority},
        {Value: remarks},
      ]
    },
  }
);

////////////////////////////////////////////////////////////////////////////
//  BridgeCapacities — sub-entity on Bridge ObjectPage
////////////////////////////////////////////////////////////////////////////

annotate AdminService.BridgeCapacities with {
  ID         @UI.Hidden;
  bridge @(
    Common.FieldControl: #Mandatory,
    Common.Text: bridge.bridgeName,
    Common.TextArrangement: #TextOnly,
    Common.ValueList: { CollectionPath: 'Bridges', Parameters: [
      { $Type: 'Common.ValueListParameterOut',      LocalDataProperty: bridge_ID,   ValueListProperty: 'ID' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'bridgeName' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'bridgeId'   }
    ]}
  ) @title: 'Bridge';
  createdAt  @UI.Hidden;  createdBy  @UI.Hidden;  modifiedAt @UI.Hidden;  modifiedBy @UI.Hidden;
  capacityType          @Common.FieldControl: #Mandatory  @title: 'Capacity Type';
  grossMassLimit        @Common.FieldControl: #Mandatory  @title: 'Gross Mass Limit (t)';
  grossCombined         @title: 'Gross Combined (t)';
  steerAxleLimit        @title: 'Steer Axle (t)';
  singleAxleLimit       @title: 'Single Axle (t)';
  tandemGroupLimit      @title: 'Tandem Axle Group (t)';
  triAxleGroupLimit     @title: 'Tri-Axle Group (t)';
  minClearancePosted    @Common.FieldControl: #Mandatory  @title: 'Min Clearance (posted)';
  lane1Clearance        @title: 'Lane 1 Clearance (m)';
  lane2Clearance        @title: 'Lane 2 Clearance (m)';
  clearanceSurveyDate   @title: 'Survey Date';
  clearanceSurveyMethod @title: 'Survey Method';
  carriagewayWidth      @title: 'Carriageway Width (m)';
  trafficableWidth      @title: 'Trafficable Width (m)';
  laneWidth             @title: 'Lane Width (m)';
  ratingStandard        @title: 'Standard';
  ratingFactor          @title: 'Rating Factor (RF)';
  ratingEngineer        @title: 'Rating Engineer (NER/CPEng)';
  ratingDate            @title: 'Rating Date';
  nextReviewDue         @title: 'Next Review Due';
  reportReference       @title: 'Report Reference';
  floodClosureLevel     @title: 'Flood Closure Level (m AHD)';
  designLife            @title: 'Design Life (years)';
  consumedLife          @title: 'Consumed Life (%)';
  fatigueSensitive      @title: 'Fatigue-Sensitive';
  criticalElement       @title: 'Critical Element';
  capacityStatus @(
    Common.FieldControl: #Mandatory,
    Common.ValueListWithFixedValues,
    Common.ValueList: { SearchSupported: true, CollectionPath: 'CapacityStatuses', Parameters: [
      { $Type: 'Common.ValueListParameterOut', LocalDataProperty: capacityStatus, ValueListProperty: 'code' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' }
    ]}
  ) @title: 'Status';
  lastReviewedBy   @title: 'Last Reviewed By';
  statusReviewDue  @title: 'Next Review Due';
  engineeringNotes @UI.MultiLineText  @title: 'Engineering Notes';
};

annotate AdminService.BridgeCapacities with @(
  Capabilities.InsertRestrictions.Insertable : true,
  Capabilities.UpdateRestrictions.Updatable  : true,
  Capabilities.DeleteRestrictions.Deletable  : false,
  UI: {
    HeaderInfo: {
      TypeName      : 'Bridge Capacity',
      TypeNamePlural: 'Bridge Capacities',
      Title         : { $Type: 'UI.DataField', Value: capacityType },
      Description   : { $Type: 'UI.DataField', Value: capacityStatus }
    },
    SelectionFields: [bridge_ID, capacityType, capacityStatus, nextReviewDue],
    LineItem: [
      {Value: bridge.bridgeName,  Label: 'Bridge'},
      {Value: bridge.bridgeId,    Label: 'Bridge ID'},
      {Value: capacityType,       Label: 'Capacity Type'},
      {Value: grossMassLimit,     Label: 'GVM (t)'},
      {Value: grossCombined,      Label: 'GCM (t)'},
      {Value: minClearancePosted, Label: 'Min Clearance (m)'},
      {Value: ratingFactor,       Label: 'RF'},
      {Value: nextReviewDue,      Label: 'Next Review'},
      {Value: capacityStatus,     Label: 'Status'},
    ],
    Facets: [
      {
        $Type : 'UI.CollectionFacet',
        Label : 'General',
        ID    : 'CapGeneral',
        Facets: [
          {$Type: 'UI.ReferenceFacet', Label: 'Capacity Type', Target: '@UI.FieldGroup#CapacityGeneral'},
        ]
      },
      {$Type: 'UI.ReferenceFacet', Label: 'Mass Limits (tonnes)', Target: '@UI.FieldGroup#CapacityMassLimits'},
      {$Type: 'UI.ReferenceFacet', Label: 'Vertical Clearance (metres)', Target: '@UI.FieldGroup#CapacityVerticalClearance'},
      {$Type: 'UI.ReferenceFacet', Label: 'Horizontal Geometry (metres)', Target: '@UI.FieldGroup#CapacityHorizontalGeometry'},
      {$Type: 'UI.ReferenceFacet', Label: 'Load Rating (AS 5100.7)', Target: '@UI.FieldGroup#CapacityLoadRating'},
      {$Type: 'UI.ReferenceFacet', Label: 'Fatigue Life', Target: '@UI.FieldGroup#CapacityFatigue'},
      {$Type: 'UI.ReferenceFacet', Label: 'Capacity Status', Target: '@UI.FieldGroup#CapacityStatus'},
      {$Type: 'UI.ReferenceFacet', Label: 'Engineering Notes', Target: '@UI.FieldGroup#CapacityEngineeringNotes'},
    ],
    FieldGroup#CapacityGeneral: {
      Data: [
        {Value: bridge_ID, Label: 'Bridge'},
        {Value: capacityType},
      ]
    },
    FieldGroup#CapacityMassLimits: {
      Data: [
        {Value: grossMassLimit},
        {Value: grossCombined},
        {Value: steerAxleLimit},
        {Value: singleAxleLimit},
        {Value: tandemGroupLimit},
        {Value: triAxleGroupLimit},
      ]
    },
    FieldGroup#CapacityVerticalClearance: {
      Data: [
        {Value: minClearancePosted},
        {Value: lane1Clearance},
        {Value: lane2Clearance},
        {Value: clearanceSurveyDate},
        {Value: clearanceSurveyMethod},
      ]
    },
    FieldGroup#CapacityHorizontalGeometry: {
      Data: [
        {Value: carriagewayWidth},
        {Value: trafficableWidth},
        {Value: laneWidth},
      ]
    },
    FieldGroup#CapacityLoadRating: {
      Data: [
        {Value: ratingStandard},
        {Value: ratingFactor},
        {Value: ratingEngineer},
        {Value: ratingDate},
        {Value: nextReviewDue},
        {Value: reportReference},
      ]
    },
    FieldGroup#CapacityEnvironment: {
      Data: [
        {Value: floodClosureLevel},
      ]
    },
    FieldGroup#CapacityFatigue: {
      Data: [
        {Value: designLife},
        {Value: consumedLife},
        {Value: fatigueSensitive},
        {Value: criticalElement},
      ]
    },
    FieldGroup#CapacityStatus: {
      Data: [
        {Value: capacityStatus},
        {Value: lastReviewedBy},
        {Value: statusReviewDue},
      ]
    },
    FieldGroup#CapacityEngineeringNotes: {
      Data: [
        {Value: engineeringNotes},
      ]
    },
  }
);

////////////////////////////////////////////////////////////////////////////
//  BridgeDocuments — managed via custom Attachments section (read-only OData)
////////////////////////////////////////////////////////////////////////////

annotate AdminService.BridgeDocuments with {
  ID         @UI.Hidden;
  bridge     @UI.Hidden;
  content    @UI.Hidden;  // blob served via /admin-bridges/api — never via OData
  createdAt  @UI.Hidden;  createdBy @UI.Hidden;  modifiedAt @UI.Hidden;  modifiedBy @UI.Hidden;
  title        @title: 'Title';
  documentType @title: 'Attachment Type';
  documentUrl  @title: 'External URL';
  documentDate @title: 'Attachment Date';
  fileName     @title: 'File Name';
  mediaType    @title: 'Media Type';
  fileSize     @title: 'File Size (bytes)';
  referenceNumber @title: 'Reference Number';
  issuedBy     @title: 'Issued By';
  expiryDate   @title: 'Expiry Date';
  remarks      @title: 'Remarks'  @UI.MultiLineText;
};

annotate AdminService.BridgeDocuments with @(
  Common.Label : 'Attachments',
  Capabilities.InsertRestrictions.Insertable : false,
  Capabilities.UpdateRestrictions.Updatable  : false,
  Capabilities.DeleteRestrictions.Deletable  : true,
  UI: {
    HeaderInfo: {
      TypeName      : 'Attachment',
      TypeNamePlural: 'Attachments',
      Title         : { Value: title },
      Description   : { Value: fileName }
    },
    LineItem: [
      {Value: title,           Label: 'Title'},
      {Value: fileName,        Label: 'File Name'},
      {Value: documentType,    Label: 'Type'},
      {Value: mediaType,       Label: 'Media Type'},
      {Value: fileSize,        Label: 'Size'},
      {Value: referenceNumber, Label: 'Reference'},
      {Value: documentDate,    Label: 'Date'},
      {Value: expiryDate,      Label: 'Expiry'},
    ],
    Facets: [
      {$Type: 'UI.ReferenceFacet', Label: 'Attachment Details', Target: '@UI.FieldGroup#AttachmentDetails'}
    ],
    FieldGroup#AttachmentDetails: {
      Data: [
        {Value: documentType},
        {Value: title},
        {Value: fileName},
        {Value: mediaType},
        {Value: fileSize},
        {Value: documentUrl},
        {Value: referenceNumber},
        {Value: issuedBy},
        {Value: documentDate},
        {Value: expiryDate},
        {Value: remarks},
      ]
    },
  }
);

////////////////////////////////////////////////////////////////////////////
//  BridgeAttributes — hidden from Bridge ObjectPage (superseded by Custom
//  Attributes EAV pattern). Annotations kept for OData navigability only.
////////////////////////////////////////////////////////////////////////////

annotate AdminService.BridgeAttributes with {
  ID     @UI.Hidden;
  bridge @UI.Hidden;
  createdAt @UI.Hidden;  createdBy @UI.Hidden;  modifiedAt @UI.Hidden;  modifiedBy @UI.Hidden;
};

////////////////////////////////////////////////////////////////////////////
//  Validation constraints — numeric range & positive-value rules
////////////////////////////////////////////////////////////////////////////

annotate AdminService.Bridges with {
  spanCount              @assert.range: [1, 500]     @Common.QuickInfo: 'Valid range: 1 – 500';
  numberOfLanes          @assert.range: [1, 20]      @Common.QuickInfo: 'Valid range: 1 – 20';
  spanLength             @assert.range: [0.1, 5000]  @Common.QuickInfo: 'Valid range: 0.1 – 5,000 m';
  totalLength            @assert.range: [0.1, 50000] @Common.QuickInfo: 'Valid range: 0.1 – 50,000 m';
  deckWidth              @assert.range: [0.5, 200]   @Common.QuickInfo: 'Valid range: 0.5 – 200 m';
  clearanceHeight        @assert.range: [0, 100]     @Common.QuickInfo: 'Valid range: 0 – 100 m';
  loadRating             @assert.range: [0, 10000]   @Common.QuickInfo: 'Valid range: 0 – 10,000 t';
  floodImmunityAriYears  @assert.range: [1, 10000]   @Common.QuickInfo: 'Valid range: 1 – 10,000 years';
  averageDailyTraffic    @assert.range: [0, 9999999] @Common.QuickInfo: 'Valid range: 0 – 9,999,999 vehicles/day';
};

annotate AdminService.BridgeRestrictions with {
  speedLimit     @assert.range: [0, 130]  @Common.QuickInfo: 'Valid range: 0 – 130 km/h';
  grossMassLimit @assert.range: [0, 1000] @Common.QuickInfo: 'Valid range: 0 – 1,000 t';
  axleMassLimit  @assert.range: [0, 500]  @Common.QuickInfo: 'Valid range: 0 – 500 t';
  heightLimit    @assert.range: [0, 30]   @Common.QuickInfo: 'Valid range: 0 – 30 m';
  widthLimit     @assert.range: [0, 100]  @Common.QuickInfo: 'Valid range: 0 – 100 m';
  lengthLimit    @assert.range: [0, 1000] @Common.QuickInfo: 'Valid range: 0 – 1,000 m';
};

annotate AdminService.BridgeCapacities with {
  grossMassLimit        @assert.range: [0, 2000]   @Common.QuickInfo: 'Valid range: 0 – 2,000 t';
  grossCombined         @assert.range: [0, 3000]   @Common.QuickInfo: 'Valid range: 0 – 3,000 t';
  steerAxleLimit        @assert.range: [0, 200]    @Common.QuickInfo: 'Valid range: 0 – 200 t';
  singleAxleLimit       @assert.range: [0, 200]    @Common.QuickInfo: 'Valid range: 0 – 200 t';
  tandemGroupLimit      @assert.range: [0, 200]    @Common.QuickInfo: 'Valid range: 0 – 200 t';
  triAxleGroupLimit     @assert.range: [0, 200]    @Common.QuickInfo: 'Valid range: 0 – 200 t';
  minClearancePosted    @assert.range: [0, 100]    @Common.QuickInfo: 'Valid range: 0 – 100 m';
  lane1Clearance        @assert.range: [0, 100]    @Common.QuickInfo: 'Valid range: 0 – 100 m';
  lane2Clearance        @assert.range: [0, 100]    @Common.QuickInfo: 'Valid range: 0 – 100 m';
  carriagewayWidth      @assert.range: [0, 200]    @Common.QuickInfo: 'Valid range: 0 – 200 m';
  trafficableWidth      @assert.range: [0, 200]    @Common.QuickInfo: 'Valid range: 0 – 200 m';
  laneWidth             @assert.range: [0, 50]     @Common.QuickInfo: 'Valid range: 0 – 50 m';
  ratingFactor          @assert.range: [0, 10]     @Common.QuickInfo: 'Valid range: 0 – 10';
  consumedLife          @assert.range: [0, 200]    @Common.QuickInfo: 'Valid range: 0 – 200%';
  designLife            @assert.range: [0, 200]    @Common.QuickInfo: 'Valid range: 0 – 200 years';
  floodClosureLevel     @assert.range: [0, 200]    @Common.QuickInfo: 'Valid range: 0 – 200 m AHD';
};

////////////////////////////////////////////////////////////////////////////
//  BridgeInspections — standalone tile
////////////////////////////////////////////////////////////////////////////

annotate AdminService.BridgeInspections with {
  ID        @UI.Hidden;
  // The Integer FK `bridge_ID` is intentionally not annotated here — it is a
  // generated foreign key, not a projection element. Its stale parse error is
  // handled at runtime by FkMessageGuard.js (event-driven), not via annotations.
  bridge @(
    Common.FieldControl: #Mandatory,
    Common.Text: bridge.bridgeName,
    Common.TextArrangement: #TextOnly,
    Common.ValueList: { CollectionPath: 'Bridges', Parameters: [
      { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: bridge_ID,   ValueListProperty: 'ID' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'bridgeName' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'bridgeId'   }
    ]}
  ) @title: 'Bridge';
  inspectionRef      @Core.Computed @Common.FieldControl: #ReadOnly  @title: 'Inspection Ref';
  inspectionType     @Common.FieldControl: #Mandatory  @title: 'Inspection Type';
  inspectionDate     @Common.FieldControl: #Mandatory  @title: 'Inspection Date';
  inspector          @Common.FieldControl: #Mandatory  @title: 'Inspector';
  accreditationLevel @Common.QuickInfo: 'Level 1–4 (3+ required for Principal/Detailed)'  @title: 'Accreditation Level (1–4)';
  conditionRating    @Common.QuickInfo: 'Scale 1–10 (10 = new/excellent, 1 = failed)'      @title: 'Condition Rating';
  structuralRating   @Common.QuickInfo: 'Scale 1–10'  @title: 'Structural Rating';
  overallGrade       @title: 'Overall Grade';
  nextInspectionDue  @title: 'Next Inspection Due';
  inspectionNotes    @UI.MultiLineText  @title: 'Inspection Notes';
  recommendations    @UI.MultiLineText  @title: 'Recommendations';
  active             @title: 'Active';
  createdAt  @UI.Hidden;  createdBy  @UI.Hidden;  modifiedAt @UI.Hidden;  modifiedBy @UI.Hidden;
};

annotate AdminService.BridgeInspections with @(
  Capabilities.InsertRestrictions.Insertable : true,
  Capabilities.UpdateRestrictions.Updatable  : true,
  Capabilities.DeleteRestrictions.Deletable  : false,
  UI: {
    HeaderInfo: {
      TypeName      : 'Bridge Inspection',
      TypeNamePlural: 'Bridge Inspections',
      Title         : { $Type: 'UI.DataField', Value: inspectionRef },
      Description   : { $Type: 'UI.DataField', Value: inspectionType }
    },
    SelectionFields: [bridge_ID, inspectionType, inspectionDate, active],
    LineItem: [
      { Value: bridge.bridgeName,   Label: 'Bridge'           },
      { Value: bridge.bridgeId,     Label: 'Bridge ID'        },
      { Value: inspectionRef,       Label: 'Ref'              },
      { Value: inspectionType,      Label: 'Type'             },
      { Value: inspectionDate,      Label: 'Date'             },
      { Value: inspector,           Label: 'Inspector'        },
      { Value: conditionRating,     Label: 'Condition Rating' },
      { Value: overallGrade,        Label: 'Grade'            },
      { Value: nextInspectionDue,   Label: 'Next Due'         },
      { Value: active,              Label: 'Active'           }
    ],
    Facets: [
      {
        $Type : 'UI.CollectionFacet',
        Label : 'Inspection Details',
        ID    : 'InspIdentity',
        Facets: [
          { $Type: 'UI.ReferenceFacet', Label: 'Identity',    Target: '@UI.FieldGroup#InspIdentity' },
          { $Type: 'UI.ReferenceFacet', Label: 'Ratings',     Target: '@UI.FieldGroup#InspRatings'  },
          { $Type: 'UI.ReferenceFacet', Label: 'Notes',       Target: '@UI.FieldGroup#InspNotes'    }
        ]
      }
    ],
    FieldGroup#InspIdentity: { Data: [
      { Value: bridge_ID,           Label: 'Bridge'           },
      { Value: bridge.bridgeId,     Label: 'Bridge ID'        },
      { Value: inspectionRef,       Label: 'Inspection Ref'   },
      { Value: inspectionType,      Label: 'Inspection Type'  },
      { Value: inspectionDate,      Label: 'Inspection Date'  },
      { Value: inspector,           Label: 'Inspector'        },
      { Value: accreditationLevel,  Label: 'Accreditation Level' },
      { Value: nextInspectionDue,   Label: 'Next Inspection Due' },
      { Value: active,              Label: 'Active'           }
    ]},
    FieldGroup#InspRatings: { Data: [
      { Value: conditionRating,   Label: 'Condition Rating'   },
      { Value: structuralRating,  Label: 'Structural Rating'  },
      { Value: overallGrade,      Label: 'Overall Grade'      }
    ]},
    FieldGroup#InspNotes: { Data: [
      { Value: inspectionNotes,   Label: 'Inspection Notes'   },
      { Value: recommendations,   Label: 'Recommendations'    }
    ]}
  }
);

////////////////////////////////////////////////////////////////////////////
//  BridgeDefects — standalone tile
////////////////////////////////////////////////////////////////////////////

annotate AdminService.BridgeDefects with {
  ID            @UI.Hidden;
  // Integer FKs `bridge_ID` / `inspection_ID` are generated foreign keys, not
  // projection elements — their stale parse error is handled at runtime by
  // FkMessageGuard.js (event-driven), not via annotations.
  bridge @(
    Common.FieldControl: #Mandatory,
    Common.Text: bridge.bridgeName,
    Common.TextArrangement: #TextOnly,
    Common.ValueList: { CollectionPath: 'Bridges', Parameters: [
      { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: bridge_ID,       ValueListProperty: 'ID' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'bridgeName' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'bridgeId'   }
    ]}
  ) @title: 'Bridge';
  inspection @(
    Common.Text: inspection.inspectionRef,
    Common.TextArrangement: #TextOnly,
    Common.ValueList: { CollectionPath: 'BridgeInspections', Parameters: [
      { $Type: 'Common.ValueListParameterOut',         LocalDataProperty: inspection_ID,       ValueListProperty: 'ID' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'inspectionRef'  },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'inspectionDate' }
    ]}
  ) @title: 'Inspection';
  defectId          @Core.Computed @Common.FieldControl: #ReadOnly  @title: 'Defect ID';
  defectType        @Common.FieldControl: #Mandatory  @title: 'Defect Type';
  severity @Common.FieldControl: #Mandatory  @Common.QuickInfo: '1=Low, 2=Medium, 3=High, 4=Critical'  @title: 'Severity (1–4)';
  urgency  @Common.FieldControl: #Mandatory  @Common.QuickInfo: '1=Low, 2=Medium, 3=High, 4=Immediate' @title: 'Urgency (1–4)';
  defectDescription @UI.MultiLineText  @title: 'Defect Description';
  location          @title: 'Location';
  elementAffected   @title: 'Element Affected';
  recommendedAction @UI.MultiLineText  @title: 'Recommended Action';
  status            @title: 'Status';
  targetCompletionDate @title: 'Target Completion Date';
  active            @title: 'Active';
  createdAt  @UI.Hidden;  createdBy  @UI.Hidden;  modifiedAt @UI.Hidden;  modifiedBy @UI.Hidden;
};

annotate AdminService.BridgeDefects with @(
  Capabilities.InsertRestrictions.Insertable : true,
  Capabilities.UpdateRestrictions.Updatable  : true,
  Capabilities.DeleteRestrictions.Deletable  : false,
  UI: {
    HeaderInfo: {
      TypeName      : 'Bridge Defect',
      TypeNamePlural: 'Bridge Defects',
      Title         : { $Type: 'UI.DataField', Value: defectId },
      Description   : { $Type: 'UI.DataField', Value: defectType }
    },
    SelectionFields: [bridge_ID, defectType, severity, status, active],
    LineItem: [
      { Value: bridge.bridgeName,     Label: 'Bridge'       },
      { Value: bridge.bridgeId,       Label: 'Bridge ID'    },
      { Value: defectId,              Label: 'Defect ID'    },
      { Value: defectType,            Label: 'Type'         },
      { Value: severity,              Label: 'Severity'     },
      { Value: urgency,               Label: 'Urgency'      },
      { Value: status,                Label: 'Status'       },
      { Value: targetCompletionDate,  Label: 'Target Date'  },
      { Value: active,                Label: 'Active'       }
    ],
    Facets: [
      {
        $Type : 'UI.CollectionFacet',
        Label : 'Defect Details',
        ID    : 'DefectDetails',
        Facets: [
          { $Type: 'UI.ReferenceFacet', Label: 'Identity',    Target: '@UI.FieldGroup#DefIdentity'    },
          { $Type: 'UI.ReferenceFacet', Label: 'Assessment',  Target: '@UI.FieldGroup#DefAssessment'  },
          { $Type: 'UI.ReferenceFacet', Label: 'Action',      Target: '@UI.FieldGroup#DefAction'      }
        ]
      }
    ],
    FieldGroup#DefIdentity: { Data: [
      { Value: bridge_ID,            Label: 'Bridge'           },
      { Value: bridge.bridgeId,      Label: 'Bridge ID'        },
      { Value: inspection_ID,        Label: 'Inspection'       },
      { Value: defectId,             Label: 'Defect ID'        },
      { Value: defectType,           Label: 'Defect Type'      },
      { Value: location,             Label: 'Location'         },
      { Value: elementAffected,      Label: 'Element Affected' },
      { Value: active,               Label: 'Active'           }
    ]},
    FieldGroup#DefAssessment: { Data: [
      { Value: severity,            Label: 'Severity'           },
      { Value: urgency,             Label: 'Urgency'            },
      { Value: status,              Label: 'Status'             },
      { Value: defectDescription,   Label: 'Defect Description' }
    ]},
    FieldGroup#DefAction: { Data: [
      { Value: recommendedAction,      Label: 'Recommended Action'   },
      { Value: targetCompletionDate,   Label: 'Target Completion'    }
    ]}
  }
);

////////////////////////////////////////////////////////////////////////////
//  Draft — Bridges
////////////////////////////////////////////////////////////////////////////

annotate bridge.management.Bridges with @fiori.draft.enabled;
annotate AdminService.Bridges with @odata.draft.enabled;
annotate bridge.management.BridgeCapacities with @fiori.draft.enabled;
annotate AdminService.BridgeCapacities with @odata.draft.enabled;
annotate bridge.management.BridgeInspections with @fiori.draft.enabled;
annotate AdminService.BridgeInspections with @odata.draft.enabled;
annotate bridge.management.BridgeDefects with @fiori.draft.enabled;
annotate AdminService.BridgeDefects with @odata.draft.enabled;

////////////////////////////////////////////////////////////////////////////
//  Action side-effects — force FE to re-read status after deactivate/reactivate
//  so the button visibility toggling (@UI.Hidden based on status) updates immediately
////////////////////////////////////////////////////////////////////////////

annotate AdminService.Bridges with actions {
  deactivate @Common.SideEffects: { TargetProperties: ['status'] };
  reactivate @Common.SideEffects: { TargetProperties: ['status'] };
};

annotate AdminService.Restrictions with actions {
  deactivate @Common.SideEffects: { TargetProperties: ['restrictionStatus', 'active'] };
  reactivate @Common.SideEffects: { TargetProperties: ['restrictionStatus', 'active'] };
};

annotate AdminService.BridgeRestrictions with actions {
  deactivate @Common.SideEffects: { TargetProperties: ['restrictionStatus', 'active'] };
  reactivate @Common.SideEffects: { TargetProperties: ['restrictionStatus', 'active'] };
};

////////////////////////////////////////////////////////////////////////////
//  Change Document Report — Fiori Elements List Report (ALV, read-only)
//  Unified field changes (ChangeLog) + custom-attribute changes.
////////////////////////////////////////////////////////////////////////////

annotate AdminService.ChangeDocumentReport with @(
  Capabilities.InsertRestrictions: { Insertable: false },
  Capabilities.UpdateRestrictions: { Updatable: false },
  Capabilities.DeleteRestrictions: { Deletable: false },
  UI.HeaderInfo: {
    TypeName      : 'Change Document',
    TypeNamePlural: 'Change Documents',
    Title         : { $Type: 'UI.DataField', Value: objectName },
    Description   : { $Type: 'UI.DataField', Value: fieldName }
  },
  UI.SelectionFields: [ objectType, changeKind, changeSource, changedBy, changedAt ],
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: changedAt,    Label: 'Changed At' },
    { $Type: 'UI.DataField', Value: changedBy,    Label: 'Changed By' },
    { $Type: 'UI.DataField', Value: objectType,   Label: 'Object Type' },
    { $Type: 'UI.DataField', Value: objectName,   Label: 'Object' },
    { $Type: 'UI.DataField', Value: changeKind,   Label: 'Kind' },
    { $Type: 'UI.DataField', Value: fieldName,    Label: 'Field / Attribute' },
    { $Type: 'UI.DataField', Value: oldValue,     Label: 'Old Value' },
    { $Type: 'UI.DataField', Value: newValue,     Label: 'New Value' },
    { $Type: 'UI.DataField', Value: changeSource, Label: 'Source' }
  ]
);
annotate AdminService.ChangeDocumentReport with {
  ID           @UI.Hidden;
  objectId     @UI.Hidden;
  batchId      @UI.Hidden;
  changedAt    @title: 'Changed At';
  changedBy    @title: 'Changed By';
  objectType   @title: 'Object Type';
  objectName   @title: 'Object';
  changeKind   @title: 'Kind';
  fieldName    @title: 'Field / Attribute';
  oldValue     @title: 'Old Value';
  newValue     @title: 'New Value';
  changeSource @title: 'Source';
};

////////////////////////////////////////////////////////////////////////////
//  EAM Code Mapping — Fiori Elements List Report + Object Page (draft CRUD)
////////////////////////////////////////////////////////////////////////////

annotate bridge.management.EAMCodeMapping with @fiori.draft.enabled;
annotate AdminService.EAMCodeMapping with @odata.draft.enabled;

annotate AdminService.EAMCodeMapping with @(
  UI.HeaderInfo: {
    TypeName      : 'EAM Mapping',
    TypeNamePlural: 'EAM Mappings',
    Title         : { $Type: 'UI.DataField', Value: bisValue },
    Description   : { $Type: 'UI.DataField', Value: eamValue }
  },
  UI.SelectionFields: [ bisEntity, bisField, active ],
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: bisEntity,    Label: 'BIS Entity' },
    { $Type: 'UI.DataField', Value: bisField,     Label: 'BIS Field' },
    { $Type: 'UI.DataField', Value: bisValue,     Label: 'BIS Value' },
    { $Type: 'UI.DataField', Value: eamTableName, Label: 'EAM Table' },
    { $Type: 'UI.DataField', Value: eamValue,     Label: 'EAM Value' },
    { $Type: 'UI.DataField', Value: active,       Label: 'Active' }
  ],
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', ID: 'EamMain', Label: 'Mapping', Target: '@UI.FieldGroup#EamMain' }
  ],
  UI.FieldGroup #EamMain: { Data: [
    { $Type: 'UI.DataField', Value: bisEntity },
    { $Type: 'UI.DataField', Value: bisField },
    { $Type: 'UI.DataField', Value: bisValue },
    { $Type: 'UI.DataField', Value: eamTableName },
    { $Type: 'UI.DataField', Value: eamValue },
    { $Type: 'UI.DataField', Value: description },
    { $Type: 'UI.DataField', Value: active }
  ]}
);
annotate AdminService.EAMCodeMapping with {
  ID           @UI.Hidden;
  bisEntity    @Common.FieldControl: #Mandatory @title: 'BIS Entity';
  bisField     @Common.FieldControl: #Mandatory @title: 'BIS Field';
  bisValue     @Common.FieldControl: #Mandatory @title: 'BIS Value';
  eamTableName @title: 'EAM Table (e.g. ILART, QMART)';
  eamValue     @title: 'EAM Value';
  description  @title: 'Description' @UI.MultiLineText;
  active       @title: 'Active';
};
////////////////////////////////////////////////////////////////////////////
//  Attribute Class & Characteristics — draft enablement only.
//  UI annotations (LineItem / Facets / FieldGroups) are defined globally in
//  app/attributes-admin/fiori-service.cds and reused by the FE pages added to
//  the admin-bridges manifest. Draft-enable the class root so the whole
//  composition tree (definitions -> allowedValues + objectTypeConfigs) is
//  editable as one draft document in the Fiori Elements object page.
////////////////////////////////////////////////////////////////////////////

annotate bridge.management.AttributeGroups with @fiori.draft.enabled;
annotate AdminService.AttributeGroups with @odata.draft.enabled;

////////////////////////////////////////////////////////////////////////////
//  Bridge Risk Report — Fiori Elements List Report (ALV, read-only) — Phase 2
////////////////////////////////////////////////////////////////////////////
annotate AdminService.BridgeRiskReport with @(
  Capabilities.InsertRestrictions: { Insertable: false },
  Capabilities.UpdateRestrictions: { Updatable: false },
  Capabilities.DeleteRestrictions: { Deletable: false },
  UI.HeaderInfo: { TypeName: 'Bridge Risk', TypeNamePlural: 'Bridge Risk', Title: { Value: bridgeName }, Description: { Value: riskPriority } },
  UI.SelectionFields: [ transportMode, network, state, assetClass, riskPriority ],
  UI.LineItem: [
    { Value: bridgeId,                 Label: 'Bridge ID' },
    { Value: bridgeName,               Label: 'Bridge' },
    { Value: transportMode,            Label: 'Mode' },
    { Value: network,                  Label: 'Network' },
    { Value: assetClass,               Label: 'Asset Class' },
    { Value: riskPriority,             Label: 'Risk Priority', Criticality: riskCriticality },
    { Value: riskScore,                Label: 'Risk Score' },
    { Value: riskConsequence,          Label: 'Consequence' },
    { Value: riskLikelihood,           Label: 'Likelihood' },
    { Value: conditionRating,          Label: 'Condition' },
    { Value: structuralAdequacyRating, Label: 'Structural' },
    { Value: importanceLevel,          Label: 'Importance' },
    { Value: lastInspectionDate,       Label: 'Last Inspected' }
  ]
);
annotate AdminService.BridgeRiskReport with {
  ID @UI.Hidden;
  bridgeId @title:'Bridge ID'; bridgeName @title:'Bridge'; transportMode @title:'Mode';
  network @title:'Network'; assetClass @title:'Asset Class'; riskPriority @title:'Risk Priority';
  riskScore @title:'Risk Score'; riskConsequence @title:'Consequence'; riskLikelihood @title:'Likelihood';
  conditionRating @title:'Condition'; structuralAdequacyRating @title:'Structural'; importanceLevel @title:'Importance';
};

////////////////////////////////////////////////////////////////////////////
//  Network Restrictions Report — ALV List Report + Analytical List Page — Phase 3
////////////////////////////////////////////////////////////////////////////
annotate AdminService.NetworkRestrictionReport with @(
  Capabilities.InsertRestrictions: { Insertable: false },
  Capabilities.UpdateRestrictions: { Updatable: false },
  Capabilities.DeleteRestrictions: { Deletable: false },
  UI.HeaderInfo: { TypeName: 'Network Restriction', TypeNamePlural: 'Network Restrictions', Title: { Value: bridgeName }, Description: { Value: restrictionType } },
  UI.SelectionFields: [ transportMode, network, restrictionType, restrictionSeverity, restrictionStatus, riskPriority, state ],
  UI.LineItem: [
    { Value: bridgeName,          Label: 'Bridge' },
    { Value: bridgeId,            Label: 'Bridge ID' },
    { Value: transportMode,       Label: 'Mode' },
    { Value: network,             Label: 'Network' },
    { Value: restrictionType,     Label: 'Type' },
    { Value: restrictionValue,    Label: 'Value' },
    { Value: restrictionUnit,     Label: 'Unit' },
    { Value: laneAvailability,    Label: 'Lane Availability' },
    { Value: restrictionSeverity, Label: 'Severity' },
    { Value: riskPriority,        Label: 'Bridge Risk' },
    { Value: restrictionStatus,   Label: 'Status' },
    { Value: state,               Label: 'State' },
    { Value: issuingAuthority,    Label: 'Authority' }
  ],
  UI.Chart #restrChart: {
    ChartType: #Column,
    Dimensions: [ transportMode ],
    DynamicMeasures: [ '@Analytics.AggregatedProperty#restrCount' ],
    Title: 'Restrictions by Mode'
  },
  UI.PresentationVariant #restrPV: {
    Visualizations: [ '@UI.Chart#restrChart', '@UI.LineItem' ]
  },
  Aggregation.ApplySupported: {
    Transformations: [ 'aggregate', 'groupby', 'filter' ],
    GroupableProperties: [ transportMode, network, restrictionType, restrictionSeverity, restrictionStatus, riskPriority, state ],
    AggregatableProperties: [ { Property: ID } ]
  },
  Analytics.AggregatedProperty #restrCount: {
    Name: 'restrCount', AggregationMethod: 'countdistinct', AggregatableProperty: ID, ![@Common.Label]: 'Restrictions'
  }
);
annotate AdminService.NetworkRestrictionReport with {
  ID @UI.Hidden;
  bridgeName @title:'Bridge'; bridgeId @title:'Bridge ID'; transportMode @title:'Mode'; network @title:'Network';
  restrictionType @title:'Type'; restrictionValue @title:'Value'; restrictionUnit @title:'Unit';
  laneAvailability @title:'Lane Availability'; restrictionSeverity @title:'Severity'; riskPriority @title:'Bridge Risk';
  restrictionStatus @title:'Status'; state @title:'State'; issuingAuthority @title:'Authority';
};

////////////////////////////////////////////////////////////////////////////
//  Asset Class Strategy — Fiori Elements (draft CRUD) — Phase 4
////////////////////////////////////////////////////////////////////////////
annotate bridge.management.AssetClassStrategy with @fiori.draft.enabled;
annotate AdminService.AssetClassStrategy with @odata.draft.enabled;
annotate AdminService.AssetClassStrategy with @(
  UI.HeaderInfo: { TypeName: 'Asset Class Strategy', TypeNamePlural: 'Asset Class Strategies', Title: { Value: name }, Description: { Value: assetClass } },
  UI.SelectionFields: [ assetClass, transportMode, active ],
  UI.LineItem: [
    { Value: name,                     Label: 'Strategy' },
    { Value: assetClass,               Label: 'Asset Class' },
    { Value: transportMode,            Label: 'Mode' },
    { Value: inspectionIntervalMonths, Label: 'Inspection (mo)' },
    { Value: targetConditionRating,    Label: 'Target Condition' },
    { Value: interventionThreshold,    Label: 'Intervention At' },
    { Value: active,                   Label: 'Active' }
  ],
  UI.Facets: [ { $Type:'UI.ReferenceFacet', ID:'ACSMain', Label:'Strategy', Target:'@UI.FieldGroup#ACSMain' } ],
  UI.FieldGroup #ACSMain: { Data: [
    { Value: name }, { Value: assetClass }, { Value: transportMode },
    { Value: inspectionIntervalMonths }, { Value: targetConditionRating },
    { Value: interventionThreshold }, { Value: reviewCycleMonths },
    { Value: description }, { Value: active }
  ]}
);
annotate AdminService.AssetClassStrategy with {
  ID @UI.Hidden;
  name @Common.FieldControl:#Mandatory @title:'Strategy Name';
  assetClass @title:'Asset Class';
  transportMode @(Common.ValueListWithFixedValues, Common.ValueList:{ CollectionPath:'TransportModes', Parameters:[
    {$Type:'Common.ValueListParameterOut', LocalDataProperty:transportMode, ValueListProperty:'code'},
    {$Type:'Common.ValueListParameterDisplayOnly', ValueListProperty:'name'} ]}) @title:'Transport Mode';
  inspectionIntervalMonths @title:'Inspection Interval (months)';
  targetConditionRating @title:'Target Condition (1-10)';
  interventionThreshold @title:'Intervention Threshold (1-10)';
  reviewCycleMonths @title:'Review Cycle (months)';
  description @UI.MultiLineText @title:'Description';
  active @title:'Active';
};

////////////////////////////////////////////////////////////////////////////
//  Risk Config & Risk Bands — Fiori Elements list (admin-tunable) — Phase 4
////////////////////////////////////////////////////////////////////////////
annotate AdminService.RiskConfig with @(
  UI.HeaderInfo: { TypeName:'Risk Factor', TypeNamePlural:'Risk Factors', Title:{Value:name}, Description:{Value:factor} },
  UI.LineItem: [
    { Value: factor, Label:'Factor' }, { Value: name, Label:'Name' },
    { Value: weight, Label:'Weight' }, { Value: active, Label:'Active' }
  ],
  UI.Facets: [ { $Type:'UI.ReferenceFacet', ID:'RCMain', Label:'Factor', Target:'@UI.FieldGroup#RCMain' } ],
  UI.FieldGroup #RCMain: { Data: [ {Value:factor},{Value:name},{Value:weight},{Value:active} ] }
);
annotate AdminService.RiskConfig with { factor @title:'Factor'; name @title:'Name'; weight @title:'Weight'; active @title:'Active'; };

annotate AdminService.RiskBand with @(
  UI.HeaderInfo: { TypeName:'Risk Band', TypeNamePlural:'Risk Bands', Title:{Value:name}, Description:{Value:code} },
  UI.LineItem: [
    { Value: sortOrder, Label:'Order' }, { Value: name, Label:'Band' },
    { Value: minScore, Label:'Min Score' }, { Value: maxScore, Label:'Max Score' }, { Value: colour, Label:'Colour' }
  ],
  UI.Facets: [ { $Type:'UI.ReferenceFacet', ID:'RBMain', Label:'Band', Target:'@UI.FieldGroup#RBMain' } ],
  UI.FieldGroup #RBMain: { Data: [ {Value:code},{Value:name},{Value:minScore},{Value:maxScore},{Value:colour},{Value:sortOrder} ] }
);
annotate AdminService.RiskBand with { code @title:'Code'; name @title:'Band'; minScore @title:'Min Score'; maxScore @title:'Max Score'; colour @title:'Colour'; sortOrder @title:'Order'; };
