const cds = require('@sap/cds')
const LOG = cds.log('demo-seed')
const { scoreCompleteness } = require('./lib/data-quality')
const { screenFatigue } = require('./lib/fatigue')

// Council fix #4: bulk seed inserts bypass the CAP save handler, so stamp the data-quality
// tier + the honest load-rating basis directly on the entries. Open-data (OpenStreetMap)
// rows score Partial/Incomplete by design — that is the point of badging them. Mutates +
// returns the array. loadRatingBasis defaults to 'Screening' (never present a derived rating
// as certified) unless the seed explicitly recorded a higher assurance level.
function enrichDataQuality (bridges) {
  for (const b of (bridges || [])) {
    if (b.dataCompleteness == null) {
      const dq = scoreCompleteness(b)
      b.dataCompleteness = dq.tier
      b.dataCompletenessScore = dq.score
    }
    if (b.loadRatingBasis == null) b.loadRatingBasis = 'Screening'
    // Council fix #3: advisory AS 5100.6 fatigue screen for bulk-seeded rows (the handler
    // does this for interactive saves). Non-steel rows screen Not Applicable.
    if (b.fatigueScreeningStatus == null) {
      const fat = screenFatigue(b)
      b.fatigueScreeningStatus = fat.status
      b.estimatedFatigueLifeYears = fat.estimatedFatigueLifeYears
    }
  }
  return bridges
}

// Standard bridge asset classes + Culvert / Major Culvert. Seeded at RUNTIME (idempotent,
// insert-if-missing) rather than via a db/data CSV: the AssetClasses table already holds
// runtime-inserted rows on HANA, which HDI table-data deployment refuses to clobber.
const ASSET_CLASSES = [
  { code: 'Road Bridge', name: 'Road Bridge', descr: 'Road traffic bridge structure', objectType: 'bridge', isActive: true },
  { code: 'Rail Bridge', name: 'Rail Bridge', descr: 'Railway bridge / underbridge', objectType: 'bridge', isActive: true },
  { code: 'Pedestrian Bridge', name: 'Pedestrian Bridge', descr: 'Footbridge / pedestrian structure', objectType: 'bridge', isActive: true },
  { code: 'Shared Path Bridge', name: 'Shared Path Bridge', descr: 'Shared pedestrian & cycle path bridge', objectType: 'bridge', isActive: true },
  { code: 'Culvert', name: 'Culvert', descr: 'Drainage culvert (pipe or box) under a road or rail formation', objectType: 'bridge', isActive: true },
  { code: 'Major Culvert', name: 'Major Culvert', descr: 'Large multi-cell or long-span culvert (waterway opening >= 6 m2)', objectType: 'bridge', isActive: true }
]

// Bridge material catalog — drives the material / superstructureMaterial search help. Common
// structural materials; admin-extendable via the lookup (sap.common.CodeList).
const MATERIAL_TYPES = [
  'Reinforced Concrete', 'Prestressed Concrete', 'Steel', 'Steel/Concrete Composite',
  'Wrought Iron', 'Cast Iron', 'Timber', 'Masonry', 'Stone', 'Brick',
  'Aluminium', 'Fibre-Reinforced Polymer (FRP)'
].map((code) => ({ code, name: code, isActive: true }))

/*
 * One-time demo data load for the deployed (HANA) trial app.
 *
 * Why a startup seed rather than db/data CSVs: business entities (Bridges,
 * Restrictions, PrioritisationAssessment) seeded via db/data would (a) pollute
 * the test fixtures — several prioritisation tests assert exact fleet counts on
 * an empty register — and (b) be re-applied/reset on every deploy. This loads
 * the same engine-computed dataset (BHI/BSI + real scoreFleet runs) once, only
 * into an EMPTY register, and is skipped under test.
 *
 * Safe by construction:
 *  • skipped when NODE_ENV=test or the 'test' profile is active;
 *  • skipped when BMS_SEED_DEMO=false (off-switch for a real customer deploy);
 *  • only ever inserts when the register is empty — never overwrites real data;
 *  • failures are logged, never fatal to startup.
 */
async function seedDemoData () {
  if (process.env.NODE_ENV === 'test' || (cds.env.profiles || []).includes('test')) return

  // Ensure asset classes (incl. Culvert / Major Culvert) exist — idempotent, every non-test start.
  try {
    await cds.tx({ user: cds.User.privileged }, async (tx) => {
      for (const ac of ASSET_CLASSES) {
        const ex = await tx.run(SELECT.one.from('bridge.management.AssetClasses').columns('code').where({ code: ac.code }))
        if (!ex) await tx.run(INSERT.into('bridge.management.AssetClasses').entries(ac))
      }
      // Material catalog for the material / superstructureMaterial search help (insert-if-missing).
      for (const m of MATERIAL_TYPES) {
        const ex = await tx.run(SELECT.one.from('bridge.management.MaterialTypes').columns('code').where({ code: m.code }))
        if (!ex) await tx.run(INSERT.into('bridge.management.MaterialTypes').entries(m))
      }
    })
  } catch (e) { LOG.warn('demo-seed: asset-class/material ensure skipped (' + e.message + ')') }

  if (process.env.BMS_SEED_DEMO === 'false') return

  let data
  try {
    data = require('./demo-seed.data.json')
  } catch {
    LOG.warn('demo-seed: data file not found — skipping')
    return
  }

  // BR-1001 is the demo set's marker — once present, the seed/reset is a no-op (idempotent).
  const DEMO_MARKER = 'BR-1001'
  // All bridge-child instance tables — cleared before a reset so the demo register is clean.
  // No DB foreign keys exist (app-level integrity), so delete order does not matter.
  const CHILD_ENTITIES = [
    'bridge.management.PrioritisationAssessment', 'bridge.management.BridgeElements',
    'bridge.management.Restrictions', 'bridge.management.BridgeRestrictions',
    'bridge.management.BridgeCapacities', 'bridge.management.BridgeDefects',
    'bridge.management.BridgeDocuments', 'bridge.management.BridgeInspections',
    'bridge.management.BridgeTreatments', 'bridge.management.BridgeAttributes',
    'bridge.management.EamWorkRequest'
  ]

  try {
    await cds.tx({ user: cds.User.privileged }, async (tx) => {
      const existing = await tx.run(SELECT.one.from('bridge.management.Bridges').columns('ID'))
      if (existing) {
        // BMS_SEED_DEMO_RESET=true forces a clean refresh even when the demo set is already
        // present — previously the demo-marker skip returned first, leaving RESET unreachable
        // once seeded (so a deployed demo could never pick up enriched seed data). The flag
        // now takes precedence; default (no flag) behaviour is unchanged.
        const reset = process.env.BMS_SEED_DEMO_RESET === 'true'
        const hasDemo = await tx.run(SELECT.one.from('bridge.management.Bridges').columns('ID').where({ bridgeId: DEMO_MARKER }))
        if (!reset) {
          if (hasDemo) LOG.info('demo-seed: demo set already present — skipping')
          else LOG.info('demo-seed: register populated (non-demo) — skipping. Set BMS_SEED_DEMO_RESET=true to replace.')
          return
        }
        LOG.warn('demo-seed RESET: clearing existing register + child data, loading the clean demo set')
        for (const e of CHILD_ENTITIES) {
          try { await tx.run(DELETE.from(e)) } catch (err) { LOG.warn(`demo-seed reset: skipped ${e} (${err.message})`) }
        }
        await tx.run(DELETE.from('bridge.management.Bridges'))
      }

      await tx.run(INSERT.into('bridge.management.Bridges').entries(enrichDataQuality(data.bridges)))
      await tx.run(INSERT.into('bridge.management.BridgeElements').entries(data.elements))
      await tx.run(INSERT.into('bridge.management.Restrictions').entries(data.restrictions))
      await tx.run(INSERT.into('bridge.management.PrioritisationAssessment').entries(data.runs))

      LOG.info(`demo-seed: loaded ${data.bridges.length} bridges, ${data.elements.length} elements, ` +
        `${data.restrictions.length} restrictions, ${data.runs.length} prioritisation runs`)
    })
  } catch (e) {
    LOG.error('demo-seed failed (non-fatal):', e.message)
  }

  // Bulk NSW open-data load — fire-and-forget so the ~1,300-row insert never delays the server
  // from listening (and the CF health check). It self-catches; the register just fills in shortly.
  seedNsw()

  // Council fix #4: backfill the data-quality tier on any pre-existing rows that predate the
  // field (e.g. the already-deployed register). Idempotent + fire-and-forget — a no-op once
  // every row is scored — and runs as the app's privileged user, so no DB credentials needed.
  backfillDataQuality()
  // Council fix #3: same idempotent backfill for the advisory AS 5100.6 fatigue screen.
  backfillFatigue()
}

// One-time, idempotent data-quality backfill for rows where dataCompleteness IS NULL. Groups
// rows by computed (tier, score, basis) so the whole register is updated in a handful of
// statements rather than one-per-row. Skips itself entirely once nothing is left to score.
async function backfillDataQuality () {
  const COLS = ['ID', 'loadRatingBasis', 'bridgeId', 'bridgeName', 'assetClass',
    'latitude', 'longitude', 'state', 'structureType', 'material', 'yearBuilt',
    'spanLength', 'totalLength', 'numberOfLanes', 'conditionRating', 'lastInspectionDate',
    'assetOwner', 'route', 'lga']
  try {
    await cds.tx({ user: cds.User.privileged }, async (tx) => {
      const pending = await tx.run(SELECT.one.from('bridge.management.Bridges').columns('ID').where('dataCompleteness is null'))
      if (!pending) return // idempotent: nothing to backfill
      const rows = await tx.run(SELECT.from('bridge.management.Bridges').columns(...COLS).where('dataCompleteness is null'))
      const groups = new Map()
      for (const b of rows) {
        const dq = scoreCompleteness(b)
        const basis = b.loadRatingBasis || 'Screening'
        const key = `${dq.tier}|${dq.score}|${basis}`
        if (!groups.has(key)) groups.set(key, { tier: dq.tier, score: dq.score, basis, ids: [] })
        groups.get(key).ids.push(b.ID)
      }
      for (const g of groups.values()) {
        await tx.run(UPDATE('bridge.management.Bridges')
          .set({ dataCompleteness: g.tier, dataCompletenessScore: g.score, loadRatingBasis: g.basis })
          .where({ ID: { in: g.ids } }))
      }
      LOG.info(`demo-seed: backfilled data-quality on ${rows.length} bridges (${groups.size} groups)`)
    })
  } catch (e) { LOG.warn('demo-seed: data-quality backfill skipped (' + e.message + ')') }
}

// One-time, idempotent AS 5100.6 fatigue-screen backfill for rows where fatigueScreeningStatus
// IS NULL. Grouped by (status, life) — concrete/unknown rows collapse to one update each, only
// the handful of steel structures get individual screens. No-op once every row is screened.
async function backfillFatigue () {
  const COLS = ['ID', 'material', 'superstructureMaterial', 'yearBuilt', 'transportMode', 'fatigueDetailCategory']
  try {
    await cds.tx({ user: cds.User.privileged }, async (tx) => {
      const pending = await tx.run(SELECT.one.from('bridge.management.Bridges').columns('ID').where('fatigueScreeningStatus is null'))
      if (!pending) return
      const rows = await tx.run(SELECT.from('bridge.management.Bridges').columns(...COLS).where('fatigueScreeningStatus is null'))
      const groups = new Map()
      for (const b of rows) {
        const fat = screenFatigue(b)
        const key = `${fat.status}|${fat.estimatedFatigueLifeYears}`
        if (!groups.has(key)) groups.set(key, { status: fat.status, life: fat.estimatedFatigueLifeYears, ids: [] })
        groups.get(key).ids.push(b.ID)
      }
      for (const g of groups.values()) {
        await tx.run(UPDATE('bridge.management.Bridges')
          .set({ fatigueScreeningStatus: g.status, estimatedFatigueLifeYears: g.life })
          .where({ ID: { in: g.ids } }))
      }
      LOG.info(`demo-seed: backfilled fatigue screen on ${rows.length} bridges (${groups.size} groups)`)
    })
  } catch (e) { LOG.warn('demo-seed: fatigue backfill skipped (' + e.message + ')') }
}

/*
 * Loads the NSW open-data register (≈1,238 OpenStreetMap bridges/culverts + 72 heavy-vehicle
 * restrictions) ALONGSIDE the 12 curated demo bridges, so the deployed register/map/Data-Quality
 * show real NSW data at scale. Idempotent via the `dataSource LIKE 'OpenStreetMap%'` marker; the
 * 1.5 MB data file is required only when actually seeding (after the marker check). IDs are 1013+
 * (no clash with the curated 1001–1012). Inserts are chunked for HANA.
 */
async function seedNsw () {
  try {
    await cds.tx({ user: cds.User.privileged }, async (tx) => {
      const present = await tx.run(SELECT.one.from('bridge.management.Bridges').columns('ID').where("dataSource like 'OpenStreetMap%'"))
      if (present) { LOG.info('demo-seed: NSW open data already present — skipping'); return }
      let nsw
      try { nsw = require('./demo-seed-nsw.data.json') } catch { LOG.warn('demo-seed: NSW data file missing — skipping'); return }
      enrichDataQuality(nsw.bridges)
      const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
      for (const part of chunk(nsw.bridges, 250)) await tx.run(INSERT.into('bridge.management.Bridges').entries(part))
      if (nsw.restrictions && nsw.restrictions.length) await tx.run(INSERT.into('bridge.management.Restrictions').entries(nsw.restrictions))
      LOG.info(`demo-seed: loaded ${nsw.bridges.length} NSW open-data bridges + ${(nsw.restrictions || []).length} HV restrictions`)
    })
  } catch (e) {
    LOG.error('demo-seed NSW failed (non-fatal):', e.message)
  }
}

module.exports = { seedDemoData }
