'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// BHI model store — the bridge between the RELATIONAL governed BhiModel (db/bhi-model.cds)
// and the PURE compute engine (srv/lib/bhi.js). The engine keeps its shape: it consumes the
// {modeWeights, env, calibrated, classModeWeights} object resolveBhiConfig already understands.
// This module assembles that object FROM the active model's rows (loadActiveConfig), serialises
// a config back INTO rows (saveToActive), and idempotently seeds a default Active model
// (ensureSeed) — migrating any legacy SystemConfig 'bhiWeights' JSON override in the process.
//
// The two transforms (configFromRows / rowsFromConfig) are PURE + exported for unit testing.
// See docs/CONFIGURABLE-ENGINES-ASSESSMENT.md §4.2 / §6.
// ─────────────────────────────────────────────────────────────────────────────
const cds = require('@sap/cds')
const { SELECT, INSERT, DELETE, UPDATE } = cds.ql
const bhiLib = require('./bhi')
const gc = require('./plugins/governed-config') // reusable clone/version/activate lifecycle

const M = 'bridge.management.BhiModel'
const W = 'bridge.management.BhiWeight'
const C = 'bridge.management.BhiCoefficient'
const SYSCFG = 'bridge.management.SystemConfig'
const LOG = cds.log('bhi-model-store')

// ── PURE: relational rows → the engine's config object (pre-normalisation) ──
// assetClass '*' rows are the per-mode defaults (+ carry the per-mode `calibrated` flag);
// real-assetClass rows are per-class overrides.
function configFromRows ({ weights = [], coefficients = [] } = {}) {
  const modeWeights = {}, classModeWeights = {}, calibrated = new Set()
  for (const w of weights) {
    const cls = w.assetClass || '*'
    const mode = w.mode
    const val = Number(w.weight)
    if (!mode || !w.bucket || !Number.isFinite(val)) continue
    if (cls === '*') {
      (modeWeights[mode] = modeWeights[mode] || {})[w.bucket] = val
      if (w.calibrated) calibrated.add(mode)
    } else {
      const perMode = (classModeWeights[cls] = classModeWeights[cls] || {})
      ;(perMode[mode] = perMode[mode] || {})[w.bucket] = val
    }
  }
  const env = {}
  for (const c of coefficients) {
    const v = Number(c.coeffValue)
    if (c.coeffKey && Number.isFinite(v)) env[c.coeffKey] = v
  }
  return { modeWeights, env, calibrated: [...calibrated], classModeWeights }
}

// ── PURE: an engine config object → relational rows for `modelId` ──
// Normalises through resolveBhiConfig first (defaults merged, junk dropped) so the stored rows
// are the canonical, complete set. genId is injected (cds.utils.uuid in prod, deterministic in tests).
function rowsFromConfig (rawConfig, { modelId, genId }) {
  if (!modelId || typeof genId !== 'function') throw new Error('rowsFromConfig requires { modelId, genId }')
  const cfg = bhiLib.resolveBhiConfig(rawConfig)
  const calibrated = new Set(cfg.calibrated || [])
  const weights = []
  for (const [mode, buckets] of Object.entries(cfg.modeWeights || {})) {
    for (const [bucket, val] of Object.entries(buckets)) {
      weights.push({ ID: genId(), model_ID: modelId, assetClass: '*', mode, bucket, weight: Number(val), calibrated: calibrated.has(mode) })
    }
  }
  for (const [cls, perMode] of Object.entries(cfg.classModeWeights || {})) {
    for (const [mode, buckets] of Object.entries(perMode)) {
      for (const [bucket, val] of Object.entries(buckets)) {
        weights.push({ ID: genId(), model_ID: modelId, assetClass: cls, mode, bucket, weight: Number(val), calibrated: false })
      }
    }
  }
  const coefficients = Object.entries(cfg.env || {}).map(([coeffKey, coeffValue]) =>
    ({ ID: genId(), model_ID: modelId, coeffKey, coeffValue: Number(coeffValue) }))
  return { weights, coefficients }
}

// ── DB: load the active model + assemble its normalised config (null if no model) ──
async function loadActiveConfig (db) {
  const model = await db.run(SELECT.one.from(M).where({ status: 'Active' }).orderBy('modifiedAt desc'))
  if (!model) return null
  const weights = await db.run(SELECT.from(W).where({ model_ID: model.ID }))
  const coefficients = await db.run(SELECT.from(C).where({ model_ID: model.ID }))
  return { model, config: bhiLib.resolveBhiConfig(configFromRows({ weights, coefficients })) }
}

// ── DB: idempotent seed of the default Active model (migrating any legacy JSON override) ──
async function ensureSeed (db, { changedBy = 'system' } = {}) {
  const existing = await db.run(SELECT.one.from(M))
  if (existing) return { seeded: false }
  // Base = engine defaults, with any legacy SystemConfig 'bhiWeights' override folded in.
  let legacy = null
  try { legacy = await db.run(SELECT.one.from(SYSCFG).where({ configKey: 'bhiWeights' })) } catch (_e) { /* SystemConfig may not exist in a bare test db */ }
  const base = bhiLib.resolveBhiConfig(legacy && legacy.value)
  const modelId = cds.utils.uuid()
  await db.run(INSERT.into(M).entries({
    ID: modelId, code: 'BHI-DEFAULT', name: 'Default BHI weight set', version: 1,
    status: 'Active', isTemplate: false,
    description: 'Governed BSI/BHI element weights + coefficients. Seeded from the engine defaults.',
    reviewSource: legacy && legacy.value ? 'Migrated from SystemConfig bhiWeights' : 'Engine defaults (bhi.js)'
  }))
  const { weights, coefficients } = rowsFromConfig(base, { modelId, genId: cds.utils.uuid })
  if (weights.length) await db.run(INSERT.into(W).entries(weights))
  if (coefficients.length) await db.run(INSERT.into(C).entries(coefficients))
  LOG.info('seeded default BhiModel', { modelId, migrated: !!(legacy && legacy.value), weights: weights.length, coefficients: coefficients.length })
  return { seeded: true, modelId, migrated: !!(legacy && legacy.value) }
}

// ── DB: list every model version (for the admin version picker) ──
async function listModels (db) {
  const rows = await db.run(SELECT.from(M).columns('ID', 'code', 'name', 'version', 'status', 'isTemplate', 'clonedFrom', 'modifiedAt', 'modifiedBy'))
  // Active first, then by code + version desc — the natural "which one is live" ordering.
  return (rows || []).sort((a, b) =>
    (a.status === 'Active' ? -1 : b.status === 'Active' ? 1 : 0) ||
    String(a.code).localeCompare(String(b.code)) || (b.version - a.version))
}

// ── DB: load one model (by id) + assemble its config; null if not found ──
async function loadConfig (db, modelID) {
  const model = modelID && await db.run(SELECT.one.from(M).where({ ID: modelID }))
  if (!model) return null
  const weights = await db.run(SELECT.from(W).where({ model_ID: model.ID }))
  const coefficients = await db.run(SELECT.from(C).where({ model_ID: model.ID }))
  return { model, config: bhiLib.resolveBhiConfig(configFromRows({ weights, coefficients })) }
}

// ── DB: replace ONE model's rows from a config object (the admin edit path) ──
// Returns the model id written. Refuse to edit a Retired version (governance).
async function saveToModel (db, modelID, rawConfig, { changedBy = 'system' } = {}) {
  const model = await db.run(SELECT.one.from(M).where({ ID: modelID }))
  if (!model) throw new Error('BhiModel not found: ' + modelID)
  if (model.status === 'Retired') throw new Error('cannot edit a Retired BHI version — clone it first')
  await db.run(DELETE.from(W).where({ model_ID: modelID }))
  await db.run(DELETE.from(C).where({ model_ID: modelID }))
  const { weights, coefficients } = rowsFromConfig(rawConfig, { modelId: modelID, genId: cds.utils.uuid })
  if (weights.length) await db.run(INSERT.into(W).entries(weights))
  if (coefficients.length) await db.run(INSERT.into(C).entries(coefficients))
  await db.run(UPDATE(M).set({ modifiedAt: new Date().toISOString(), modifiedBy: changedBy }).where({ ID: modelID }))
  return { modelID, weights: weights.length, coefficients: coefficients.length }
}

// ── DB: replace the ACTIVE model's rows (seeding a default first if none) ──
async function saveToActive (db, rawConfig, { changedBy = 'system' } = {}) {
  let active = await db.run(SELECT.one.from(M).where({ status: 'Active' }).orderBy('modifiedAt desc'))
  if (!active) { await ensureSeed(db, { changedBy }); active = await db.run(SELECT.one.from(M).where({ status: 'Active' }).orderBy('modifiedAt desc')) }
  if (!active) throw new Error('no active BhiModel to write')
  return saveToModel(db, active.ID, rawConfig, { changedBy })
}

// ── DB: clone a model into a NEW Draft version (the governed change path) ──
// Deep-copies the model + its weight/coefficient rows with fresh ids, version = max+1 for the
// code, status Draft, clonedFrom set (via the reusable governed-config cloneTree). ChangeLogged.
async function cloneModel (db, modelID, { name, changedBy = 'system' } = {}) {
  const model = await db.run(SELECT.one.from(M).where({ ID: modelID }))
  if (!model) throw new Error('BhiModel not found: ' + modelID)
  const weights = await db.run(SELECT.from(W).where({ model_ID: modelID }))
  const coefficients = await db.run(SELECT.from(C).where({ model_ID: modelID }))
  const siblingRows = await db.run(SELECT.from(M).columns('version').where({ code: model.code }))
  const siblingVersions = (siblingRows || []).map(r => r.version)
  // clone the model + each child group; cloneTree resets governance + re-parents children.
  const cloned = gc.cloneTree({ model, children: [], genId: cds.utils.uuid, siblingVersions, overrides: name ? { name } : {} })
  const newId = cloned.newModelId
  const stripChild = (rows, extra) => (rows || []).map(r => Object.assign(gc.stripFramework(r), { ID: cds.utils.uuid(), model_ID: newId }, extra))
  await db.run(INSERT.into(M).entries(cloned.model))
  const wRows = stripChild(weights)
  const cRows = stripChild(coefficients)
  if (wRows.length) await db.run(INSERT.into(W).entries(wRows))
  if (cRows.length) await db.run(INSERT.into(C).entries(cRows))
  await _log(db, { objectId: newId, objectName: `${cloned.model.code} v${cloned.model.version} (clone)`, changedBy,
    reason: 'BHI model cloned to a new Draft version',
    changes: [{ fieldName: 'clonedFrom', oldValue: '', newValue: String(modelID) }, { fieldName: 'version', oldValue: String(model.version), newValue: String(cloned.model.version) }, { fieldName: 'status', oldValue: '', newValue: 'Draft' }] })
  LOG.info('cloned BhiModel', { from: modelID, to: newId, code: cloned.model.code, version: cloned.model.version })
  return { modelID: newId, code: cloned.model.code, name: cloned.model.name, version: cloned.model.version, status: 'Draft', weights: wRows.length, coefficients: cRows.length }
}

// ── DB: activate a model version (retiring same-code siblings) via governed-config activationPlan ──
async function activateModel (db, modelID, { changedBy = 'system' } = {}) {
  const models = await db.run(SELECT.from(M).columns('ID', 'code', 'status', 'version'))
  const plan = gc.activationPlan(models, modelID)
  if (!plan.ok) throw new Error('BhiModel not found: ' + modelID)
  const now = new Date().toISOString()
  if (plan.retire.length) await db.run(UPDATE(M).set({ status: 'Retired', modifiedAt: now, modifiedBy: changedBy }).where({ ID: { in: plan.retire } }))
  await db.run(UPDATE(M).set({ status: 'Active', modifiedAt: now, modifiedBy: changedBy }).where({ ID: modelID }))
  const activated = models.find(m => m.ID === modelID)
  await _log(db, { objectId: modelID, objectName: `${activated.code} v${activated.version} (activate)`, changedBy,
    reason: 'BHI model version activated',
    changes: [{ fieldName: 'status', oldValue: activated.status, newValue: 'Active' }, { fieldName: 'retired', oldValue: '', newValue: plan.retire.join(',') }] })
  LOG.info('activated BhiModel', { modelID, retired: plan.retire })
  return { modelID, activated: activated.code, version: activated.version, retired: plan.retire.length }
}

// ChangeLog helper (best-effort — audit must never block a config change).
async function _log (db, { objectId, objectName, changedBy, reason, changes }) {
  try {
    const { writeChangeLogs } = require('../audit-log')
    await writeChangeLogs(db, { objectType: 'BhiModel', objectId: String(objectId), objectName, source: 'AdminService', batchId: cds.utils.uuid(), changedBy, changeReason: reason, changes })
  } catch (_e) { /* audit best-effort */ }
}

module.exports = { configFromRows, rowsFromConfig, loadActiveConfig, loadConfig, listModels, ensureSeed, saveToActive, saveToModel, cloneModel, activateModel, M, W, C }
