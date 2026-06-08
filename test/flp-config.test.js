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
    // Config screens moved to BMS Admin — no standalone tiles/inbounds left dangling.
    expect(tileIds).not.toContain('RiskBands')
    expect(tileIds).not.toContain('RiskFactors')
    expect(tileIds).not.toContain('AssetStrategy')
    expect(inbounds['RiskBands-manage']).toBeUndefined()
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

  // Council gap #2: the served fiori-apps.html carries an inline tileConfig fallback. It MUST
  // equal the authoritative fioriSandboxConfig.json so the launchpad can never silently diverge.
  test('fiori-apps.html inline tileConfig is byte-equal to the authoritative fioriSandboxConfig.json', () => {
    const html = fs.readFileSync(path.join(root, 'app/router/fiori-apps.html'), 'utf8')
    const m = html.match(/var tileConfig = (\{[\s\S]*?\});\s*\n\s*window\['sap-ushell-config'\]/)
    expect(m).toBeTruthy()
    const inline = JSON.stringify(JSON.parse(m[1]))
    const served = JSON.stringify(JSON.parse(fs.readFileSync(b, 'utf8')))
    expect(inline).toBe(served)
  })
})
