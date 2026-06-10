using { bridge.management as bms } from '../../db/schema';
using { BridgeManagementService } from '../service';

extend service BridgeManagementService with {

    @cds.redirection.target: true
    @cds.query.limit: { max: 5000, default: 200 }
    @restrict: [
        { grant: ['READ'],            to: ['view','manage','admin'] },
        { grant: ['CREATE','UPDATE'], to: ['manage','admin'] },
        { grant: ['DELETE'],          to: ['admin'] }
    ]
    entity Restrictions as projection on bms.Restrictions {
        *,
        bridge.bridgeId   as bridgeId   @readonly,
        bridge.bridgeName as bridgeName @readonly
    } actions {
        action disableRestriction(reason: String) returns { status: String; message: String };
        action enableRestriction(reason: String)  returns { status: String; message: String };
        action createTemporaryRestriction(fromDate: Date, toDate: Date, reason: String)
               returns { status: String; message: String; ID: UUID };
    };

    @readonly
    @restrict: [{ grant: ['READ'], to: ['view','manage','admin'] }]
    entity ActiveRestrictions as select from bms.Restrictions {
        key ID, restrictionType, restrictionValue, restrictionUnit,
        bridge.bridgeId   as bridgeId,
        bridge.bridgeName as bridgeName,
        effectiveFrom, effectiveTo, permitRequired, direction, restrictionStatus,
        // New type-relevant attributes (additive)
        restrictionCategory, appliesToVehicleClass, restrictionSeverity,
        laneAvailability, gazetteExpiryDate, reviewDueDate
    } where restrictionStatus = 'Active' and active = true;
};
