const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE } = cds.ql
const { SEED, ensureTemplateAttributesSeed } = require('../srv/lib/template-attributes-seed')
const { TEMPLATES } = require('../srv/lib/template-library-seed')

// Template attribute catalogue — the AttributeDefinitions every template binds to,
// so an instantiated model scores against real register facts instead of all-missing
// data. Plus an end-to-end proof that a NON-BRIDGE template (pavement) produces
// banded scores once its attribute values are present.
if (cds.env.requires && cds.env.requires.db && cds.env.requires.db.credentials) {
  cds.env.requires.db.credentials.url = ':memory:'
}
cds.test(__dirname + '/..')

const NS = 'bridge.management.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const asAdmin = (fn) => cds.connect.to('PrioritisationService').then((srv) =>
  srv.tx({ user: new cds.User({ id: 'adm', roles: ['view', 'manage', 'admin'] }) }, fn))

describe('Template attribute catalogue (seed integrity)', () => {
  test('every Attribute/External binding in every template has a catalogue definition', () => {
    const defined = new Set(SEED.AttributeDefinitions.map(d => d.internalKey))
    const needed = new Set()
    for (const t of TEMPLATES) {
      for (const c of t.criteria) {
        if (c.binding.sourceType === 'Attribute' || c.binding.sourceType === 'External') needed.add(c.binding.sourceRef)
      }
    }
    for (const k of needed) expect(defined.has(k)).toBe(true)
    expect(defined.size).toBe(needed.size) // no orphan definitions either
  })

  test('all seed UUIDs are well-formed and unique across the four tables', () => {
    const all = Object.values(SEED).flat().map(r => r.ID)
    for (const id of all) expect(id).toMatch(UUID_RE)
    expect(new Set(all).size).toBe(all.length)
  })

  test('six sector groups; every definition belongs to a seeded group and carries a dataType', () => {
    expect(SEED.AttributeGroups.length).toBe(6)
    const groupIds = new Set(SEED.AttributeGroups.map(g => g.ID))
    for (const d of SEED.AttributeDefinitions) {
      expect(groupIds.has(d.group_ID)).toBe(true)
      expect(['Text', 'Integer', 'Decimal', 'Date', 'Boolean', 'SingleSelect', 'MultiSelect']).toContain(d.dataType)
      expect(d.objectType).toBe('bridge')
    }
  })

  test('every SingleSelect definition has allowed values; non-select definitions have none', () => {
    const allowedByAttr = new Map()
    for (const v of SEED.AttributeAllowedValues) allowedByAttr.set(v.attribute_ID, (allowedByAttr.get(v.attribute_ID) || 0) + 1)
    for (const d of SEED.AttributeDefinitions) {
      if (d.dataType === 'SingleSelect') expect(allowedByAttr.get(d.ID) || 0).toBeGreaterThanOrEqual(2)
      else expect(allowedByAttr.get(d.ID) || 0).toBe(0)
    }
  })

  test('allowed values match the discrete template bands exactly (e.g. ANCOLD_CATEGORY)', () => {
    const def = SEED.AttributeDefinitions.find(d => d.internalKey === 'ANCOLD_CATEGORY')
    const vals = SEED.AttributeAllowedValues.filter(v => v.attribute_ID === def.ID).map(v => v.value)
    expect(vals).toEqual(['Low', 'Significant', 'High C', 'High B', 'High A', 'Extreme'])
  })

  test('every definition has an enabled per-object-type config row', () => {
    const cfgByAttr = new Map(SEED.AttributeObjectTypeConfig.map(c => [c.attribute_ID, c]))
    for (const d of SEED.AttributeDefinitions) {
      const cfg = cfgByAttr.get(d.ID)
      expect(cfg).toBeTruthy()
      expect(cfg.enabled).toBe(true)
      expect(cfg.objectType).toBe('bridge')
    }
  })

  test('UUID namespace does not collide with model-builder (9*) or template-library (8*) seeds', () => {
    for (const id of Object.values(SEED).flat().map(r => r.ID)) {
      expect(id.startsWith('00000000-0000-4000-7')).toBe(true)
    }
  })
})

describe('Template attribute catalogue (runtime seeding)', () => {
  test('startup seeded the full catalogue and a second pass is idempotent', async () => {
    const db = await cds.connect.to('db')
    const defs = await db.run(SELECT.from(NS + 'AttributeDefinitions').where({ internalKey: 'IRI_MKM' }))
    expect(defs.length).toBe(1)
    const second = await ensureTemplateAttributesSeed(db, { changedBy: 'test' })
    expect(second.inserted).toBe(0)
  })
})

describe('Non-bridge template scores end-to-end (pavement)', () => {
  test('instantiate pavement template (class-stamped) → load a pavement asset with attribute values → fleet scores it', async () => {
    const db = await cds.connect.to('db')
    const PAVE_TPL = '00000000-0000-4000-8200-000000000001' // TPL-ROAD-PAVEMENT-V1

    // instantiate, stamped to a 'Sealed Pavement' class so it is the most-specific match
    const res = await asAdmin((tx) => tx.send('instantiateTemplate', {
      templateID: PAVE_TPL, code: 'PAVE-FLEET-V1', name: 'Pavement working model', assetClass: 'Sealed Pavement'
    }))
    const srv = await cds.connect.to('PrioritisationService')
    await srv.tx({ user: new cds.User({ id: 'adm', roles: ['view', 'manage', 'admin'] }) }, (tx) =>
      tx.run(UPDATE(srv.entities.Models).set({ status: 'Active' }).where({ ID: res.modelID })))

    // a pavement asset (Bridges row, assetClass = the stamped class) + its attribute values
    const now = new Date().toISOString()
    const PAVE_ID = 90201
    await db.run(INSERT.into(NS + 'Bridges').entries([{
      ID: PAVE_ID, bridgeId: 'PAVE-001', bridgeName: 'Demo Pavement Segment', title: 'Demo Pavement Segment',
      assetClass: 'Sealed Pavement', transportMode: 'Road', state: 'NSW', status: 'Active',
      conditionRating: 5, createdAt: now, createdBy: 'e2e', modifiedAt: now, modifiedBy: 'e2e'
    }]))
    const av = (key, dec, text) => ({
      ID: cds.utils.uuid(), objectType: 'bridge', objectId: String(PAVE_ID), attributeKey: key,
      valueDecimal: dec ?? null, valueText: text ?? null, valueInteger: null, valueBoolean: null, valueDate: null,
      createdAt: now, createdBy: 'e2e', modifiedAt: now, modifiedBy: 'e2e'
    })
    await db.run(INSERT.into(NS + 'AttributeValues').entries([
      av('IRI_MKM', 4.8), av('RUT_DEPTH_MM', 15), av('CRACKED_AREA_PCT', 12),
      av('SKID_VS_IL', null, 'Below IL'),           // trips the safety floor → P2 + review
      av('AADT', 28000), av('HV_PCT', 18), av('AUSRAP_STARS', null, '1-2 star')
    ]))

    const fleet = await asAdmin((tx) => tx.send('scoreFleet', {}))
    expect(fleet.scored).toBeGreaterThanOrEqual(1)

    const run = await db.run(SELECT.one.from(NS + 'PrioritisationAssessment')
      .where({ bridge_ID: PAVE_ID, active: true, runType: 'fleet' }))
    expect(run).toBeTruthy()
    expect(run.modelCode).toBe('PAVE-FLEET-V1')
    expect(['P1', 'P2', 'P3', 'P4', 'P5']).toContain(run.band)

    // the pavement attributes actually resolved (not all-missing): several criteria carry real scores
    const breakdown = JSON.parse(run.criterionBreakdown)
    const scored = (breakdown.rows || []).filter(r => r.score != null && r.source && /Attribute/.test(r.source))
    expect(scored.length).toBeGreaterThanOrEqual(5)

    // SKID below investigatory level fired the non-compensatory floor (P2 or better) + review hold
    expect(['P1', 'P2']).toContain(run.band)
    expect(run.reviewStatus).toBe('pending')
  })
})
