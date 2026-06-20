const cds = require('@sap/cds')
const { derivePostingStatus } = require('../lib/restriction-codelists')
const { auditChange } = require('../lib/plugins/changelog')

module.exports = function registerCommonHelpers (_srv) {

    const getBridge = async (bridgeID, db) =>
        db.run(SELECT.one.from('bridge.management.Bridges').where({ ID: bridgeID }))

    const getBridgeByKey = async (bridgeId, db) =>
        db.run(SELECT.one.from('bridge.management.Bridges').where({ bridgeId }))

    const getRestriction = async (restrictionID, db) =>
        db.run(SELECT.one.from('bridge.management.Restrictions').where({ ID: restrictionID }))

    // Delegates to the reusable changelog plugin (action form). Behaviour preserved:
    // single summary row, source 'OData', tolerates write failure for interactive edits.
    const logAudit = async (db, req, action, entityType, entityId, entityName, changes, description) => {
        const conn = db || await cds.connect.to('db')
        return auditChange(conn, {
            objectType: entityType, objectId: entityId, objectName: entityName,
            source: 'OData', changedBy: req?.user?.id,
            action, description: description || (typeof changes === 'object' ? JSON.stringify(changes) : changes)
        })
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

    // Delegates to the reusable changelog plugin (structured form, one field row).
    const logRestrictionChange = async (db, restrictionID, changedBy, changeType, oldStatus, newStatus, reason) =>
        auditChange(db, {
            objectType: 'Restriction', objectId: restrictionID, objectName: restrictionID,
            source: 'OData', changedBy, batchId: reason || null,
            changes: [{ fieldName: changeType, oldValue: oldStatus || null, newValue: newStatus || null }]
        })

    return { getBridge, getBridgeByKey, getRestriction, logAudit,
             updateBridgePostingStatus, validateEnum, logRestrictionChange }
}
