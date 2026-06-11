const cds = require('@sap/cds')

module.exports = function registerDashboardHandlers (srv) {

    srv.on('getNetworkKPIs', async () => {
        const db = await cds.connect.to('db')
        // R6 UNIFICATION: KPI counts read the UnifiedRestrictions UNION view, so
        // restrictions maintained in EITHER master (Restrictions app or the
        // Bridges-register BridgeRestrictions tab) are counted — previously this
        // read bridge.management.Restrictions only and disagreed with the
        // Restrictions Dashboard ALP by construction.
        const [bridges, activeRestrictions] = await Promise.all([
            db.run(SELECT.from('bridge.management.Bridges')),
            db.run(SELECT.from('bridge.management.UnifiedRestrictions').where({ restrictionStatus: 'Active', active: true }))
        ])
        return {
            totalBridges:       bridges.length,
            restrictedBridges:  bridges.filter(bridge => bridge.postingStatus === 'RESTRICTED').length,
            closedBridges:      bridges.filter(bridge => bridge.postingStatus === 'CLOSED').length,
            criticalCondition:  bridges.filter(bridge => bridge.condition === 'CRITICAL').length,
            highPriority:       bridges.filter(bridge => bridge.highPriorityAsset).length,
            activeRestrictions: activeRestrictions.length
        }
    })

    srv.on('getConditionDistribution', async req => {
        const { state, region } = req.data
        const db = await cds.connect.to('db')
        const filterCriteria = {}
        if (state)  filterCriteria.state  = state
        if (region) filterCriteria.region = region
        const bridges = await db.run(SELECT.from('bridge.management.Bridges').where(filterCriteria))
        const conditionDistribution = {}
        bridges.forEach(bridge => {
            conditionDistribution[bridge.condition] = (conditionDistribution[bridge.condition] || 0) + 1
        })
        return Object.entries(conditionDistribution).map(([condition, count]) => ({ condition, count }))
    })

    srv.on('getRestrictionSummary', async () => {
        const db = await cds.connect.to('db')
        // R6: per-type summary over BOTH masters (UnifiedRestrictions union view).
        const activeRestrictions = await db.run(
            SELECT.from('bridge.management.UnifiedRestrictions').where({ restrictionStatus: 'Active', active: true })
        )
        const restrictionTypeSummary = {}
        activeRestrictions.forEach(restriction => {
            restrictionTypeSummary[restriction.restrictionType] = (restrictionTypeSummary[restriction.restrictionType] || 0) + 1
        })
        return Object.entries(restrictionTypeSummary).map(([restrictionType, count]) => ({ restrictionType, count }))
    })

    srv.on('me', req => ({
        id:    req.user?.id    || 'anonymous',
        name:  req.user?.name  || 'Anonymous',
        roles: (req.user?.roles || []).join(', ')
    }))
}
