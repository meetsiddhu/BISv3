using { BridgeManagementService as srv } from '../../../srv/service';

annotate srv.Bridges with @(
    UI.SelectionFields: [ state, region, condition, postingStatus, assetClass ],
    UI.LineItem: [
        { Value: bridgeId,        Label: 'Bridge ID' },
        { Value: bridgeName,      Label: 'Bridge Name' },
        { Value: state,           Label: 'State' },
        { Value: region,          Label: 'Region' },
        { Value: lga,             Label: 'LGA' },
        { Value: assetClass,      Label: 'Asset Class' },
        { Value: structureType,   Label: 'Structure Type' },
        { Value: condition,       Label: 'Condition' },
        { Value: conditionRating, Label: 'Rating' },
        { Value: postingStatus,   Label: 'Status' },
        { Value: yearBuilt,       Label: 'Year Built' },
        { Value: status,          Label: 'Lifecycle Status' }
    ],
    UI.HeaderInfo: {
        TypeName: 'Bridge', TypeNamePlural: 'Bridges',
        Title: { Value: bridgeName }, Description: { Value: bridgeId }
    },
    UI.Facets: [
        { $Type: 'UI.ReferenceFacet', Label: 'General',     Target: '@UI.FieldGroup#General' },
        { $Type: 'UI.ReferenceFacet', Label: 'Location',    Target: '@UI.FieldGroup#Location' },
        { $Type: 'UI.ReferenceFacet', Label: 'Dimensions',  Target: '@UI.FieldGroup#Dimensions' },
        { $Type: 'UI.ReferenceFacet', Label: 'Engineering', Target: '@UI.FieldGroup#Engineering' },
        { $Type: 'UI.ReferenceFacet', Label: 'Restrictions',Target: 'restrictions/@UI.LineItem#sub' },
        { $Type: 'UI.ReferenceFacet', Label: 'Admin',       Target: '@UI.FieldGroup#Admin' }
    ],
    UI.FieldGroup#General: { Data: [
        { Value: bridgeId }, { Value: bridgeName }, { Value: assetClass },
        { Value: structureType }, { Value: material }, { Value: condition },
        { Value: conditionRating }, { Value: postingStatus },
        { Value: lastInspectionDate }, { Value: highPriorityAsset }
    ]},
    UI.FieldGroup#Location: { Data: [
        { Value: state }, { Value: region }, { Value: lga }, { Value: route },
        { Value: routeNumber }, { Value: latitude }, { Value: longitude }
    ]},
    UI.FieldGroup#Dimensions: { Data: [
        { Value: yearBuilt }, { Value: spanLength }, { Value: totalLength },
        { Value: deckWidth }, { Value: clearanceHeight },
        { Value: spanCount }, { Value: numberOfLanes }
    ]},
    UI.FieldGroup#Engineering: { Data: [
        { Value: designLoad }, { Value: loadRating },
        { Value: floodImpacted }, { Value: nhvrAssessed },
        { Value: hmlApproved }, { Value: bDoubleApproved },
        { Value: freightRoute }, { Value: assetOwner }, { Value: managingAuthority }
    ]},
    UI.FieldGroup#Admin: { Data: [
        { Value: createdBy }, { Value: createdAt }, { Value: modifiedBy }, { Value: modifiedAt }
    ]}
);

annotate srv.Restrictions with @(
    UI.LineItem #sub: [
        { Value: restrictionType, Label: 'Type' },
        { Value: restrictionValue, Label: 'Value' },
        { Value: restrictionUnit,  Label: 'Unit' },
        { Value: restrictionStatus, Label: 'Status' },
        { Value: effectiveFrom,   Label: 'Valid From' },
        { Value: effectiveTo,     Label: 'Valid To' }
    ]
);
