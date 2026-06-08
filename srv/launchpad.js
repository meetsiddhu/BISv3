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
    },
    {
      id: 'Prioritisation',
      tileType: 'sap.ushell.ui.tile.StaticTile',
      properties: { title: 'Bridge Prioritisation', subtitle: 'Ranked worklist · assess · reports', icon: 'sap-icon://sort-descending', targetURL: '#Prioritisation-display' }
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
        id: 'AttributeClasses',
        tileType: 'sap.ushell.ui.tile.StaticTile',
        properties: { title: 'Attribute Classes', subtitle: 'Classes & Characteristics', icon: 'sap-icon://customize', targetURL: '#AttributeClasses-manage&/AttributeGroups' }
      },
      {
        id: 'EAMMapping',
        tileType: 'sap.ushell.ui.tile.StaticTile',
        properties: { title: 'EAM Code Mapping', subtitle: 'SAP EAM Value Mapping', icon: 'sap-icon://chain-link', targetURL: '#EAMMapping-manage&/EAMCodeMapping' }
      },
      {
        id: 'EAMFieldMapping',
        tileType: 'sap.ushell.ui.tile.StaticTile',
        properties: { title: 'EAM Field Mapping', subtitle: 'BIS to EAM Field Map', icon: 'sap-icon://chain-link', targetURL: '#EAMFieldMapping-manage&/EAMFieldMapping' }
      },
      {
        id: 'EAMSyncLog',
        tileType: 'sap.ushell.ui.tile.StaticTile',
        properties: { title: 'EAM Sync Log', subtitle: 'Integration Audit Trail', icon: 'sap-icon://history', targetURL: '#EAMSyncLog-display&/EAMSyncLog' }
      },
      {
        id: 'BridgeElements',
        tileType: 'sap.ushell.ui.tile.StaticTile',
        properties: { title: 'Bridge Elements', subtitle: 'NSW Level-2 Elements', icon: 'sap-icon://tree', targetURL: '#BridgeElements-manage&/BridgeElements' }
      }
    )
  }

  // Reports & analytics tiles — admin only. (Risk Bands / Risk Factors / Asset Class Strategy
  // config moved into the BMS Administration app; the redundant flat-ALV Network Restrictions
  // tile was dropped — its inbound is kept for deep-links. NetworkPortfolio surfaces the
  // previously-orphaned NetworkPortfolioReport.)
  const riskNetworkTiles = isAdmin ? [
    { id: 'BridgeRisk',           tileType: 'sap.ushell.ui.tile.StaticTile', properties: { title: 'Bridge Risk',            subtitle: 'Risk-Prioritised Worklist',  icon: 'sap-icon://warning2',                     targetURL: '#BridgeRisk-display&/BridgeRiskReport' } },
    { id: 'NetworkPortfolio',     tileType: 'sap.ushell.ui.tile.StaticTile', properties: { title: 'Network Portfolio',     subtitle: 'Network x Mode Analytics',   icon: 'sap-icon://business-objects-experience',  targetURL: '#NetworkPortfolio-display&/NetworkPortfolioReport' } },
    { id: 'RestrictionsDashboard',tileType: 'sap.ushell.ui.tile.StaticTile', properties: { title: 'Restrictions Dashboard', subtitle: 'Multi-Mode Analytics (ALP)', icon: 'sap-icon://bar-chart',                    targetURL: '#RestrictionsDashboard-display&/NetworkRestrictionReport' } },
    { id: 'ChangeDocuments',      tileType: 'sap.ushell.ui.tile.StaticTile', properties: { title: 'Change Documents',      subtitle: 'Audit & Attribute History',  icon: 'sap-icon://history',                      targetURL: '#ChangeDocuments-display&/ChangeDocumentReport' } }
  ] : []

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
    'Prioritisation-display': {
      semanticObject: 'Prioritisation', action: 'display', title: 'Bridge Prioritisation',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.prioritisation', url: '/BridgeManagementprioritisation' }
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
    inbounds['EAMFieldMapping-manage'] = {
      semanticObject: 'EAMFieldMapping', action: 'manage', title: 'EAM Field Mapping',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.adminbridges', url: '/BridgeManagementadminbridges' }
    }
    inbounds['EAMSyncLog-display'] = {
      semanticObject: 'EAMSyncLog', action: 'display', title: 'EAM Sync Log',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.adminbridges', url: '/BridgeManagementadminbridges' }
    }
    inbounds['BridgeElements-manage'] = {
      semanticObject: 'BridgeElements', action: 'manage', title: 'Bridge Elements',
      signature: { parameters: {}, additionalParameters: 'allowed' },
      resolutionResult: { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.adminbridges', url: '/BridgeManagementadminbridges' }
    }
    // Risk & multi-modal (Phases 2-4) — all render in the admin-bridges FE app.
    var adminBridgesRR = { applicationType: 'SAPUI5', additionalInformation: 'SAPUI5.Component=BridgeManagement.adminbridges', url: '/BridgeManagementadminbridges' }
    inbounds['BridgeRisk-display']           = { semanticObject: 'BridgeRisk',           action: 'display', title: 'Bridge Risk',            signature: { parameters: {}, additionalParameters: 'allowed' }, resolutionResult: adminBridgesRR }
    inbounds['NetworkPortfolio-display']     = { semanticObject: 'NetworkPortfolio',     action: 'display', title: 'Network Portfolio',      signature: { parameters: {}, additionalParameters: 'allowed' }, resolutionResult: adminBridgesRR }
    // Kept (no tile) so existing bookmarks/deep-links to the network-restrictions ALV resolve.
    inbounds['NetworkRestrictions-manage']   = { semanticObject: 'NetworkRestrictions',   action: 'manage',  title: 'Network Restrictions',   signature: { parameters: {}, additionalParameters: 'allowed' }, resolutionResult: adminBridgesRR }
    inbounds['RestrictionsDashboard-display']= { semanticObject: 'RestrictionsDashboard', action: 'display', title: 'Restrictions Dashboard', signature: { parameters: {}, additionalParameters: 'allowed' }, resolutionResult: adminBridgesRR }
    // Risk Bands / Risk Factors / Asset Class Strategy now live in the BMS Administration app
    // (side-nav), so their standalone launchpad inbounds were removed.
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
              },
              {
                id: 'bms.group.risk',
                title: 'REPORTS & ANALYTICS',
                isPreset: true, isVisible: riskNetworkTiles.length > 0, isGroupLocked: false,
                tiles: riskNetworkTiles
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
