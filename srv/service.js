const cds = require('@sap/cds')

const registerCommonHelpers   = require('./handlers/common')
const registerDashboardHandlers = require('./handlers/dashboard')
const registerBridgeHandlers  = require('./handlers/bridges')
const registerRestrictionHandlers = require('./handlers/restrictions')
const registerUploadHandlers  = require('./handlers/upload')
const registerAdminHandlers   = require('./handlers/admin')
const registerMassEditHandlers = require('./handlers/mass-edit')

module.exports = class BridgeManagementService extends cds.ApplicationService { init() {

    const helpers = registerCommonHelpers(this)

    registerDashboardHandlers(this, helpers)
    registerBridgeHandlers(this, helpers)
    registerRestrictionHandlers(this, helpers)
    registerUploadHandlers(this, helpers)
    registerAdminHandlers(this, helpers)
    registerMassEditHandlers(this, helpers)

    // Map View — inline (no external state needed)
    this.on('geocodeAddress',  req => ({ latitude: null, longitude: null, formattedAddress: req.data.address }))
    this.on('reverseGeocode',  () => ({ address: '', suburb: '', state: '', postcode: '' }))
    this.on('getMapApiConfig', () => ({ provider: 'OSM', apiKey: '', defaultZoom: 6 }))

    return super.init()
}}
