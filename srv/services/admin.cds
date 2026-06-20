using nhvr from '../../db/schema';
using { bridge.management as bms } from '../../db/schema';
using { BridgeManagementService } from '../service';

extend service BridgeManagementService with {
    // Facade consolidation (Option C): config projections are read-only here — the live config
    // writers are AdminService (/odata/v4/admin) + the Express config editors + the saveRoleConfig
    // action below (which writes nhvr.RoleConfig via the db layer). No OData-CRUD consumer binds here.
    @readonly
    @restrict: [{ grant: '*', to: 'admin' }]
    entity Lookups as projection on nhvr.Lookup;

    @readonly
    @restrict: [{ grant: '*', to: 'admin' }]
    entity AttributeDefinitions as projection on bms.AttributeDefinitions {
        *, allowedValues: redirected to AttributeAllowedValues
    };

    @readonly
    @cds.redirection.target: true
    @restrict: [{ grant: '*', to: 'admin' }]
    entity AttributeAllowedValues as projection on bms.AttributeAllowedValues;

    @readonly
    @restrict: [{ grant: '*', to: 'admin' }]
    entity RoleConfigs as projection on nhvr.RoleConfig;

    @readonly
    @restrict: [{ grant: ['READ'], to: ['manage','admin'] }]
    entity AuditLogs as projection on bms.ChangeLog {
        key ID,
        changedAt  as timestamp,
        changedBy  as userId,
        objectType as entity,
        objectId   as entityId,
        objectName as entityName,
        fieldName  as action,
        oldValue,
        newValue,
        changeSource,
        batchId
    };

    // UAT P2-004: this mutating action rewrites role->feature visibility; was ungated. Admin only.
    @requires: 'admin'
    action saveRoleConfig(configs: array of {
        role: String; featureKey: String; featureType: String;
        label: String; visible: Boolean; editable: Boolean; featureEnabled: Boolean
    }) returns { saved: Integer };
}
