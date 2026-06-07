using { BridgeManagementService } from '../service';

extend service BridgeManagementService with {
    @restrict: [{ grant: '*',      to: ['manage','admin'] }]
    action massUploadBridges(csvData: LargeString)
           returns { processed: Integer; succeeded: Integer; failed: Integer; errors: String };

    @restrict: [{ grant: '*', to: ['manage','admin'] }]
    action massUploadRestrictions(csvData: LargeString)
           returns { processed: Integer; succeeded: Integer; failed: Integer; errors: String };

    @restrict: [{ grant: '*',    to: ['view','manage','admin'] }]
    action massDownloadBridges(region: String, state: String, routeCode: String)
           returns { csvData: LargeString; filename: String; recordCount: Integer };
}
