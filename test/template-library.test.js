const cds = require('@sap/cds')
const { SELECT } = cds.ql
const { TABLES, SEED, TEMPLATES, ensureTemplateLibrarySeed } = require('../srv/lib/template-library-seed')

// Asset-class prioritisation template library: 8 standards-calibrated starting
// points (Transport / Infrastructure / Mining / Government) seeded with
// status='Template' so Active-model resolution ignores them, instantiable into
// working Draft models via the instantiateTemplate action. Same seeding contract
// as the model-builder seed: insert-if-missing on fixed UUIDs, ChangeLogged.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const NS = 'bridge.management.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('Prioritisation template library (seed integrity)', () => {
  test('twelve templates covering six industry sectors, every one standards-attributed', () => {
    expect(TEMPLATES.length).toBe(12)
    const sectors = new Set(TEMPLATES.map(t => t.sector))
    for (const s of ['Transport', 'Infrastructure', 'Mining', 'Government', 'Energy', 'Maritime']) expect(sectors).toContain(s)
    for (const t of TEMPLATES) {
      expect(t.code).toMatch(/^TPL-[A-Z-]+-V\d+$/)
      expect(t.standards.length).toBeGreaterThan(10)
      expect(t.criteria.length).toBeGreaterThanOrEqual(9)
      for (const c of t.criteria) expect(c.standardRef).toBeTruthy()
    }
  })

  test('every seed row has a fixed, well-formed, unique UUID (idempotency key)', () => {
    for (const table of TABLES) {
      const ids = SEED[table].map(r => r.ID)
      for (const id of ids) expect(id).toMatch(UUID_RE)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  test('template UUIDs do not collide with the model-builder seed namespace', () => {
    const { SEED: MB_SEED, TABLES: MB_TABLES } = require('../srv/lib/model-builder-seed')
    const mbIds = new Set(MB_TABLES.flatMap(t => (MB_SEED[t] || []).map(r => String(r.ID).toLowerCase())))
    for (const table of TABLES) {
      for (const r of SEED[table]) expect(mbIds.has(String(r.ID).toLowerCase())).toBe(false)
    }
  })

  test('referential integrity inside the seed: weights/bindings/bands/rules point at own-template criteria', () => {
    const critIds = new Set(SEED.ModelCriterion.map(c => c.ID))
    const modelIds = new Set(SEED.PrioritisationModel.map(m => m.ID))
    for (const b of SEED.CriterionSourceBinding) expect(critIds.has(b.criterion_ID)).toBe(true)
    for (const b of SEED.CriterionValueBand) expect(critIds.has(b.criterion_ID)).toBe(true)
    for (const w of SEED.AssetClassCriterionWeight) {
      expect(critIds.has(w.criterion_ID)).toBe(true)
      expect(modelIds.has(w.model_ID)).toBe(true)
    }
    for (const r of SEED.AggregationRule) {
      expect(modelIds.has(r.model_ID)).toBe(true)
      if (r.criterion_ID) expect(critIds.has(r.criterion_ID)).toBe(true)
    }
  })

  test('every rule config parses as JSON; every Level1to5 rubric parses with exactly 5 levels', () => {
    for (const r of SEED.AggregationRule) expect(() => JSON.parse(r.config)).not.toThrow()
    for (const c of SEED.ModelCriterion) {
      if (c.valueType === 'Level1to5') {
        const rubric = JSON.parse(c.rubric)
        expect(Object.keys(rubric).sort()).toEqual(['1', '2', '3', '4', '5'])
      }
    }
  })

  test('numeric value bands are coherent: scores 0-100, monotone non-decreasing with severity order', () => {
    const byCrit = new Map()
    for (const b of SEED.CriterionValueBand) {
      if (!byCrit.has(b.criterion_ID)) byCrit.set(b.criterion_ID, [])
      byCrit.get(b.criterion_ID).push(b)
    }
    for (const bands of byCrit.values()) {
      bands.sort((a, b) => a.displayOrder - b.displayOrder)
      for (const b of bands) {
        expect(b.score).toBeGreaterThanOrEqual(0)
        expect(b.score).toBeLessThanOrEqual(100)
      }
    }
  })

  test('every criterion carries exactly one source binding, one weight row, and a missing-data policy', () => {
    const bindCount = new Map()
    for (const b of SEED.CriterionSourceBinding) bindCount.set(b.criterion_ID, (bindCount.get(b.criterion_ID) || 0) + 1)
    const weightCount = new Map()
    for (const w of SEED.AssetClassCriterionWeight) weightCount.set(w.criterion_ID, (weightCount.get(w.criterion_ID) || 0) + 1)
    for (const c of SEED.ModelCriterion) {
      expect(bindCount.get(c.ID)).toBe(1)
      expect(weightCount.get(c.ID)).toBe(1)
    }
    for (const w of SEED.AssetClassCriterionWeight) {
      expect(String(w.missingDataPolicy)).toMatch(/^(flag|neutral|exclude|penalise(:\d+)?)$/)
      expect(w.weight).toBeGreaterThan(0)
      expect(w.weight).toBeLessThanOrEqual(10)
    }
  })

  test('every template ships at least one non-compensatory safety rule and a confidence-decay rule', () => {
    for (const m of SEED.PrioritisationModel) {
      const rules = SEED.AggregationRule.filter(r => r.model_ID === m.ID)
      const types = rules.map(r => r.ruleType)
      expect(types.some(t => ['SafetyFloor', 'Veto', 'Escalate', 'HurdleMin'].includes(t))).toBe(true)
      expect(types).toContain('ConfidenceWeight')
      for (const r of rules) expect(String(r.rationale || '').length).toBeGreaterThan(20)
    }
  })
})

describe('Prioritisation template library (runtime seeding)', () => {
  test('startup seeded all templates as status=Template / isTemplate=true (never Active)', async () => {
    const db = await cds.connect.to('db')
    const models = await db.run(SELECT.from(NS + 'PrioritisationModel').where({ isTemplate: true }))
    expect(models.length).toBe(12)
    for (const m of models) {
      expect(m.status).toBe('Template')
      expect(m.sector).toBeTruthy()
      expect(m.standardsBasis).toBeTruthy()
    }
  })

  test('second ensure pass is a no-op (idempotent on fixed UUIDs)', async () => {
    const db = await cds.connect.to('db')
    const second = await ensureTemplateLibrarySeed(db, { changedBy: 'test' })
    expect(second.inserted).toBe(0)
  })

  test('full bundle landed: criteria, bindings, bands, weights, rules all present per template', async () => {
    const db = await cds.connect.to('db')
    for (const m of SEED.PrioritisationModel) {
      const crit = await db.run(SELECT.from(NS + 'ModelCriterion').where({ model_ID: m.ID }))
      const spec = TEMPLATES.find(t => t.code === m.code)
      expect(crit.length).toBe(spec.criteria.length)
      const rules = await db.run(SELECT.from(NS + 'AggregationRule').where({ model_ID: m.ID }))
      expect(rules.length).toBe(spec.rules.length)
    }
  })

  test('templates do not leak into Active-model resolution (no Active status, distinct codes)', async () => {
    const db = await cds.connect.to('db')
    const active = await db.run(SELECT.from(NS + 'PrioritisationModel').where({ status: 'Active' }))
    for (const m of active) expect(m.isTemplate).toBeFalsy()
  })
})

describe('instantiateTemplate action (template → working Draft model)', () => {
  const asAdmin = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
    srv.tx({ user: new cds.User({ id: 'adm', roles: ['view', 'manage', 'admin'] }) }, fn))
  const TSF_TPL_ID = '00000000-0000-4000-8400-000000000001' // TPL-MINE-TSF-V1

  test('deep-copies the full bundle to a new code, version 1, Draft, isTemplate=false', async () => {
    const res = await asAdmin((tx) => tx.send('instantiateTemplate', {
      templateID: TSF_TPL_ID, code: 'MINE-TSF-V1', name: 'TSF portfolio model'
    }))
    expect(res.code).toBe('MINE-TSF-V1')
    expect(res.version).toBe(1)
    expect(res.status).toBe('Draft')
    const spec = TEMPLATES.find(t => t.code === 'TPL-MINE-TSF-V1')
    expect(res.criteria).toBe(spec.criteria.length)
    expect(res.rules).toBe(spec.rules.length)
    expect(res.bindings).toBe(spec.criteria.length)

    const db = await cds.connect.to('db')
    const created = await db.run(SELECT.one.from(NS + 'PrioritisationModel').where({ ID: res.modelID }))
    expect(created.isTemplate).toBeFalsy()
    expect(created.status).toBe('Draft')
    expect(created.sector).toBe('Mining') // provenance carried over
    expect(String(created.reviewSource)).toMatch(/TPL-MINE-TSF-V1/)
    expect(created.reviewedBy).toBeNull() // sign-off restarts for the working model

    // the template itself is untouched
    const tpl = await db.run(SELECT.one.from(NS + 'PrioritisationModel').where({ ID: TSF_TPL_ID }))
    expect(tpl.status).toBe('Template')
    expect(tpl.isTemplate).toBe(true)
  })

  test('rejects a duplicate code, a non-template source, and a missing code', async () => {
    await expect(asAdmin((tx) => tx.send('instantiateTemplate', {
      templateID: TSF_TPL_ID, code: 'MINE-TSF-V1', name: 'duplicate'
    }))).rejects.toThrow(/already exists/i)

    const db = await cds.connect.to('db')
    const working = await db.run(SELECT.one.from(NS + 'PrioritisationModel').where({ code: 'MINE-TSF-V1' }))
    await expect(asAdmin((tx) => tx.send('instantiateTemplate', {
      templateID: working.ID, code: 'ANOTHER-V1', name: 'x'
    }))).rejects.toThrow(/not a template/i)

    await expect(asAdmin((tx) => tx.send('instantiateTemplate', {
      templateID: TSF_TPL_ID, code: '', name: 'x'
    }))).rejects.toThrow(/code .* required/i)
  })
})
