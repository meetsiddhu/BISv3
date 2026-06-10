const cds = require('@sap/cds')
const { DEFAULT_DIRECTION } = require('../lib/restriction-codelists')

const deriveTemporaryFlag = (req) => {
    if (req.data.restrictionCategory) {
        req.data.temporary = req.data.restrictionCategory === 'Temporary'
    }
}

module.exports = function registerRestrictionHandlers (srv, { updateBridgePostingStatus, logRestrictionChange }) {

    srv.before(['CREATE', 'UPDATE'], 'Restrictions', deriveTemporaryFlag)

    srv.before('UPDATE', 'Restrictions', async req => {
        const { ID } = req.params[0]
        await SELECT.one.from('bridge.management.Restrictions').where({ ID }).forUpdate({ wait: 5 })
    })

    srv.before('CREATE', 'Restrictions', async req => {
        if (!req.data.restrictionStatus) req.data.restrictionStatus = 'Active'
        // Default aligned to the RestrictionDirections codelist ('Both' was not a code).
        if (!req.data.direction)          req.data.direction = DEFAULT_DIRECTION
        if (req.data.bridge_ID) {
            const db = await cds.connect.to('db')
            const bridge = await db.run(SELECT.one.from('bridge.management.Bridges').where({ ID: req.data.bridge_ID }))
            if (bridge) req.data.bridgeRef = bridge.bridgeId
        }
    })

    srv.after('CREATE', 'Restrictions', async (data, req) => {
        if (data?.bridge_ID) {
            const db = await cds.connect.to('db')
            await updateBridgePostingStatus(data.bridge_ID, db, req)
            await logRestrictionChange(db, data.ID, req.user?.id || 'system',
                'CREATED', null, data.restrictionStatus, 'Restriction created')
        }
    })

    srv.on('disableRestriction', 'Restrictions', async req => {
        const { ID } = req.params[0]
        const { reason } = req.data
        const db = await cds.connect.to('db')
        const restriction = await db.run(SELECT.one.from('bridge.management.Restrictions').where({ ID }))
        if (!restriction) return req.error(404, 'Restriction not found')
        const previousStatus = restriction.restrictionStatus
        await db.run(UPDATE('bridge.management.Restrictions').set({
            restrictionStatus: 'Inactive',
            active:            false,
            temporaryReason:   reason
        }).where({ ID }))
        if (restriction.bridge_ID) await updateBridgePostingStatus(restriction.bridge_ID, db, req)
        await logRestrictionChange(db, ID, req.user?.id || 'system', 'DISABLED', previousStatus, 'Inactive', reason)
        return { status: 'Inactive', message: 'Restriction disabled' }
    })

    srv.on('enableRestriction', 'Restrictions', async req => {
        const { ID } = req.params[0]
        const { reason } = req.data
        const db = await cds.connect.to('db')
        const restriction = await db.run(SELECT.one.from('bridge.management.Restrictions').where({ ID }))
        if (!restriction) return req.error(404, 'Restriction not found')
        const previousStatus = restriction.restrictionStatus
        await db.run(UPDATE('bridge.management.Restrictions').set({
            restrictionStatus: 'Active',
            active:            true,
            temporaryReason:   null
        }).where({ ID }))
        if (restriction.bridge_ID) await updateBridgePostingStatus(restriction.bridge_ID, db, req)
        await logRestrictionChange(db, ID, req.user?.id || 'system', 'ENABLED', previousStatus, 'Active', reason)
        return { status: 'Active', message: 'Restriction enabled' }
    })

    srv.on('createTemporaryRestriction', 'Restrictions', async req => {
        const { ID } = req.params[0]
        const { fromDate, toDate, reason } = req.data
        const db = await cds.connect.to('db')
        const restriction = await db.run(SELECT.one.from('bridge.management.Restrictions').where({ ID }))
        if (!restriction) return req.error(404, 'Restriction not found')
        await db.run(UPDATE('bridge.management.Restrictions').set({
            restrictionCategory: 'Temporary',
            temporary:           true,
            temporaryFrom:       fromDate,
            temporaryTo:         toDate,
            temporaryReason:     reason,
            restrictionStatus:   'Active',
            active:              true
        }).where({ ID }))
        await logRestrictionChange(db, ID, req.user?.id || 'system',
            'TEMP_APPLIED', null, 'Active', reason)
        return { status: 'Active', message: 'Temporary restriction created', ID }
    })
}
