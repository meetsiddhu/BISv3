using { bridge.management as bms } from '../../db/schema';
using { BridgeManagementService } from '../service';

extend service BridgeManagementService with {

    // Facade consolidation (Option C, 2026-06-19): this BMS projection of Bridges has NO OData-CRUD
    // consumer — every UI binds to AdminService/Express, and the only programmatic writes are the
    // bound actions below + mass-edit, which write the raw `bridge.management.Bridges` via the db
    // layer (not this projection). @readonly therefore makes AdminService the single OData WRITER of
    // Bridges (kills the dual-facade write overlap) with zero effect on the action write-paths.
    @readonly
    @cds.redirection.target: true
    @cds.query.limit: { max: 5000, default: 200 }
    @restrict: [
        { grant: ['READ'],            to: ['view','manage','admin'] },
        { grant: ['CREATE','UPDATE'], to: ['manage','admin'] },
        { grant: ['DELETE'],          to: ['admin'] }
    ]
    entity Bridges as projection on bms.Bridges actions {
        action changeCondition(conditionValue: String, score: Integer)
               returns { ID: Integer; bridgeId: String; bridgeName: String; condition: String };
        action closeForTraffic()
               returns { ID: Integer; bridgeId: String; bridgeName: String; postingStatus: String };
        action reopenForTraffic()
               returns { ID: Integer; bridgeId: String; bridgeName: String; postingStatus: String };
        action addRestriction(
            restrictionType   : String,
            restrictionValue  : String,
            restrictionUnit   : String,
            effectiveFrom     : Date,
            effectiveTo       : Date,
            restrictionStatus : String,
            permitRequired    : Boolean,
            direction         : String,
            remarks           : String
        ) returns { status: String; message: String; ID: UUID };
    };

    @readonly
    @restrict: [
        { grant: ['READ'],            to: ['view','manage','admin'] },
        { grant: ['CREATE','UPDATE'], to: ['manage','admin'] },
        { grant: ['DELETE'],          to: ['admin'] }
    ]
    entity BridgeAttributes as projection on bms.BridgeAttributes;

};
