namespace nhvr;
using { cuid, managed } from '@sap/cds/common';

entity Bridge : cuid, managed {
    bridgeId            : String(20)    @mandatory @assert.unique;
    name                : String(200)   @mandatory;
    region              : String(100);
    state               : String(50)    default 'NSW';
    lga                 : String(100);
    suburb              : String(100);
    assetClass          : String(30)    default 'BRIDGE';
    structureType       : String(100);
    material            : String(100);
    condition               : String(20)  default 'GOOD';
    conditionRating         : Integer;
    conditionScore          : Integer;
    postingStatus       : String(20)  default 'UNRESTRICTED';
    highPriorityAsset   : Boolean default false;
    overdueFlag         : Boolean default false;
    yearBuilt           : Integer;
    spanLengthM         : Decimal(8,2);
    totalLengthM        : Decimal(8,2);
    deckWidthM          : Decimal(6,2);
    clearanceHeightM    : Decimal(5,2);
    numberOfSpans       : Integer;
    numberOfLanes       : Integer;
    designLoad          : String(100);
    loadRating          : Decimal(8,3);
    floodImpacted       : Boolean default false;
    nhvrRouteAssessed   : Boolean default false;
    freightRoute        : Boolean default false;
    overMassRoute       : Boolean default false;
    hmlApproved         : Boolean default false;
    bdoubleApproved     : Boolean default false;
    assetOwner          : String(100);
    maintenanceAuthority: String(100);
    gazetteRef          : String(100);
    nhvrRef             : String(100);
    aadtVehicles        : Integer;
    remarks             : LargeString;
    isActive            : Boolean default true;
    isDeleted           : Boolean default false;

    conditionRatingTfnsw    : Integer;
    conditionRatingDate     : Date;
    importanceLevel         : String(20);
    designLife              : Integer;
    yearRebuilt             : Integer;
    lastInspectionDate      : Date;
    lastInspectionType      : String(30);
    nextInspectionDate      : Date;
    inspectionFrequencyYears: Integer default 2;
    pbsApprovalClass        : String(20);
    aadt                    : Integer;
    heavyVehiclePercentage  : Decimal(5,2);
    floodImmunityAri        : Integer;
    seismicZone             : String(20);
    designLoadCode          : String(20);
    dataSource              : String(111);
    version                 : Integer default 1;
    postingStatusReason     : String(200);

    // backlinks added via extend in restrictions.cds
}

annotate Bridge with @(cds.persistence.indexes: [
    { name: 'idx_bridge_bridgeId',      columns: ['bridgeId'] },
    { name: 'idx_bridge_state',         columns: ['state'] },
    { name: 'idx_bridge_condition',     columns: ['condition'] },
    { name: 'idx_bridge_isActive',      columns: ['isActive'] },
    { name: 'idx_bridge_postingStatus', columns: ['postingStatus'] }
]);
