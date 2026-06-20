using { bridge.management as bms } from '../../db/schema';
using { BridgeManagementService } from '../service';

extend service BridgeManagementService with {
    @readonly
    @restrict: [{ grant: ['READ'], to: ['view','manage','admin'] }]
    entity BridgeLocations as select from bms.Bridges {
        key ID, bridgeId, bridgeName, latitude, longitude,
        condition, postingStatus, state, region
    } where latitude is not null and longitude is not null;

    // UAT P2-004: gate the map actions/functions (were ungated — getMapApiConfig leaked the
    // provider apiKey to any authenticated caller regardless of scope).
    @requires: ['view','manage','admin']
    action geocodeAddress(address: String)
           returns { latitude: Decimal; longitude: Decimal; formattedAddress: String };
    @requires: ['view','manage','admin']
    action reverseGeocode(latitude: Decimal, longitude: Decimal)
           returns { address: String; suburb: String; state: String; postcode: String };
    @requires: ['view','manage','admin']
    function getMapApiConfig() returns { provider: String; apiKey: String; defaultZoom: Integer };
}
