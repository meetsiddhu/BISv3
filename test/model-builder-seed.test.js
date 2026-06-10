const cds = require('@sap/cds')
const fs = require('fs')
const path = require('path')
const { SELECT, UPDATE, INSERT } = cds.ql
const { TABLES, SEED, ensureModelBuilderSeed } = require('../srv/lib/model-builder-seed')

// B9 (council v3.12): the nine Model Builder tables are ADMIN-WRITABLE. CSV seeding
// generated hdbtabledata with include_filter:[] — HDI owned the full table content and
// TRUNCATED admin-authored models/weights/rules on every redeploy. This suite certifies
// the replacement: runtime insert-if-missing seeding that NEVER touches existing rows.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const NS = 'bridge.management.'

describe('Model Builder runtime seed (B9 — no CSV truncation trap)', () => {
  test('the truncation trap stays closed: NO db/data CSV may exist for the nine admin-writable tables', () => {
    const dataDir = path.join(__dirname, '..', 'db', 'data')
    for (const table of TABLES) {
      const csv = path.join(dataDir, `bridge.management-${table}.csv`)
      expect(fs.existsSync(csv)).toBe(false) // a CSV here re-arms hdbtabledata truncation
    }
  })

  test('stale HDI tabledata artifacts are listed for undeploy (one-time container cleanup)', () => {
    const undeploy = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'undeploy.json'), 'utf8'))
    for (const table of TABLES) {
      expect(undeploy).toContain(`src/gen/data/bridge.management-${table}.hdbtabledata`)
      expect(undeploy).toContain(`src/gen/data/bridge.management-${table}.csv`)
    }
  })

  test('startup seeding populated every table with the full seed set (keyed on fixed UUIDs)', async () => {
    const db = await cds.connect.to('db')
    for (const table of TABLES) {
      const rows = await db.run(SELECT.from(NS + table).columns('ID'))
      const have = new Set(rows.map((r) => String(r.ID).toLowerCase()))
      for (const seedRow of SEED[table]) {
        expect(have.has(String(seedRow.ID).toLowerCase())).toBe(true)
      }
      expect(rows.length).toBeGreaterThanOrEqual(SEED[table].length)
    }
  })

  test('seed inserts are captured in ChangeLog (locked rule 3)', async () => {
    const db = await cds.connect.to('db')
    const logged = await db.run(SELECT.from(NS + 'ChangeLog')
      .where({ objectType: 'Lookup', objectId: 'PrioritisationModel' }))
    const seedRows = logged.filter((l) => String(l.objectName).includes('model-builder seed'))
    expect(seedRows.length).toBe(SEED.PrioritisationModel.length)
    expect(seedRows.map((l) => l.newValue).sort()).toEqual(['NSW-PACK-V1', 'NSW-RISK-V1'])
  })

  test('idempotent: a second ensure pass inserts NOTHING', async () => {
    const db = await cds.connect.to('db')
    const second = await ensureModelBuilderSeed(db, { changedBy: 'test' })
    expect(second.inserted).toBe(0)
    for (const table of TABLES) expect(second.perTable[table]).toBe(0)
  })

  test('admin edits and admin-authored rows SURVIVE re-seeding (the redeploy scenario)', async () => {
    const db = await cds.connect.to('db')
    const M = NS + 'PrioritisationModel'
    const seedId = SEED.PrioritisationModel[0].ID
    const original = await db.run(SELECT.one.from(M).where({ ID: seedId }))

    // 1) admin EDITS a seed row (rename + retire) …
    await db.run(UPDATE(M).set({ name: 'Admin-tuned model', status: 'Retired' }).where({ ID: seedId }))
    // 2) … and AUTHORS a brand-new model of their own.
    const adminId = '11111111-2222-4333-8444-555555555555'
    await db.run(INSERT.into(M).entries({
      ID: adminId, code: 'ADMIN-V1', name: 'Admin-authored model', version: 1, status: 'Draft',
      aggregationMethod: 'WeightedSumWithRules'
    }))

    // Re-seeding (what every app restart / redeploy does) must touch NEITHER.
    const rerun = await ensureModelBuilderSeed(db, { changedBy: 'test' })
    expect(rerun.inserted).toBe(0)
    const edited = await db.run(SELECT.one.from(M).where({ ID: seedId }))
    expect(edited.name).toBe('Admin-tuned model')      // edit preserved — no truncation
    expect(edited.status).toBe('Retired')
    const authored = await db.run(SELECT.one.from(M).where({ ID: adminId }))
    expect(authored).toBeTruthy()                      // admin row preserved
    expect(authored.code).toBe('ADMIN-V1')

    // restore the seed row so this file leaves the shared in-memory db canonical
    await db.run(UPDATE(M).set({ name: original.name, status: original.status }).where({ ID: seedId }))
  })

  test('seed module integrity: parent-first table order + every row carries its fixed UUID', () => {
    expect(TABLES).toEqual([
      'PrioritisationModel', 'ModelCriterion', 'CriterionSourceBinding', 'CriterionValueBand',
      'AssetClassCriterionWeight', 'AggregationRule', 'UserTypes', 'UserTypeCriterionWeight',
      'PrioritisationPreFilter'
    ])
    for (const table of TABLES) {
      expect(SEED[table].length).toBeGreaterThan(0)
      for (const row of SEED[table]) expect(row.ID).toMatch(/^[0-9a-f-]{36}$/i)
      // fixed UUIDs must be unique within each table — insert-if-missing keys on them
      expect(new Set(SEED[table].map((r) => r.ID)).size).toBe(SEED[table].length)
    }
  })
})
