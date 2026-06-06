'use strict'

function buildSandboxConfig (isAdmin) {
  const operationsTiles = [
    {
      id: 'Dashboard',
      tileType: 'sap.ushell.ui.tile.StaticTile',
      properties: { title: 'Dashboard', subtitle: 'Portfolio Insights', icon: 'sap-icon://home', targetURL: '#Dashboard-display' }
    },
    {
      id: 'Bridges',
      tileType: 'sap.ushell.ui.tile.StaticTile',
      properties: { title: 'Bridges', subtitle: 'Asset Registry', icon: 'sap-icon://functional-location', targetURL: '#Bridges-manage' }
    },
    {
      id: 'Restrictions',
      tileType: 'sap.ushell.ui.tile.StaticTile',
      properties: { title: 'Restrictions', subtitle: 'Active & Scheduled', icon: 'sap-icon://alert', targetURL: '#Restrictions-manage' }
    },
    {
      id: 'MapView',
      tileType: 'sap.ushell.ui.tile.StaticTile',
      properties: { title: 'Map View', subtitle: 'Geographic Explorer', icon: 'sap-icon://map-2', targetURL: '#Map-display' }
    }
  ]

  const adminGroupTiles = [
    {
      id: 'MassUpload',
      tileType: 'sap.ushell.ui.tile.StaticTile',
      properties: { title: 'Mass Upload', subtitle: 'CSV & Excel Import', icon: 'sap-icon://upload-to-cloud', targetURL: '#MassUpload-display' }
    },
    {
      id: 'MassEdit',
      tileType: 'sap.ushell.ui.tile.StaticTile',
      properties: { title: 'Mass Edit', subtitle: 'In-App Grid Editor', icon: 'sap-icon://edit', targetURL: '#MassEdit-manage' }
    }
  ]

  const subdomainTiles = [
    {
      id: 'BridgeInspections',
      tileType: 'sap.ushell.ui.tile.StaticTile',
      properties: { title: 'Inspections', subtitle: 'All Bridge Inspections', icon: 'sap-icon://inspection', targetURL: '#BridgeInspections-manage&/BridgeInspections' }
    },
    {
      id: 'BridgeDefects',
      tileType: 'sap.ushell.ui.tile.StaticTile',
      properties: { title: 'Defects', subtitle: 'Create & Manage Defects', icon: 'sap-icon://quality-issue', targetURL: '#BridgeDefects-manage&/BridgeDefects' }
    },
    {
      id: 'BridgeCapacities',
      tileType: 'sap.ushell.ui.tile.StaticTile',
      properties: { title: 'Bridge Capacity', subtitle: 'Load & Geometric Capacities', icon: 'sap-icon://simulate', targetURL: '#BridgeCapacities-manage&/BridgeCapacities' }
    }
  ]

  if (isAdmin) {
    adminGroupTiles.push(
      {
        id: 'BmsAdmin',
        tileType: 'sap.ushell.ui.tile.StaticTile',
        properties: { title: 'BMS Administration', subtitle: 'Audit, Config & User Access', icon: 'sap-icon://action-settings', targetURL: '#BmsAdmin-manage' }
      },
      {
        id: 'ChangeDocuments',
        tileType: 'sap.ushell.ui.tile.StaticTile',
        properties: { title: 'Change Documents', subtitle: 'Audit & Attribute History', icon: 'sap-icon://history', targetURL: '#ChangeDocuments-display&/ChangeDocumentReport' }
      },
      {
        id: 'AttributeClasses',
        tileType: 'sap.ushell.ui.tile.StaticTile',
        properties: { title: 'Attribute Classes', subtitle: 'Classes & Characteristics', icon: 'sap-icon://customize', targetURL: '#AttributeClasses-manage&/AttributeGroups' }
      },
      {
        id: 'EAMMapping',
        tileType: 'sap.ushell.ui.tile.StaticTile',
        properties: { title: 'EAM Code Mapping', subtitle: 'SAP EAM Value Mapping', icon: 'sap-icon://chain-link', targetURL: '#EAMMapping-manage&/EAMCodeMapping' }
      }
    )
  }

  const inbounds = {
    'Dashboard-display': {
      semanticObject: 'Dashboard', action: 'display', title: 'Dashboard',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.dashboard', url: '/BridgeManagementdashboard' }
    },
    'Bridges-manage': {
      semanticObject: 'Bridges', action: 'manage', title: 'Bridges',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.adminbridges', url: '/BridgeManagementadminbridges' }
    },
    'BridgeInspections-manage': {
      semanticObject: 'BridgeInspections', action: 'manage', title: 'Inspections',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.adminbridges', url: '/BridgeManagementadminbridges' }
    },
    'BridgeDefects-manage': {
      semanticObject: 'BridgeDefects', action: 'manage', title: 'Defects',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.adminbridges', url: '/BridgeManagementadminbridges' }
    },
    'BridgeCapacities-manage': {
      semanticObject: 'BridgeCapacities', action: 'manage', title: 'Bridge Capacity',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.adminbridges', url: '/BridgeManagementadminbridges' }
    },
    'Restrictions-manage': {
      semanticObject: 'Restrictions', action: 'manage', title: 'Restrictions',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.restrictions', url: '/BridgeManagementrestrictions' }
    },
    'Map-display': {
      semanticObject: 'Map', action: 'display', title: 'Map View',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.mapview', url: '/BridgeManagementmapview' }
    },
    'MassUpload-display': {
      semanticObject: 'MassUpload', action: 'display', title: 'Mass Upload',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.massupload', url: '/BridgeManagementmassupload' }
    },
    'MassEdit-manage': {
      semanticObject: 'MassEdit', action: 'manage', title: 'Mass Edit',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.massedit', url: '/BridgeManagementmassedit' }
    }
  }

  if (isAdmin) {
    inbounds['BmsAdmin-manage'] = {
      semanticObject: 'BmsAdmin', action: 'manage', title: 'BMS Administration',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.bmsadmin', url: '/BridgeManagementbmsadmin' }
    }
    // Change Documents, Attribute Classes, EAM Mapping render in the admin-bridges
    // Fiori Elements app (additional entitySets/routes added to its manifest).
    inbounds['ChangeDocuments-display'] = {
      semanticObject: 'ChangeDocuments', action: 'display', title: 'Change Documents',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.adminbridges', url: '/BridgeManagementadminbridges' }
    }
    inbounds['AttributeClasses-manage'] = {
      semanticObject: 'AttributeClasses', action: 'manage', title: 'Attribute Classes',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.adminbridges', url: '/BridgeManagementadminbridges' }
    }
    inbounds['EAMMapping-manage'] = {
      semanticObject: 'EAMMapping', action: 'manage', title: 'EAM Code Mapping',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.adminbridges', url: '/BridgeManagementadminbridges' }
    }
  }

  return {
    services: {
      LaunchPage: {
        adapter: {
          config: {
            catalogs: [],
            groups: [
              {
                id: 'bms.group.operations',
                title: 'OPERATIONS',
                isPreset: true, isVisible: true, isGroupLocked: false,
                tiles: operationsTiles
              },
              {
                id: 'bms.group.subdomains',
                title: 'BRIDGE SUB-DOMAINS',
                isPreset: true, isVisible: true, isGroupLocked: false,
                tiles: subdomainTiles
              },
              {
                id: 'bms.group.admin',
                title: 'BMS ADMIN',
                isPreset: true, isVisible: true, isGroupLocked: false,
                tiles: adminGroupTiles
              }
            ]
          }
        }
      },
      NavTargetResolution: { config: { enableClientSideTargetResolution: true } },
      ClientSideTargetResolution: { adapter: { config: { inbounds } } }
    }
  }
}

module.exports = { buildSandboxConfig }
