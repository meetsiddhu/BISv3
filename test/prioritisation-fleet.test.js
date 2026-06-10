const cds = require('@sap/cds')
const { SELECT, INSERT, DELETE } = cds.ql

// Council B1/B2 — END-TO-END integration coverage for scoreFleet (the action previously crashed
// on its first statement with "num is not defined" and had ZERO tests). This suite CALLS the
// action through the service layer and asserts:
//   B1: it runs, and immutable RANKED runs exist for the fleet run id.
//   B2: soft-deleted (status='Inactive') bridges are excluded, NULL-status bridges are included,
//       pre-filtered bridges are excluded WITH a rationale code, ranking is deterministic
//       (score DESC, bridge ID ASC tiebreak, contiguous ranks from 1), re-runs supersede the
//       prior fleet runs with the audit linkage intact, truncation is flagged loudly, and the
//       whole thing is scope-gated (manage/admin only).
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const asManager = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'mgr', roles: ['view', 'manage'] }) }, fn))
const asViewer = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'vwr', roles: ['view'] }) }, fn))

const RUNS = 'bridge.management.PrioritisationAssessment'
// assetClass 'Road Bridge' resolves to the seeded NSW-PACK-V1 (WeightedSumWithRules) — the
// data-only model scoreFleet scores. conditionRating drives the BHI criterion bands
// (1-2→95 … 9-10→5), so worse condition ⇒ higher score ⇒ better (lower) rank.
const bridge = (id, over = {}) => Object.assign({
  ID: id, bridgeId: 'BRG-FLEET-' + id, bridgeName: 'Fleet Test Bridge ' + id,
  assetClass: 'Road Bridge', transportMode: 'Road', status: 'Active',
  conditionRating: 5, structuralAdequacyRating: 5, lastInspectionDate: '2026-01-01'
}, over)

const B_CRITICAL = 990301 // conditionRating 2  → highest score → fleetRank 1
const B_POOR = 990302     // conditionRating 4
const B_GOOD = 990303     // conditionRating 9  → lowest score
const B_NULLSTATUS = 990304 // status NULL (mass-upload path) → still ACTIVE, must be scored
const B_INACTIVE = 990305 // soft-deleted → must NEVER be scored
const B_FAUNA = 990306    // matches seeded pre-filter PF_FAUNA → excluded with rationale

describe('PrioritisationService.scoreFleet (fleet batch ranking)', () => {
  beforeAll(async () => {
    const db = await cds.connect.to('db')
    // Force a TINY page so every test exercises the real multi-page scan (ORDER BY ID paging,
    // per-page set-based child reads, chunked batch inserts) — not a single-page shortcut.
    // Config-driven knob (zero hardcoding), set BEFORE the first read so the 60s cache holds it.
    await db.run(INSERT.into('bridge.management.SystemConfig').entries({
      configKey: 'fleetScorePageSize', category: 'Prioritisation', label: 'Fleet scoring page size',
      value: '2', dataType: 'integer', description: 'Test: force multi-page fleet scoring scans'
    }))
    await db.run(INSERT.into('bridge.management.Bridges').entries([
      bridge(B_CRITICAL, { conditionRating: 2 }),
      bridge(B_POOR, { conditionRating: 4 }),
      bridge(B_GOOD, { conditionRating: 9 }),
      bridge(B_NULLSTATUS, { conditionRating: 6, status: null }),
      bridge(B_INACTIVE, { conditionRating: 1, status: 'Inactive' }),
      bridge(B_FAUNA, { conditionRating: 1, structureType: 'Fauna Crossing' })
    ]))
  })
  beforeEach(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from(RUNS))
  })

  test('B1 end-to-end: scoreFleet RUNS (no "num is not defined") and ranked runs exist', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    expect(res.fleetRunId).toBeTruthy()
    expect(res.scored).toBe(4) // critical, poor, good, null-status — not the inactive/fauna ones
    const db = await cds.connect.to('db')
    const runs = await db.run(SELECT.from(RUNS).where({ fleetRunId: res.fleetRunId }).orderBy('fleetRank'))
    expect(runs.length).toBe(res.scored)
    // contiguous ranks from 1, every run active + stamped with the shared fleetRunId
    runs.forEach((r, i) => {
      expect(r.fleetRank).toBe(i + 1)
      expect(r.active).toBe(true)
      expect(r.fleetRunId).toBe(res.fleetRunId)
      expect(r.priorityScore).not.toBeNull()
      expect(r.band).toBeTruthy()
      expect(r.modelCode).toBeTruthy() // data-only model identity stamped
    })
    // ranked = ordered: score never increases as rank worsens
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].priorityScore).toBeLessThanOrEqual(runs[i - 1].priorityScore)
    }
    // worst condition ranks first; best condition ranks last
    expect(runs[0].bridge_ID).toBe(B_CRITICAL)
    expect(runs[runs.length - 1].bridge_ID).toBe(B_GOOD)
  })

  test('B2: soft-deleted bridges are excluded; NULL-status bridges are included', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const inactiveRuns = await db.run(SELECT.from(RUNS).where({ bridge_ID: B_INACTIVE }))
    expect(inactiveRuns.length).toBe(0) // status='Inactive' never enters the fleet rank
    const nullRuns = await db.run(SELECT.from(RUNS).where({ bridge_ID: B_NULLSTATUS, fleetRunId: res.fleetRunId }))
    expect(nullRuns.length).toBe(1) // NULL status (mass upload) is a live asset
  })

  test('B2: pre-filtered bridges are excluded WITH the matching rationale code', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    expect(res.excluded).toBeGreaterThanOrEqual(1)
    const detail = JSON.parse(res.excludedDetail)
    const fauna = detail.find((d) => d.bridge === 'BRG-FLEET-' + B_FAUNA)
    expect(fauna).toBeTruthy()
    expect(fauna.code).toBe('PF_FAUNA') // seeded TfNSW pre-filter, surfaced not silent
    const db = await cds.connect.to('db')
    const faunaRuns = await db.run(SELECT.from(RUNS).where({ bridge_ID: B_FAUNA }))
    expect(faunaRuns.length).toBe(0)
  })

  test('B2: ranking is DETERMINISTIC — two runs over the same fleet produce identical ranks', async () => {
    const r1 = await asManager((tx) => tx.send('scoreFleet', {}))
    const r2 = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const runs1 = await db.run(SELECT.from(RUNS).where({ fleetRunId: r1.fleetRunId }).orderBy('fleetRank'))
    const runs2 = await db.run(SELECT.from(RUNS).where({ fleetRunId: r2.fleetRunId }).orderBy('fleetRank'))
    expect(runs2.map((r) => r.bridge_ID)).toEqual(runs1.map((r) => r.bridge_ID))
    expect(runs2.map((r) => r.priorityScore)).toEqual(runs1.map((r) => r.priorityScore))
  })

  test('B2: a re-run SUPERSEDES the prior fleet runs (active=false + supersededBy audit linkage)', async () => {
    const r1 = await asManager((tx) => tx.send('scoreFleet', {}))
    const r2 = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const old = await db.run(SELECT.from(RUNS).where({ fleetRunId: r1.fleetRunId }))
    expect(old.length).toBe(r1.scored) // immutable: prior runs kept, never deleted
    for (const o of old) {
      expect(o.active).toBe(false)
      expect(o.supersededBy_ID).toBeTruthy()
      const successor = await db.run(SELECT.one.from(RUNS).where({ ID: o.supersededBy_ID }))
      expect(successor.fleetRunId).toBe(r2.fleetRunId) // linked to its replacement in run 2
      expect(successor.bridge_ID).toBe(o.bridge_ID)
    }
    // exactly ONE active run per scored bridge after the re-run (no double-counting)
    const active = await db.run(SELECT.from(RUNS).where({ active: true }))
    expect(active.length).toBe(r2.scored)
  })

  test('B2: truncation is LOUD — capped run reports truncated=true + the real fleet total', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', { limit: 2 }))
    expect(res.truncated).toBe(true)
    expect(res.fleetTotal).toBe(5) // 6 seeded minus the Inactive one
    expect(res.scored).toBeLessThanOrEqual(2)
    // the truncation is also on the audit trail
    const db = await cds.connect.to('db')
    const logs = await db.run(SELECT.from('bridge.management.ChangeLog')
      .where({ objectType: 'PrioritisationFleetRun', objectId: res.fleetRunId }))
    expect(logs.some((l) => l.fieldName === 'truncated' && l.newValue === 'true')).toBe(true)
    // and an UNCAPPED run is NOT flagged
    const full = await asManager((tx) => tx.send('scoreFleet', {}))
    expect(full.truncated).toBe(false)
    expect(full.fleetTotal).toBe(5)
  })

  test('scoreFleet writes a fleet-run ChangeLog (rule 3: ChangeLog on every CUD)', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const logs = await db.run(SELECT.from('bridge.management.ChangeLog')
      .where({ objectType: 'PrioritisationFleetRun', objectId: res.fleetRunId }))
    expect(logs.length).toBeGreaterThan(0)
    expect(logs.some((l) => l.fieldName === 'scored' && Number(l.newValue) === res.scored)).toBe(true)
  })

  test('a view-only user cannot run fleet scoring (scope-gated: manage/admin)', async () => {
    await expect(asViewer((tx) => tx.send('scoreFleet', {}))).rejects.toThrow()
  })
})
