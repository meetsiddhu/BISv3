'use strict'

// ─────────────────────────────────────────────────────────────────────────────
// Assessment-vehicle library seed (HV-1)
//
// Reference design vehicles + common heavy-vehicle/permit configurations used by
// the HV structural-assessment module (srv/lib/hv-assessment.js). axleGroups is a
// JSON array of { type, massT, spacingM } where spacingM is the distance to the NEXT
// group. Masses/spacings are representative published-practice values; an engineer
// calibrates per network. Insert-if-missing on fixed UUIDs ('6' namespace), ChangeLogged.
// ─────────────────────────────────────────────────────────────────────────────

const cds = require('@sap/cds')
const { SELECT, INSERT, UPDATE } = cds.ql
const { writeChangeLogs } = require('../audit-log')

const NS = 'bridge.management.'
const TABLE = 'AssessmentVehicles'
const uid = (seq) => `00000000-0000-4000-6000-${String(seq).padStart(12, '0')}`

const VEHICLES = [
  {
    code: 'GML-SEMI', name: 'GML semi-trailer (42.5 t)', category: 'GML', gvmTonnes: 42.5,
    overallLengthM: 19.0, overallWidthM: 2.5, overallHeightM: 4.3,
    standardRef: 'NHVR General Mass Limits',
    axleGroups: [{ type: 'steer', massT: 6.0, spacingM: 4.0 }, { type: 'tandem', massT: 16.5, spacingM: 6.0 }, { type: 'tri', massT: 20.0, spacingM: 0 }],
    description: 'Standard 6-axle articulated semi-trailer at general mass limits.'
  },
  {
    code: 'HML-SEMI', name: 'HML semi-trailer (45.5 t)', category: 'HML', gvmTonnes: 45.5,
    overallLengthM: 19.0, overallWidthM: 2.5, overallHeightM: 4.3,
    standardRef: 'NHVR Higher Mass Limits',
    axleGroups: [{ type: 'steer', massT: 6.5, spacingM: 4.0 }, { type: 'tandem', massT: 17.0, spacingM: 6.0 }, { type: 'tri', massT: 22.5, spacingM: 0 }],
    description: '6-axle semi at higher mass limits (road-friendly suspension).'
  },
  {
    code: 'HML-BDOUBLE', name: 'HML B-double (68.5 t)', category: 'HML', gvmTonnes: 68.5,
    overallLengthM: 26.0, overallWidthM: 2.5, overallHeightM: 4.6,
    standardRef: 'NHVR HML B-double',
    axleGroups: [{ type: 'steer', massT: 6.5, spacingM: 3.5 }, { type: 'tandem', massT: 17.0, spacingM: 4.5 }, { type: 'tri', massT: 22.5, spacingM: 6.0 }, { type: 'tri', massT: 22.5, spacingM: 0 }],
    description: '9-axle B-double at higher mass limits — the workhorse freight combination.'
  },
  {
    code: 'PBS-L2-30M', name: 'PBS Level 2 (30 m, 85.5 t)', category: 'PBS', gvmTonnes: 85.5,
    overallLengthM: 30.0, overallWidthM: 2.5, overallHeightM: 4.6,
    standardRef: 'PBS Level 2',
    axleGroups: [{ type: 'steer', massT: 6.5, spacingM: 3.5 }, { type: 'tandem', massT: 17.0, spacingM: 4.5 }, { type: 'tri', massT: 22.5, spacingM: 5.0 }, { type: 'tri', massT: 22.5, spacingM: 5.5 }, { type: 'tandem', massT: 17.0, spacingM: 0 }],
    description: 'Performance-Based Standards Level 2 combination (e.g. B-triple class).'
  },
  {
    code: 'ROADTRAIN-T1', name: 'Type 1 road train (79 t)', category: 'RoadTrain', gvmTonnes: 79.0,
    overallLengthM: 36.5, overallWidthM: 2.5, overallHeightM: 4.6,
    standardRef: 'NHVR Type 1 road train',
    axleGroups: [{ type: 'steer', massT: 6.0, spacingM: 4.0 }, { type: 'tandem', massT: 16.5, spacingM: 6.0 }, { type: 'tri', massT: 20.0, spacingM: 6.0 }, { type: 'tri', massT: 20.0, spacingM: 0 }],
    description: 'Type 1 road train — restricted-access (outer network) combination.'
  },
  {
    code: 'T44', name: 'T44 legacy design vehicle (44 t)', category: 'Reference', gvmTonnes: 44.0,
    overallLengthM: 14.5, overallWidthM: 2.5, overallHeightM: 4.6,
    standardRef: 'AS 5100 legacy T44',
    axleGroups: [{ type: 'single', massT: 6.0, spacingM: 3.7 }, { type: 'tandem', massT: 19.0, spacingM: 1.2 }, { type: 'tandem', massT: 19.0, spacingM: 0 }],
    description: 'Legacy AS 5100 design vehicle — useful for rating-vehicle comparison.'
  },
  {
    code: 'SM1600-REF', name: 'SM1600 reference load model', category: 'Reference', gvmTonnes: 144.0,
    overallLengthM: 25.0, overallWidthM: 2.5, overallHeightM: 4.6,
    standardRef: 'AS 5100.2 SM1600',
    axleGroups: [{ type: 'tri', massT: 36.0, spacingM: 6.25 }, { type: 'tri', massT: 36.0, spacingM: 6.25 }, { type: 'tri', massT: 36.0, spacingM: 6.25 }, { type: 'tri', massT: 36.0, spacingM: 0 }],
    description: 'AS 5100.2 SM1600 stationary load model (reference design envelope, not a real vehicle).'
  },
  // ── RAIL load models (council fix #3) — applicableModes 'Rail' so they are only ever
  //    assessed against rail structures; the road bridge-formula/axle checks are
  //    not-assessable for these (honest), with the rating-factor gate governing.
  {
    code: '300LA', name: '300LA rail traffic load model', category: 'RailLoadModel', gvmTonnes: 122.4,
    overallLengthM: 20.0, overallWidthM: 3.0, overallHeightM: 5.5, applicableModes: 'Rail',
    standardRef: 'AS 5100.2 300LA',
    axleGroups: [{ type: 'single', massT: 30.6, spacingM: 1.7 }, { type: 'single', massT: 30.6, spacingM: 1.1 }, { type: 'single', massT: 30.6, spacingM: 1.7 }, { type: 'single', massT: 30.6, spacingM: 0 }],
    description: 'AS 5100.2 300LA rail traffic load model — four 300 kN axles plus 60 kN/m distributed load (reference rail design envelope, not a vehicle).'
  },
  {
    code: '300LA-HEAVY', name: '300LA heavy-haul derivative', category: 'RailLoadModel', gvmTonnes: 137.7,
    overallLengthM: 20.0, overallWidthM: 3.0, overallHeightM: 5.5, applicableModes: 'Rail',
    standardRef: 'AS 5100.2 300LA (heavy-haul factor)',
    axleGroups: [{ type: 'single', massT: 34.4, spacingM: 1.7 }, { type: 'single', massT: 34.4, spacingM: 1.1 }, { type: 'single', massT: 34.4, spacingM: 1.7 }, { type: 'single', massT: 34.4, spacingM: 0 }],
    description: 'Heavy-haul derivative of 300LA (1.125 dynamic/heavy-haul factor) for freight-corridor screening.'
  }
]

const SEED = VEHICLES.map((v, i) => ({
  ID: uid(i + 1), code: v.code, name: v.name, category: v.category, gvmTonnes: v.gvmTonnes,
  axleGroups: JSON.stringify(v.axleGroups), overallLengthM: v.overallLengthM, overallWidthM: v.overallWidthM,
  overallHeightM: v.overallHeightM, standardRef: v.standardRef, description: v.description,
  applicableModes: v.applicableModes || 'Road', active: true
}))

async function ensureAssessmentVehicleSeed (db, { changedBy = 'system' } = {}) {
  const existing = await db.run(SELECT.from(NS + TABLE).columns('ID', 'code', 'applicableModes'))
  const have = new Set((existing || []).map(r => String(r.ID).toLowerCase()))
  // Council fix #3 backfill: rows that predate `applicableModes` (the already-deployed road
  // library) get it from the SEED by code, defaulting 'Road' — so the HV mode gate always has
  // a scope to enforce and a road model can never silently assess a rail structure. Idempotent
  // (only touches null rows). No ChangeLog noise: this is a one-time schema backfill.
  const byCode = new Map(SEED.map(s => [s.code, s.applicableModes || 'Road']))
  const needModes = (existing || []).filter(r => r.applicableModes == null && byCode.has(r.code))
  for (const r of needModes) {
    await db.run(UPDATE(NS + TABLE).set({ applicableModes: byCode.get(r.code) }).where({ ID: r.ID }))
  }
  const missing = SEED.filter(r => !have.has(String(r.ID).toLowerCase()))
  if (!missing.length) return { inserted: 0, modesBackfilled: needModes.length }
  await db.run(INSERT.into(NS + TABLE).entries(missing))
  await writeChangeLogs(db, {
    objectType: 'Lookup', objectId: TABLE, objectName: `${TABLE} (assessment-vehicle seed)`,
    source: 'Calibration', batchId: cds.utils.uuid(), changedBy,
    changes: missing.map(r => ({ fieldName: String(r.ID), oldValue: '', newValue: r.code }))
  })
  return { inserted: missing.length, modesBackfilled: needModes.length }
}

module.exports = { SEED, VEHICLES, ensureAssessmentVehicleSeed }
