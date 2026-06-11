const cds = require('@sap/cds')
const { SELECT, INSERT, DELETE } = cds.ql

// Council B5 (partition) — fleetRank partitions by (modelCode, modelVersion). Scores produced by
// DIFFERENT models are not commensurable: a single fleet-wide sequence ranked a culvert "above"
// a road bridge on numbers from different parameter sets. This suite runs scoreFleet through the
// service layer over TWO Active data-only models covering DISJOINT asset classes and asserts:
//   • each partition is an independent, contiguous rank sequence starting at 1 (two rank-1 rows
//     coexist in one fleet run — one per scoring model);
//   • ordering INSIDE each partition stays band-first (P1 before P2, score DESC within a band);
//   • the partition split (modelCode, modelVersion, scored count) is STAMPED on the fleet
//     ChangeLog entry, so a past run's per-model ranked lists are reconstructible;
//   • re-runs still supersede across BOTH partitions (exactly one active run per bridge).
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const asManager = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'mgr', roles: ['view', 'manage'] }) }, fn))

const NS = 'bridge.management.'
const RUNS = NS + 'PrioritisationAssessment'

// Second ACTIVE data-only model on a DISJOINT class: 'Culvert' (the seeded NSW-PACK-V1 carries
// class weights only for Road/Rail/Pedestrian/Shared Path Bridge, and the ('*','*') fallback
// NSW-RISK-V1 is a delegation model that scoreFleet skips).
const CULV_MODEL = 'aaaaaaaa-0000-4000-9100-00000000c001'
const CULV_CRIT = 'aaaaaaaa-0000-4000-9200-00000000c001'

const R_BAD = 990701  // Road Bridge, cond 2 → road partition rank 1
const R_GOOD = 990702 // Road Bridge, cond 9 → road partition rank 2
const C_BAD = 990703  // Culvert, cond 3 → culvert partition rank 1
const C_GOOD = 990704 // Culvert, cond 8 → culvert partition rank 2

const bridge = (id, over = {}) => Object.assign({
  ID: id, bridgeId: 'BRG-PART-' + id, bridgeName: 'Partition Test Bridge ' + id,
  assetClass: 'Road Bridge', transportMode: 'Road', status: 'Active',
  conditionRating: 5, structuralAdequacyRating: 5, lastInspectionDate: '2026-01-01'
}, over)

describe('scoreFleet rank partitioning by (modelCode, modelVersion) — council B5', () => {
  beforeAll(async () => {
    const db = await cds.connect.to('db')
    await db.run(INSERT.into(NS + 'PrioritisationModel').entries({
      ID: CULV_MODEL, code: 'CULV-TEST-V1', name: 'Culvert test model', version: 1,
      status: 'Active', aggregationMethod: 'WeightedSumWithRules'
    }))
    await db.run(INSERT.into(NS + 'ModelCriterion').entries({
      ID: CULV_CRIT, model_ID: CULV_MODEL, code: 'COND', name: 'Condition',
      category: 'Likelihood', valueType: 'Numeric', active: true
    }))
    await db.run(INSERT.into(NS + 'CriterionSourceBinding').entries({
      ID: cds.utils.uuid(), criterion_ID: CULV_CRIT, sourceType: 'BridgeField', sourceRef: 'conditionRating'
    }))
    await db.run(INSERT.into(NS + 'CriterionValueBand').entries([
      [1, 2, 90], [3, 4, 70], [5, 6, 50], [7, 8, 30], [9, 10, 10]
    ].map(([lo, hi, score], i) => ({
      ID: cds.utils.uuid(), criterion_ID: CULV_CRIT,
      lowerBound: lo, upperBound: hi, score, label: 'B' + (i + 1), displayOrder: i + 1
    }))))
    await db.run(INSERT.into(NS + 'AssetClassCriterionWeight').entries({
      ID: cds.utils.uuid(), model_ID: CULV_MODEL, assetClass: 'Culvert', transportMode: '*',
      criterion_ID: CULV_CRIT, included: true, weight: 1, missingDataPolicy: 'flag'
    }))
    await db.run(INSERT.into(NS + 'Bridges').entries([
      bridge(R_BAD, { conditionRating: 2 }),
      bridge(R_GOOD, { conditionRating: 9 }),
      bridge(C_BAD, { assetClass: 'Culvert', conditionRating: 3 }),
      bridge(C_GOOD, { assetClass: 'Culvert', conditionRating: 8 })
    ]))
  })
  beforeEach(async () => {
    const db = await cds.connect.to('db')
    await db.run(DELETE.from(RUNS))
  })

  test('B5: two active models over disjoint classes → INDEPENDENT rank sequences, both starting at 1', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    expect(res.scored).toBe(4)
    const db = await cds.connect.to('db')
    const road = await db.run(SELECT.from(RUNS)
      .where({ fleetRunId: res.fleetRunId, modelCode: 'NSW-PACK-V1' }).orderBy('fleetRank'))
    const culv = await db.run(SELECT.from(RUNS)
      .where({ fleetRunId: res.fleetRunId, modelCode: 'CULV-TEST-V1' }).orderBy('fleetRank'))
    // independent contiguous sequences, each restarting at 1
    expect(road.map((r) => r.fleetRank)).toEqual([1, 2])
    expect(culv.map((r) => r.fleetRank)).toEqual([1, 2])
    // worse condition ranks first INSIDE its own partition
    expect(road.map((r) => r.bridge_ID)).toEqual([R_BAD, R_GOOD])
    expect(culv.map((r) => r.bridge_ID)).toEqual([C_BAD, C_GOOD])
    // two rank-1 rows coexist in ONE fleet run — one per scoring model
    const rank1 = await db.run(SELECT.from(RUNS).where({ fleetRunId: res.fleetRunId, fleetRank: 1 }))
    expect(rank1.length).toBe(2)
    expect(new Set(rank1.map((r) => r.modelCode))).toEqual(new Set(['NSW-PACK-V1', 'CULV-TEST-V1']))
    // band-first ordering holds INSIDE each partition: severity never improves as the partition
    // rank worsens; within one band the score never increases as the rank worsens.
    const BAND_IDX = { P1: 0, P2: 1, P3: 2, P4: 3, P5: 4 }
    for (const part of [road, culv]) {
      for (let i = 1; i < part.length; i++) {
        expect(BAND_IDX[part[i].band]).toBeGreaterThanOrEqual(BAND_IDX[part[i - 1].band])
        if (part[i].band === part[i - 1].band) {
          expect(Number(part[i].priorityScore)).toBeLessThanOrEqual(Number(part[i - 1].priorityScore))
        }
      }
    }
    // every run carries its partition identity (modelCode + modelVersion stamped per run)
    road.forEach((r) => expect(r.modelVersion).toBe(1))
    culv.forEach((r) => expect(r.modelVersion).toBe(1))
  })

  test('B5: the partition split is STAMPED on the fleet ChangeLog entry (audit reconstructibility)', async () => {
    const res = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const logs = await db.run(SELECT.from(NS + 'ChangeLog')
      .where({ objectType: 'PrioritisationFleetRun', objectId: res.fleetRunId }))
    const part = logs.find((l) => l.fieldName === 'partitions')
    expect(part).toBeTruthy()
    const detail = JSON.parse(part.newValue)
    expect(detail.find((d) => d.modelCode === 'NSW-PACK-V1')).toMatchObject({ modelVersion: 1, scored: 2 })
    expect(detail.find((d) => d.modelCode === 'CULV-TEST-V1')).toMatchObject({ modelVersion: 1, scored: 2 })
    // the stamped counts reconcile to the stored runs
    expect(detail.reduce((s, d) => s + d.scored, 0)).toBe(res.scored)
  })

  test('B5: a re-run supersedes across BOTH partitions — exactly one active run per bridge', async () => {
    await asManager((tx) => tx.send('scoreFleet', {}))
    const r2 = await asManager((tx) => tx.send('scoreFleet', {}))
    const db = await cds.connect.to('db')
    const active = await db.run(SELECT.from(RUNS).where({ active: true }))
    expect(active.length).toBe(r2.scored)
    active.forEach((r) => expect(r.fleetRunId).toBe(r2.fleetRunId))
    // and the partition sequences are reproduced identically on the re-run
    const culv = await db.run(SELECT.from(RUNS)
      .where({ fleetRunId: r2.fleetRunId, modelCode: 'CULV-TEST-V1' }).orderBy('fleetRank'))
    expect(culv.map((r) => [r.bridge_ID, r.fleetRank])).toEqual([[C_BAD, 1], [C_GOOD, 2]])
  })
})
