using { BridgeManagementService } from '../service';

extend service BridgeManagementService with {
    @requires: ['manage','admin']
    action massUploadBridges(csvData: LargeString)
           returns { processed: Integer; succeeded: Integer; failed: Integer; errors: String };

    @requires: ['manage','admin']
    action massUploadRestrictions(csvData: LargeString)
           returns { processed: Integer; succeeded: Integer; failed: Integer; errors: String };

    @requires: ['view','manage','admin']
    action massDownloadBridges(region: String, state: String, routeCode: String)
           returns { csvData: LargeString; filename: String; recordCount: Integer };

    // Restriction extract (round-trip with massUploadRestrictions / mass edit).
    @requires: ['view','manage','admin']
    action massDownloadRestrictions(state: String)
           returns { csvData: LargeString; filename: String; recordCount: Integer };
}
