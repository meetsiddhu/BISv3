using { BridgeManagementService } from '../service';

extend service BridgeManagementService with {
    // UAT P2-004: dashboard KPIs/distributions were ungated. Require an app scope.
    @requires: ['view','manage','admin']
    function getNetworkKPIs() returns {
        totalBridges:       Integer;
        restrictedBridges:  Integer;
        closedBridges:      Integer;
        criticalCondition:  Integer;
        highPriority:       Integer;
        activeRestrictions: Integer
    };
    @requires: ['view','manage','admin']
    function getConditionDistribution(state: String, region: String) returns array of {
        condition: String; count: Integer
    };
    @requires: ['view','manage','admin']
    function getRestrictionSummary(state: String, region: String) returns array of {
        restrictionType: String; count: Integer
    };
    // me() returns the caller's own identity — any authenticated user.
    @requires: 'authenticated-user'
    function me() returns { id: String; name: String; roles: String };
}
