const cds = require('@sap/cds')
const LOG = cds.log('bms-mass-edit')

const { deriveCondition } = require('../lib/condition-rating')
const { writeChangeLogs, diffRecords } = require('../audit-log')

const EDITABLE_GRID_FIELDS = ['condition', 'conditionRating', 'postingStatus', 'loadRating',
                               'hmlApproved', 'bDoubleApproved', 'freightRoute']

module.exports = function registerMassEditHandlers (srv, { logAudit, validateEnum }) {

    srv.on('massEditBridges', async req => {
        const { rows } = req.data
        if (!rows?.length) return req.error(400, 'rows array is required')
        const db = await cds.connect.to('db')
        const batchId = cds.utils.uuid()   // OPS-R2: group this mass-edit's audit entries
        let updated = 0, failed = 0
        const errors = []

        for (const [rowIndex, row] of rows.entries()) {
            try {
                if (!row.ID) { failed++; errors.push(`Row ${rowIndex + 1}: ID required`); continue }
                const currentBridge = await db.run(
                    SELECT.one.from('bridge.management.Bridges').where({ ID: row.ID })
                )
                if (!currentBridge) {
                    failed++; errors.push(`Row ${rowIndex + 1}: Bridge ${row.ID} not found`); continue
                }
                const patch = {}
                EDITABLE_GRID_FIELDS.forEach(fieldName => {
                    if (row[fieldName] !== undefined) patch[fieldName] = row[fieldName]
                })
                if (patch.conditionRating !== undefined) {
                    const derived = deriveCondition(patch.conditionRating)
                    if (!derived) {
                        failed++; errors.push(`Row ${rowIndex + 1}: conditionRating must be 1-10`); continue
                    }
                    patch.condition = derived.condition
                    patch.highPriorityAsset = derived.highPriorityAsset
                }
                await db.run(UPDATE('bridge.management.Bridges').set(patch).where({ ID: row.ID }))
                // OPS-R2: durable audit (rule-3) — diff'd, source-tagged, and fail-fast
                // (writeChangeLogs throws for the MassEdit bulk source, failing the row).
                await writeChangeLogs(db, {
                    objectType: 'Bridge', objectId: row.ID, objectName: currentBridge.bridgeName,
                    source: 'MassEdit', batchId, changedBy: req.user?.id,
                    changes: diffRecords(currentBridge, { ...currentBridge, ...patch })
                })
                updated++
            } catch (rowError) { failed++; errors.push(`Row ${rowIndex + 1}: ${rowError.message}`) }
        }
        return { updated, failed, errors: errors.join('\n') }
    })
}
