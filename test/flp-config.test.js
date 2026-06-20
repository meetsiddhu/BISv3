const fs = require('fs')
const path = require('path')

// PRE-MORTEM MUST-FIX 9: the FLP sandbox config is served from app/router/appconfig in prod,
// but app/appconfig is the editable source. They must stay byte-identical, or the deployed
// launchpad silently diverges from source (the "stale artifact in the mtar" class of bug).
describe('FLP sandbox config consistency', () => {
  const root = path.join(__dirname, '..')
  const a = path.join(root, 'app/appconfig/fioriSandboxConfig.json')
  const b = path.join(root, 'app/router/appconfig/fioriSandboxConfig.json')

  test('both fioriSandboxConfig.json copies are byte-identical', () => {
    expect(fs.readFileSync(a, 'utf8')).toBe(fs.readFileSync(b, 'utf8'))
  })

  test('served config exposes the Network Portfolio tile + a valid inbound, and no dead config tiles', () => {
    const c = JSON.parse(fs.readFileSync(b, 'utf8'))
    const groups = c.services.LaunchPage.adapter.config.groups
    const tileIds = groups.flatMap(g => (g.tiles || []).map(t => t.id))
    const inbounds = c.services.ClientSideTargetResolution.adapter.config.inbounds
    expect(tileIds).toContain('NetworkPortfolio')
    expect(inbounds['NetworkPortfolio-display']).toBeTruthy()
    // FE config screens (RiskBand/RiskConfig/AssetClassStrategy/SystemConfig) are now exposed
    // as annotation-based Fiori Elements List Reports via UAT tiles in the CONFIGURATION group.
    // Each tile deep-links into the admin-bridges FE app via #<SO>-manage&/<inner route>.
    expect(tileIds).toContain('CfgRiskBands')
    expect(tileIds).toContain('CfgRiskFactors')
    expect(tileIds).toContain('CfgAssetStrategy')
    expect(tileIds).toContain('CfgSystemSettings')
    expect(inbounds['RiskBands-manage']).toBeTruthy()
    expect(inbounds['RiskBands-manage'].resolutionResult.additionalInformation).toMatch(/BridgeManagement\.adminbridges/)
    expect(inbounds['RiskFactors-manage']).toBeTruthy()
    expect(inbounds['AssetClassStrategyCfg-manage']).toBeTruthy()
    expect(inbounds['SystemSettings-manage']).toBeTruthy()
    // NetworkRestrictions inbound kept for deep-links even though its tile was dropped.
    expect(tileIds).not.toContain('NetworkRestrictions')
    expect(inbounds['NetworkRestrictions-manage']).toBeTruthy()
  })

  test('Bridge Prioritisation tile + inbound present, gold Restrictions tile untouched', () => {
    const c = JSON.parse(fs.readFileSync(b, 'utf8'))
    const groups = c.services.LaunchPage.adapter.config.groups
    const tileIds = groups.flatMap(g => (g.tiles || []).map(t => t.id))
    const inbounds = c.services.ClientSideTargetResolution.adapter.config.inbounds
    expect(tileIds).toContain('Prioritisation')
    expect(inbounds['Prioritisation-display']).toBeTruthy()
    expect(inbounds['Prioritisation-display'].resolutionResult.additionalInformation).toMatch(/BridgeManagement\.prioritisation/)
    expect(tileIds).toContain('Restrictions') // gold tile untouched
  })

  // The role-aware launchpad builder (srv/launchpad.js, served at /launchpad/config) is the
  // future Work-Zone source. It is NOT yet the deployed launchpad (the inline JSON is), but its
  // role-filter logic must be correct so Work Zone can adopt it, and it must not lose the core
  // operational tiles. These tests guard both (unit-level; no runtime/bootstrap change).
  describe('role-aware launchpad builder (deferred to Work Zone)', () => {
    const { buildSandboxConfig } = require('../srv/launchpad')
    const CORE_INBOUNDS = ['Bridges-manage', 'Restrictions-manage', 'Map-display', 'Prioritisation-display', 'Dashboard-display', 'MassUpload-display', 'MassEdit-manage']
    const ADMIN_INBOUNDS = ['BmsAdmin-manage', 'AttributeClasses-manage', 'EAMMapping-manage']

    test('admin config exposes core + admin tiles', () => {
      const cfg = buildSandboxConfig(true)
      const inbounds = cfg.services.ClientSideTargetResolution.adapter.config.inbounds
      CORE_INBOUNDS.forEach(i => expect(inbounds[i]).toBeTruthy())
      ADMIN_INBOUNDS.forEach(i => expect(inbounds[i]).toBeTruthy())
    })

    test('viewer config keeps core tiles but hides admin tiles (role filter)', () => {
      const cfg = buildSandboxConfig(false)
      const inbounds = cfg.services.ClientSideTargetResolution.adapter.config.inbounds
      const tileIds = cfg.services.LaunchPage.adapter.config.groups.flatMap(g => (g.tiles || []).map(t => t.id))
      CORE_INBOUNDS.forEach(i => expect(inbounds[i]).toBeTruthy())
      ADMIN_INBOUNDS.forEach(i => expect(inbounds[i]).toBeUndefined())
      expect(tileIds).not.toContain('BmsAdmin')
      expect(tileIds).not.toContain('AttributeClasses')
    })
  })

  // Council gap #2: the served fiori-apps.html carries an inline tileConfig fallback. It MUST
  // equal the authoritative fioriSandboxConfig.json so the launchpad can never silently diverge.
  test('fiori-apps.html inline tileConfig matches the authoritative fioriSandboxConfig.json (order + content)', () => {
    const html = fs.readFileSync(path.join(root, 'app/router/fiori-apps.html'), 'utf8')
    const m = html.match(/var tileConfig = (\{[\s\S]*?\});\s*\n\s*window\['sap-ushell-config'\]/)
    expect(m).toBeTruthy()
    const inlineObj = JSON.parse(m[1])
    const servedObj = JSON.parse(fs.readFileSync(b, 'utf8'))
    // (a) serialized equality catches key-ORDER drift (insertion order is preserved by parse->stringify)
    expect(JSON.stringify(inlineObj)).toBe(JSON.stringify(servedObj))
    // (b) canonical (recursively key-sorted) equality catches CONTENT drift regardless of order
    const canon = (v) => Array.isArray(v) ? v.map(canon)
      : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o }, {})
        : v
    expect(JSON.stringify(canon(inlineObj))).toBe(JSON.stringify(canon(servedObj)))
  })
})
