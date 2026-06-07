const cds = require('@sap/cds')
const { CONDITION_LABELS, deriveCondition, labelToTfNSW, labelToLegacy } = require('../lib/condition-rating')

function registerBridgeHandlers (srv, { logAudit }) {

    srv.before(['CREATE', 'UPDATE'], 'Bridges', async req => {
        const data = req.data
        if (data.conditionRating !== undefined) {
            const derived = deriveCondition(data.conditionRating)
            if (!derived) return req.error(400, 'conditionRating must be 1–10')
            data.condition         = derived.condition
            data.highPriorityAsset = derived.highPriorityAsset
        }
        if (typeof data.bridgeId   === 'string') data.bridgeId   = data.bridgeId.trim()
        if (typeof data.bridgeName === 'string') data.bridgeName = data.bridgeName.trim()
    })

    srv.before('UPDATE', 'Bridges', async req => {
        const { ID } = req.params[0]
        await SELECT.one.from('bridge.management.Bridges').where({ ID }).forUpdate({ wait: 5 })
    })

    srv.on('changeCondition', 'Bridges', async req => {
        const { conditionValue, score } = req.data
        const { ID } = req.params[0]
        // ARCH-R2: validate the label.
        if (labelToTfNSW(conditionValue) == null) {
            return req.error(400, 'conditionValue must be one of: ' + Object.values(CONDITION_LABELS).join(', '))
        }
        // ARCH-R1: a supplied legacy score (1-10) wins; otherwise synthesise the legacy
        // rating in the CORRECT direction (Good->10, Critical->2) — the old `key*2`
        // inverted it (Good->2 = Critical).
        const conditionRating = (Number(score) >= 1 && Number(score) <= 10) ? Number(score) : labelToLegacy(conditionValue)
        await UPDATE('bridge.management.Bridges').set({
            condition:         conditionValue,
            conditionRating,
            highPriorityAsset: ['Critical', 'Very Poor'].includes(conditionValue)
        }).where({ ID })
        const bridge = await SELECT.one.from('bridge.management.Bridges').where({ ID })
        await logAudit(null, req, 'ACTION', 'Bridge', ID, bridge?.bridgeName,
            { conditionValue, conditionRating }, 'Condition changed')
        return { ID, bridgeId: bridge?.bridgeId, bridgeName: bridge?.bridgeName, condition: bridge?.condition }
    })

    srv.on('closeForTraffic', 'Bridges', async req => {
        const { ID } = req.params[0]
        await UPDATE('bridge.management.Bridges').set({ postingStatus: 'CLOSED', status: 'Closed' }).where({ ID })
        const bridge = await SELECT.one.from('bridge.management.Bridges').where({ ID })
        await logAudit(null, req, 'ACTION', 'Bridge', ID, bridge?.bridgeName, {}, 'Closed for traffic')
        return { ID, bridgeId: bridge?.bridgeId, bridgeName: bridge?.bridgeName, postingStatus: 'CLOSED' }
    })

    srv.on('reopenForTraffic', 'Bridges', async req => {
        const { ID } = req.params[0]
        await UPDATE('bridge.management.Bridges').set({ postingStatus: 'UNRESTRICTED', status: 'Active' }).where({ ID })
        const bridge = await SELECT.one.from('bridge.management.Bridges').where({ ID })
        await logAudit(null, req, 'ACTION', 'Bridge', ID, bridge?.bridgeName, {}, 'Reopened for traffic')
        return { ID, bridgeId: bridge?.bridgeId, bridgeName: bridge?.bridgeName, postingStatus: 'UNRESTRICTED' }
    })

    srv.on('addRestriction', 'Bridges', async req => {
        const { ID } = req.params[0]
        const bridge = await SELECT.one.from('bridge.management.Bridges').where({ ID })
        if (!bridge) return req.error(404, 'Bridge not found')
        const { restrictionType, restrictionValue, restrictionUnit, effectiveFrom, effectiveTo,
                restrictionStatus, permitRequired, direction, remarks } = req.data
        const newRestrictionID = cds.utils.uuid()
        await INSERT.into('bridge.management.Restrictions').entries({
            ID:                newRestrictionID,
            bridge_ID:         ID,
            bridgeRef:         bridge.bridgeId,
            restrictionType,
            restrictionValue,
            restrictionUnit,
            effectiveFrom,
            effectiveTo,
            restrictionStatus: restrictionStatus || 'Active',
            permitRequired,
            direction,
            remarks,
            active:            true
        })
        return { status: 'CREATED', message: 'Restriction added', ID: newRestrictionID }
    })
}

module.exports = registerBridgeHandlers
