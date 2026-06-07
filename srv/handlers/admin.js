const cds = require('@sap/cds')

module.exports = function registerAdminHandlers (srv, { logAudit }) {

    srv.after(['CREATE','UPDATE','DELETE'], 'Lookups', async (data, req) => {
        const db = await cds.connect.to('db')
        await logAudit(db, req, req.event, 'Lookup',
            data?.ID, `${data?.category}:${data?.code}`, data, `Lookup ${req.event.toLowerCase()}d`)
    })

    srv.after(['CREATE','UPDATE','DELETE'], 'AttributeDefinitions', async (data, req) => {
        const db = await cds.connect.to('db')
        await logAudit(db, req, req.event, 'AttributeDefinition',
            data?.ID, data?.name, data, `AttributeDefinition ${req.event.toLowerCase()}d`)
    })

    srv.on('saveRoleConfig', async req => {
        const { configs } = req.data
        if (!configs?.length) return req.error(400, 'configs array is required')
        const db = await cds.connect.to('db')
        let saved = 0
        for (const roleConfig of configs) {
            const configId = `rc-${roleConfig.role}-${roleConfig.featureKey}`
            const existingConfig = await db.run(SELECT.one.from('nhvr.RoleConfig').where({ ID: configId }))
            const configEntry = { ID: configId, ...roleConfig }
            if (existingConfig) await db.run(UPDATE('nhvr.RoleConfig').set(configEntry).where({ ID: configId }))
            else                await db.run(INSERT.into('nhvr.RoleConfig').entries(configEntry))
            saved++
        }
        await logAudit(db, req, 'ACTION', 'RoleConfig', null, 'bulk', configs, `${saved} role configs saved`)
        return { saved }
    })
}
