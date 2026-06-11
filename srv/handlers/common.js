const cds = require('@sap/cds')
const LOG  = cds.log('bms-common')
const { derivePostingStatus } = require('../lib/restriction-codelists')

module.exports = function registerCommonHelpers (_srv) {

    const getBridge = async (bridgeID, db) =>
        db.run(SELECT.one.from('bridge.management.Bridges').where({ ID: bridgeID }))

    const getBridgeByKey = async (bridgeId, db) =>
        db.run(SELECT.one.from('bridge.management.Bridges').where({ bridgeId }))

    const getRestriction = async (restrictionID, db) =>
        db.run(SELECT.one.from('bridge.management.Restrictions').where({ ID: restrictionID }))

    const logAudit = async (db, req, action, entityType, entityId, entityName, changes, description) => {
        try {
            await (db || await cds.connect.to('db')).run(
                INSERT.into('bridge.management.ChangeLog').entries({
                    ID:           cds.utils.uuid(),
                    changedAt:    new Date().toISOString(),
                    changedBy:    req?.user?.id || 'system',
                    objectType:   entityType,
                    objectId:     String(entityId),
                    objectName:   entityName || String(entityId),
                    fieldName:    action,
                    oldValue:     null,
                    newValue:     description || (typeof changes === 'object' ? JSON.stringify(changes) : changes),
                    changeSource: 'OData',
                    batchId:      null
                })
            )
        } catch (error) {
            LOG.warn('Audit log failed', error.message)
        }
    }

    const updateBridgePostingStatus = async (bridgeID, db, _req) => {
        // R6 UNIFICATION: postingStatus derives from the UnifiedRestrictions
        // UNION view, i.e. from BOTH masters — a closure recorded on the Bridges
        // register tab (BridgeRestrictions) closes the bridge exactly like one
        // recorded in the Restrictions app (Restrictions).
        const activeRestrictions = await db.run(
            SELECT.from('bridge.management.UnifiedRestrictions')
                  .where({ bridge_ID: bridgeID, restrictionStatus: 'Active', active: true })
        )
        // Closure derivation is config-driven via the canonical type catalogue
        // (recognises the seeded closure types + the legacy 'CLOSURE' code, which
        // previously was the ONLY recognised code and never existed in the seeds).
        const updatedPostingStatus = derivePostingStatus(activeRestrictions)
        await db.run(UPDATE('bridge.management.Bridges').set({ postingStatus: updatedPostingStatus }).where({ ID: bridgeID }))
    }

    const validateEnum = (value, allowedValues, fieldName, req) => {
        if (value && !allowedValues.includes(value))
            return req.error(400, `Invalid ${fieldName}: ${value}. Allowed: ${allowedValues.join(', ')}`)
    }

    const logRestrictionChange = async (db, restrictionID, changedBy, changeType, oldStatus, newStatus, reason) => {
        try {
            await db.run(INSERT.into('bridge.management.ChangeLog').entries({
                ID:           cds.utils.uuid(),
                changedAt:    new Date().toISOString(),
                changedBy:    changedBy || 'system',
                objectType:   'Restriction',
                objectId:     String(restrictionID),
                objectName:   restrictionID,
                fieldName:    changeType,
                oldValue:     oldStatus || null,
                newValue:     newStatus || null,
                changeSource: 'OData',
                batchId:      reason || null
            }))
        } catch (error) {
            LOG.warn('Restriction change log failed', error.message)
        }
    }

    return { getBridge, getBridgeByKey, getRestriction, logAudit,
             updateBridgePostingStatus, validateEnum, logRestrictionChange }
}
