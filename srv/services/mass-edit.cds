using { bridge.management as bms } from '../../db/schema';
using { BridgeManagementService } from '../service';

extend service BridgeManagementService with {
    @cds.query.limit: { max: 5000, default: 500 }
    @restrict: [
        { grant: ['READ'],   to: ['view','manage','admin'] },
        { grant: ['UPDATE'], to: ['manage','admin'] }
    ]
    entity BridgeGrid as projection on bms.Bridges {
        key ID, bridgeId, bridgeName, state, region, lga,
        condition, conditionRating, postingStatus,
        loadRating, hmlApproved, bDoubleApproved, freightRoute
    };

    @restrict: [{ grant: '*', to: ['manage','admin'] }]
    action massEditBridges(rows: array of {
        ID: Integer; condition: String; conditionRating: Integer;
        postingStatus: String; loadRating: Decimal;
        hmlApproved: Boolean; bDoubleApproved: Boolean;
        freightRoute: Boolean
    }) returns { updated: Integer; failed: Integer; errors: String };
}
