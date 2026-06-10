const cds = require('@sap/cds')
const { SELECT, INSERT, DELETE } = cds.ql

// Council B3+B4+B5+B6 — fleet-run GOVERNANCE coverage (the fleet batch previously: silently
// retired engineer-judgement runs, fabricated restrictionFlag/strategy, ranked score-only so a
// non-compensatory band raise was invisible in the rank, and stamped a mutable POINTER as its
// "reproducibility" snapshot). This suite asserts, through the service layer:
//   B3: fleet runs carry runType='fleet' and only ever supersede prior FLEET runs — an active
//       engineer (manual) run survives every fleet re-run; each supersession is ChangeLogged
//       PER RUN ID with the successor linkage.
//   B4: restrictionFlag comes from the loaded restriction context (never hardcoded false),
//       strategy stays NULL (no fabricated 'Maintain'), manual CREATEs are server-stamped
//       runType='manual' even when a client tries to masquerade as a fleet run.
//   B5: rank is band-severity-first (P1 ladder order), then score DESC within a band — a
//       SafetyFloor-raised bridge outranks a higher-scoring lower-band bridge.
//   B6: paramSnapshot is the RESOLVED model bundle (criteria+weights+bands+rules+userTypeWeights
//       +preFilters — a copy, not a pointer), exclusions are PERSISTED on the fleet ChangeLog,
//       and the weightSetHash basis covers user-type weights + the applied pre-filter set.
//   (f): the analytics Runs fact view exposes runType to every consumer.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const re = require('../srv/lib/prioritisation-rule-engine')

const asManager = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'mgr', roles: ['view', 'manage'] }) }, fn))
const asAnalytics = (fn) => cds.connect.to('PrioritisationAnalyticsService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'sac', roles: ['view'] }) }, fn))

const RUNS = 'bridge.management.PrioritisationAssessment'
const ASSESS = 'PrioritisationService.Assessments'

// assetClass 'Road Bridge' resolves to seeded NSW-PACK-V1 (WeightedSumWithRules).
// BHI bands: cond 1-2→95 (SafetyFloor P2 when ≥90), 3-4→75, 5-6→50, 7-8→25, 9-10→5.
// TRAFFIC bands (averageDailyTraffic): ≥20000→90, 5000-19999→65, 1000-4999→35, ≤999→10.
// IMPORTANCE bands (importanceLevel): 4→90, 3→65, 2→35, 1→10.
const bridge = (id, over = {}) => Object.assign({
  ID: id, bridgeId: 'BRG-GOV-' + id, bridgeName: 'Governance Test Bridge ' + id,
  assetClass: 'Road Bridge', transportMode: 'Road', status: 'Active',
  conditionRating: 5, structuralAdequacyRating: 5, lastInspectionDate: '2026-01-01'
}, over)

const G_MANUAL = 991401     // gets an engineer run FIRST — fleet must never retire it
const G_RESTRICTED = 991402 // carries an ACTIVE restriction — restrictionFlag must be true
const G_RULEFLOOR = 991403  // cond 2 → BHI 95 fires SafetyFloor → P2 band on a LOW score
const G_HIGHSCORE = 991404  // higher weighted score but NO rule fires → P3/P4 band
const G_FAUNA = 991405      // pre-filtered (PF_FAUNA) — exclusion must be PERSISTED

describe('Fleet-run governance (council B3+B4+B5+B6)', () => {
  beforeAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(INSERT.into('bridge.management.Bridges').entries([
      bridge(G_MANUAL, { conditionRating: 4 }),
      bridge(G_RESTRICTED, { conditionRating: 5 }),
      // G_RULEFLOOR: BHI 95 (fires SafetyFloor ≥90 → P2) but every other resolvable criterion is
      // LOW (traffic 10, importance 10, material 'Concrete' 30) → weighted score ≈ 53·conf.
      // G_HIGHSCORE: BHI 75 (no rule fires) with traffic 65 → weighted score ≈ 56·conf — STRICTLY
      // higher than G_RULEFLOOR yet stays below the P2 threshold (60). Same lastInspectionDate ⇒
      // same confidence factor, so the score gap holds at any test-run date.
      bridge(G_RULEFLOOR, { conditionRating: 2, averageDailyTraffic: 100, importanceLevel: 1, material: 'Concrete' }),
      bridge(G_HIGHSCORE, { conditionRating: 4, averageDailyTraffic: 6000, importanceLevel: 1 }),
      bridge(G_FAUNA, { conditionRating: 1, structureType: 'Fauna Crossing' })
    ]))
    await db.run(INSERT.into('bridge.management.BridgeRestrictions').entries({
      ID: cds.utils.uuid(), bridge_ID: G_RESTRICTED, restrictionRef: 'RST-GOV-1',
      restrictionType: 'Load limit', restrictionStatus: 'Active', active: true
    }))
  })
  beforeEach(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from(RUNS))
    await db.run(DELETE.from('bridge.management.ChangeLog').where({ changeSource: 'Prioritisation' }))
  })

  // Creates an engineer run for G_MANUAL the supported way (prefill → derived likelihood → save).
  const createManualRun = async (extra = {}) => {
    const f = await asManager((tx) => tx.send('prefill', { bridgeID: G_MANUAL }))
    const created = await asManager((tx) => tx.run(INSERT.into(ASSESS).entries(Object.assign({
      bridge_ID: G_MANUAL, dimSafety: 3, dimNetwork: 3, dimFinancial: 3,
      dimEnvironmental: 3, dimReputational: 3, likelihood: f.derivedLikelihood, strategy: 'Renew'
    }, extra))))
    return created.ID || (created[0] && created[0].ID)
  }

  // ── B3/B4 (a): runType discriminator ─────────────────────────────────────────────────────
  test('B4: fleet runs are stamped runType=fleet; a manual CREATE is server-stamped manual even when the client claims fleet', async () => {
    const manualId = await createManualRun({ runType: 'fleet' }) // masquerade attempt
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const manual = await db.run(SELECT.one.from(RUNS).where({ ID: manualId }))
    expect(manual.runType).toBe('manual') // server is the source of truth
    const fleet = await db.run(SELECT.from(RUNS).where({ fleetRunId: res.fleetRunId }))
    expect(fleet.length).toBe(res.scored)
    fleet.forEach((r) => expect(r.runType).toBe('fleet'))
  })

  // ── B3 (a): fleet never retires engineer judgement ───────────────────────────────────────
  test('B3: a fleet run does NOT supersede an active engineer run — and a re-run supersedes ONLY the prior fleet run', async () => {
    const manualId = await createManualRun()
    const r1 = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    let manual = await db.run(SELECT.one.from(RUNS).where({ ID: manualId }))
    expect(manual.active).toBe(true)             // engineer judgement SURVIVES the batch
    expect(manual.supersededBy_ID).toBeFalsy()
    const fleet1 = await db.run(SELECT.one.from(RUNS).where({ bridge_ID: G_MANUAL, fleetRunId: r1.fleetRunId }))
    expect(fleet1.active).toBe(true)             // both runs active, discriminated by runType
    // re-run: only the FLEET run is retired
    const r2 = await asManager((tx) => tx.send('scoreFleet', {}))
    manual = await db.run(SELECT.one.from(RUNS).where({ ID: manualId }))
    expect(manual.active).toBe(true)             // still untouched after the re-run
    const fleet1After = await db.run(SELECT.one.from(RUNS).where({ ID: fleet1.ID }))
    expect(fleet1After.active).toBe(false)
    const successor = await db.run(SELECT.one.from(RUNS).where({ ID: fleet1After.supersededBy_ID }))
    expect(successor.fleetRunId).toBe(r2.fleetRunId)
    expect(successor.bridge_ID).toBe(G_MANUAL)
    // exactly one active run per (bridge, runType): the manual one + the latest fleet one
    const actives = await db.run(SELECT.from(RUNS).where({ bridge_ID: G_MANUAL, active: true }))
    expect(actives.length).toBe(2)
    expect(actives.map((a) => a.runType).sort()).toEqual(['fleet', 'manual'])
  })

  // ── B3 (c): per-run supersession audit ───────────────────────────────────────────────────
  test('B3: every superseded fleet run gets its OWN ChangeLog row (run id → successor id), batch-tagged with the fleet run', async () => {
    const r1 = await asManager((tx) => tx.send('scoreFleet', {}))
    const r2 = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const old = await db.run(SELECT.from(RUNS).where({ fleetRunId: r1.fleetRunId }))
    expect(old.length).toBeGreaterThan(0)
    for (const o of old) {
      const logs = await db.run(SELECT.from('bridge.management.ChangeLog')
        .where({ objectType: 'PrioritisationAssessment', objectId: String(o.ID) }))
      expect(logs.some((l) => l.fieldName === 'active' && l.oldValue === 'true' && l.newValue === 'false')).toBe(true)
      const link = logs.find((l) => l.fieldName === 'supersededBy')
      expect(link).toBeTruthy()
      expect(link.newValue).toBe(String(o.supersededBy_ID)) // names the successor run
      expect(link.batchId).toBe(r2.fleetRunId)              // grouped under the fleet run
    }
  })

  // ── B4 (b): no fabricated judgement fields ───────────────────────────────────────────────
  test('B4: restrictionFlag comes from the loaded restriction context and strategy is NULL on fleet runs', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const restricted = await db.run(SELECT.one.from(RUNS).where({ bridge_ID: G_RESTRICTED, fleetRunId: res.fleetRunId }))
    expect(restricted.restrictionFlag).toBe(true)   // active 'Active' restriction → flagged
    const unrestricted = await db.run(SELECT.one.from(RUNS).where({ bridge_ID: G_MANUAL, fleetRunId: res.fleetRunId }))
    expect(unrestricted.restrictionFlag).toBe(false)
    const fleet = await db.run(SELECT.from(RUNS).where({ fleetRunId: res.fleetRunId }))
    fleet.forEach((r) => expect(r.strategy).toBeNull()) // no engineer chose 'Maintain'
  })

  // ── B5 (d): rank coheres with band ───────────────────────────────────────────────────────
  test('B5: rank is band-severity-first — a SafetyFloor-raised (P2) bridge outranks a HIGHER-scoring lower-band bridge', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const floor = await db.run(SELECT.one.from(RUNS).where({ bridge_ID: G_RULEFLOOR, fleetRunId: res.fleetRunId }))
    const high = await db.run(SELECT.one.from(RUNS).where({ bridge_ID: G_HIGHSCORE, fleetRunId: res.fleetRunId }))
    expect(floor.band).toBe('P2')                                          // non-compensatory floor fired
    expect(Number(high.priorityScore)).toBeGreaterThan(Number(floor.priorityScore)) // yet scores HIGHER
    expect(['P3', 'P4', 'P5']).toContain(high.band)                        // …in a LESS severe band
    expect(floor.fleetRank).toBeLessThan(high.fleetRank)                   // band wins the rank
    // global invariant over the whole run: band severity never improves as rank worsens, and
    // within one band the score never increases as rank worsens.
    const BAND_IDX = { P1: 0, P2: 1, P3: 2, P4: 3, P5: 4 }
    const runs = await db.run(SELECT.from(RUNS).where({ fleetRunId: res.fleetRunId }).orderBy('fleetRank'))
    for (let i = 1; i < runs.length; i++) {
      expect(BAND_IDX[runs[i].band]).toBeGreaterThanOrEqual(BAND_IDX[runs[i - 1].band])
      if (runs[i].band === runs[i - 1].band) {
        expect(Number(runs[i].priorityScore)).toBeLessThanOrEqual(Number(runs[i - 1].priorityScore))
      }
    }
  })

  // ── B6 (e): the snapshot is a resolved COPY, not a pointer ───────────────────────────────
  test('B6: paramSnapshot stores the RESOLVED model bundle (criteria+bands+bindings, weights, rules, user-type weights, pre-filters)', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const run = await db.run(SELECT.one.from(RUNS).where({ bridge_ID: G_MANUAL, fleetRunId: res.fleetRunId }))
    const snap = JSON.parse(run.paramSnapshot)
    expect(snap.fleetRunId).toBe(res.fleetRunId)
    expect(snap.model).toBe(run.modelCode)
    expect(snap.v).toBe(run.modelVersion)
    expect(snap.criteria.length).toBeGreaterThan(0)        // full criteria catalogue…
    expect(snap.criteria.some((c) => (c.bands || []).length > 0)).toBe(true)    // …with value bands
    expect(snap.criteria.some((c) => (c.bindings || []).length > 0)).toBe(true) // …and bindings
    expect(snap.weights.length).toBeGreaterThan(0)         // per-class weight rows
    expect(snap.rules.length).toBeGreaterThan(0)           // non-compensatory rules
    expect(snap.userTypeWeights.length).toBeGreaterThan(0) // G1/G2 user-type axis
    expect(snap.preFilters.length).toBeGreaterThan(0)      // the applied eligibility gates
    expect(snap.preFilters.some((f) => f.code === 'PF_FAUNA')).toBe(true)
  })

  test('B6: per-bridge exclusions are PERSISTED on the fleet ChangeLog (code + rationale), not just returned transiently', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    expect(res.excluded).toBeGreaterThanOrEqual(1)
    const db = await cds.connect.to('db')
    const logs = await db.run(SELECT.from('bridge.management.ChangeLog')
      .where({ objectType: 'PrioritisationFleetRun', objectId: res.fleetRunId }))
    const exc = logs.find((l) => l.fieldName === 'exclusions')
    expect(exc).toBeTruthy()
    const detail = JSON.parse(exc.newValue)
    const fauna = detail.find((d) => d.bridge === 'BRG-GOV-' + G_FAUNA)
    expect(fauna).toBeTruthy()
    expect(fauna.code).toBe('PF_FAUNA')
    expect(fauna.rationale).toBeTruthy() // the WHY is on the audit trail too
  })

  // ── (f): analytics fact view honesty ─────────────────────────────────────────────────────
  test('UI honesty: the analytics Runs view exposes runType so consumers can split engineer vs data-only runs', async () => {
    const manualId = await createManualRun()
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    const rows = await asAnalytics((tx) => tx.run(
      SELECT.from('PrioritisationAnalyticsService.Runs').columns('ID', 'runType', 'fleetRunId', 'band')
        .where({ active: true })))
    const manualRow = rows.find((r) => r.ID === manualId)
    expect(manualRow).toBeTruthy()
    expect(manualRow.runType).toBe('manual')
    const fleetRows = rows.filter((r) => r.fleetRunId === res.fleetRunId)
    expect(fleetRows.length).toBeGreaterThan(0)
    fleetRows.forEach((r) => expect(r.runType).toBe('fleet'))
  })
})

// ── B6 (e): weightSetHash basis — pure engine tests (no DB) ──────────────────────────────────
describe('weightSetHash basis covers user-type weights + pre-filters (council B6)', () => {
  const crit = (code) => ({
    ID: 'c-' + code, code, name: code, category: 'Consequence', valueType: 'Numeric', active: true,
    bindings: [{ sourceType: 'Manual', sourceRef: code.toLowerCase() }],
    bands: [1, 2, 3, 4, 5].map((l) => ({ lowerBound: l, upperBound: l, score: l * 20, label: 'L' + l, displayOrder: l }))
  })
  const model = (over = {}) => Object.assign({
    code: 'T-GOV', version: 1, aggregationMethod: 'WeightedSumWithRules',
    criteria: [crit('A')], rules: [],
    classWeights: [{ criterion_ID: 'c-A', assetClass: '*', transportMode: '*', included: true, weight: 2, missingDataPolicy: 'flag' }]
  }, over)
  const ctx = { manual: { a: 4 } }

  test('changing a user-type weight changes the hash (it changes the score, so it must change the identity)', () => {
    const utw = (w) => [{ criterion_ID: 'c-A', userType: 'ROAD_PASS', overUnder: '*', applicable: true, weight: w }]
    const h1 = re.evaluate({ model: model({ userTypeWeights: utw(1.0) }), context: ctx, cfg: {} }).weightSetHash
    const h2 = re.evaluate({ model: model({ userTypeWeights: utw(1.5) }), context: ctx, cfg: {} }).weightSetHash
    expect(h1).toMatch(/^[a-f0-9]{64}$/)
    expect(h2).not.toBe(h1)
  })

  test('the applied pre-filter set enters the hash; an inactive pre-filter does not', () => {
    const m = model()
    const pf = (cond) => [{ code: 'PF_X', sourceType: 'BridgeField', sourceRef: 'structureType', condition: cond, active: true }]
    const none = re.evaluate({ model: m, context: ctx, cfg: {} }).weightSetHash
    const withPf = re.evaluate({ model: m, context: ctx, cfg: {}, preFilters: pf('==Fauna Crossing') }).weightSetHash
    const changedPf = re.evaluate({ model: m, context: ctx, cfg: {}, preFilters: pf('==Culvert') }).weightSetHash
    expect(withPf).not.toBe(none)        // same model, different eligible population ⇒ different identity
    expect(changedPf).not.toBe(withPf)   // a pre-filter EDIT is provable
    const inactive = [{ code: 'PF_X', sourceType: 'BridgeField', sourceRef: 'structureType', condition: '==Culvert', active: false }]
    expect(re.evaluate({ model: m, context: ctx, cfg: {}, preFilters: inactive }).weightSetHash).toBe(none)
  })

  test('hash is unchanged for identical inputs (reproducibility contract intact)', () => {
    const m = model({ userTypeWeights: [{ criterion_ID: 'c-A', userType: 'ROAD_PASS', overUnder: '*', applicable: true, weight: 1.2 }] })
    const f = [{ code: 'PF_X', sourceType: 'BridgeField', sourceRef: 'structureType', condition: '==Fauna Crossing', active: true }]
    const h1 = re.evaluate({ model: m, context: ctx, cfg: {}, preFilters: f }).weightSetHash
    const h2 = re.evaluate({ model: m, context: ctx, cfg: {}, preFilters: f }).weightSetHash
    expect(h2).toBe(h1)
  })
})
