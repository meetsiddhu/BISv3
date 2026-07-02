'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Risk model store — the bridge between the RELATIONAL governed RiskModel (db/risk-model.cds)
// and the risk engine (srv/lib/risk.js). The engine keeps its shape: it consumes RiskConfig-shaped
// weight rows ({factor,weight,active}) and RiskBand-shaped band rows ({code,name,minScore,…}).
// This module resolves those FROM the active model's rows (loadActiveModel, per-class aware),
// serialises an edited config back INTO rows (saveToModel), idempotently seeds a default model
// migrating the legacy global RiskConfig/RiskBand (ensureSeed), and clones/activates versions via
// the shared governed-config plugin. See docs/CONFIGURABLE-ENGINES-ASSESSMENT.md §5/§6.
// ─────────────────────────────────────────────────────────────────────────────
const cds = require('@sap/cds')
const { SELECT, INSERT, DELETE, UPDATE } = cds.ql
const riskLib = require('./risk')
const gc = require('./plugins/governed-config')

const M = 'bridge.management.RiskModel'
const F = 'bridge.management.RiskModelFactor'
const B = 'bridge.management.RiskModelBand'
const CFG = 'bridge.management.RiskConfig'
const BND = 'bridge.management.RiskBand'
const LOG = cds.log('risk-model-store')
const WILDCARD = '*'

// ── PURE: resolve the effective factor weights for a class (per-factor precedence: class → '*') ──
// Returns RiskConfig-shaped rows the engine's weightsFromConfig() understands.
function resolveFactorRows (factors, assetClass = WILDCARD) {
  const byKey = new Map() // factorKey -> chosen row
  for (const r of factors || []) {
    if (!r || !r.factorKey) continue
    const cls = r.assetClass || WILDCARD
    const cur = byKey.get(r.factorKey)
    // prefer an exact class match over a '*' default
    if (!cur || (cls === assetClass && (cur._cls !== assetClass))) byKey.set(r.factorKey, Object.assign({ _cls: cls }, r))
  }
  return [...byKey.values()].map(r => ({ factor: r.factorKey, name: r.name, weight: r.weight, active: true }))
}

// ── PURE: resolve the effective band ladder for a class (class band-set if any, else '*') ──
// Returns RiskBand-shaped rows the engine's bandsFromConfig() understands.
function resolveBandRows (bands, assetClass = WILDCARD) {
  const classBands = (bands || []).filter(b => (b.assetClass || WILDCARD) === assetClass)
  const use = classBands.length ? classBands : (bands || []).filter(b => (b.assetClass || WILDCARD) === WILDCARD)
  return use.map(b => ({ code: b.code, name: b.name, minScore: b.minScore, maxScore: b.maxScore, active: true, sortOrder: b.sortOrder, colour: b.colour, rationale: b.rationale }))
}

// ── PURE: an edited config → relational rows for `modelId` (assetClass defaults to '*') ──
function rowsFromConfig (config, { modelId, genId }) {
  if (!modelId || typeof genId !== 'function') throw new Error('rowsFromConfig requires { modelId, genId }')
  const factors = (config.factors || []).map(f => ({
    ID: genId(), model_ID: modelId, assetClass: f.assetClass || WILDCARD,
    factorKey: f.factorKey, name: f.name, weight: Number(f.weight)
  })).filter(f => f.factorKey && Number.isFinite(f.weight))
  const bands = (config.bands || []).map(b => ({
    ID: genId(), model_ID: modelId, assetClass: b.assetClass || WILDCARD,
    code: b.code, name: b.name, minScore: Number(b.minScore),
    maxScore: b.maxScore == null || b.maxScore === '' ? null : Number(b.maxScore),
    colour: b.colour, sortOrder: Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0,
    rationale: b.rationale, reviewedBy: b.reviewedBy, reviewedAt: b.reviewedAt, reviewSource: b.reviewSource
  })).filter(b => b.code && Number.isFinite(b.minScore))
  return { factors, bands }
}

// ── DB: load the active model → engine-shaped weight + band rows (per-class), null if none ──
async function loadActiveModel (db, assetClass = WILDCARD) {
  const model = await db.run(SELECT.one.from(M).where({ status: 'Active' }).orderBy('modifiedAt desc'))
  if (!model) return null
  const factors = await db.run(SELECT.from(F).where({ model_ID: model.ID }))
  const bands = await db.run(SELECT.from(B).where({ model_ID: model.ID }))
  return { model, factors, bands, factorRows: resolveFactorRows(factors, assetClass), bandRows: resolveBandRows(bands, assetClass) }
}

// ── DB: load one model (by id) with its raw factor + band rows (for the editor) ──
async function loadModel (db, modelID) {
  const model = modelID && await db.run(SELECT.one.from(M).where({ ID: modelID }))
  if (!model) return null
  const factors = await db.run(SELECT.from(F).where({ model_ID: model.ID }))
  const bands = await db.run(SELECT.from(B).where({ model_ID: model.ID }))
  return { model, factors, bands }
}

// ── DB: list every model version (for the picker) ──
async function listModels (db) {
  const rows = await db.run(SELECT.from(M).columns('ID', 'code', 'name', 'version', 'status', 'isTemplate', 'clonedFrom', 'modifiedAt', 'modifiedBy'))
  return (rows || []).sort((a, b) =>
    (a.status === 'Active' ? -1 : b.status === 'Active' ? 1 : 0) ||
    String(a.code).localeCompare(String(b.code)) || (b.version - a.version))
}

// ── DB: idempotent seed of the default Active model (migrating legacy global RiskConfig/RiskBand) ──
async function ensureSeed (db, { changedBy = 'system' } = {}) {
  const existing = await db.run(SELECT.one.from(M))
  if (existing) return { seeded: false }
  let cfgRows = []
  let bandRows = []
  try { cfgRows = await db.run(SELECT.from(CFG)) } catch (_e) { /* bare test db */ }
  try { bandRows = await db.run(SELECT.from(BND)) } catch (_e) { /* bare test db */ }
  const migrated = !!(cfgRows && cfgRows.length) || !!(bandRows && bandRows.length)
  // factors: from RiskConfig, else engine DEFAULT_WEIGHTS
  const factors = (cfgRows && cfgRows.length)
    ? cfgRows.filter(r => r.active !== false).map(r => ({ factorKey: r.factor, name: r.name, weight: Number(r.weight) }))
    : Object.entries(riskLib.DEFAULT_WEIGHTS).map(([k, w]) => ({ factorKey: k, name: k, weight: Number(w) }))
  // bands: from RiskBand, else engine RISK_BANDS (construct code/max)
  let bands
  if (bandRows && bandRows.length) {
    bands = bandRows.filter(r => r.active !== false).map(r => ({ code: r.code, name: r.name, minScore: Number(r.minScore), maxScore: r.maxScore == null ? null : Number(r.maxScore), colour: r.colour, sortOrder: r.sortOrder, rationale: r.rationale, reviewedBy: r.reviewedBy, reviewedAt: r.reviewedAt, reviewSource: r.reviewSource }))
  } else {
    const sorted = [...riskLib.RISK_BANDS].sort((a, b) => b.min - a.min)
    bands = sorted.map((b, i) => ({ code: String(b.name).replace(/\s+/g, ''), name: b.name, minScore: b.min, maxScore: i === 0 ? 100 : sorted[i - 1].min - 0.01, sortOrder: i }))
  }
  const modelId = cds.utils.uuid()
  await db.run(INSERT.into(M).entries({
    ID: modelId, code: 'RISK-DEFAULT', name: 'Default risk model', version: 1, status: 'Active', isTemplate: false,
    description: 'Governed risk weighting factors + band thresholds.',
    reviewSource: migrated ? 'Migrated from RiskConfig / RiskBand' : 'Engine defaults (risk.js)'
  }))
  const { factors: fRows, bands: bRows } = rowsFromConfig({ factors, bands }, { modelId, genId: cds.utils.uuid })
  if (fRows.length) await db.run(INSERT.into(F).entries(fRows))
  if (bRows.length) await db.run(INSERT.into(B).entries(bRows))
  LOG.info('seeded default RiskModel', { modelId, migrated, factors: fRows.length, bands: bRows.length })
  return { seeded: true, modelId, migrated }
}

// ── DB: replace ONE model's factor + band rows (the admin edit path) ──
async function saveToModel (db, modelID, config, { changedBy = 'system' } = {}) {
  const model = await db.run(SELECT.one.from(M).where({ ID: modelID }))
  if (!model) throw new Error('RiskModel not found: ' + modelID)
  if (model.status === 'Retired') throw new Error('cannot edit a Retired risk version — clone it first')
  await db.run(DELETE.from(F).where({ model_ID: modelID }))
  await db.run(DELETE.from(B).where({ model_ID: modelID }))
  const { factors, bands } = rowsFromConfig(config, { modelId: modelID, genId: cds.utils.uuid })
  if (factors.length) await db.run(INSERT.into(F).entries(factors))
  if (bands.length) await db.run(INSERT.into(B).entries(bands))
  await db.run(UPDATE(M).set({ modifiedAt: new Date().toISOString(), modifiedBy: changedBy }).where({ ID: modelID }))
  return { modelID, factors: factors.length, bands: bands.length }
}

// ── DB: clone a model into a new Draft version (governed change path) ──
async function cloneModel (db, modelID, { name, changedBy = 'system' } = {}) {
  const model = await db.run(SELECT.one.from(M).where({ ID: modelID }))
  if (!model) throw new Error('RiskModel not found: ' + modelID)
  const factors = await db.run(SELECT.from(F).where({ model_ID: modelID }))
  const bands = await db.run(SELECT.from(B).where({ model_ID: modelID }))
  const siblingRows = await db.run(SELECT.from(M).columns('version').where({ code: model.code }))
  const cloned = gc.cloneTree({ model, children: [], genId: cds.utils.uuid, siblingVersions: (siblingRows || []).map(r => r.version), overrides: name ? { name } : {} })
  const newId = cloned.newModelId
  const stripChild = (rows) => (rows || []).map(r => Object.assign(gc.stripFramework(r), { ID: cds.utils.uuid(), model_ID: newId }))
  await db.run(INSERT.into(M).entries(cloned.model))
  const fRows = stripChild(factors); const bRows = stripChild(bands)
  if (fRows.length) await db.run(INSERT.into(F).entries(fRows))
  if (bRows.length) await db.run(INSERT.into(B).entries(bRows))
  await _log(db, { objectId: newId, objectName: `${cloned.model.code} v${cloned.model.version} (clone)`, changedBy,
    reason: 'Risk model cloned to a new Draft version',
    changes: [{ fieldName: 'clonedFrom', oldValue: '', newValue: String(modelID) }, { fieldName: 'version', oldValue: String(model.version), newValue: String(cloned.model.version) }, { fieldName: 'status', oldValue: '', newValue: 'Draft' }] })
  LOG.info('cloned RiskModel', { from: modelID, to: newId, version: cloned.model.version })
  return { modelID: newId, code: cloned.model.code, name: cloned.model.name, version: cloned.model.version, status: 'Draft', factors: fRows.length, bands: bRows.length }
}

// ── DB: activate a model version (retiring same-code siblings) ──
async function activateModel (db, modelID, { changedBy = 'system' } = {}) {
  const models = await db.run(SELECT.from(M).columns('ID', 'code', 'status', 'version'))
  const plan = gc.activationPlan(models, modelID)
  if (!plan.ok) throw new Error('RiskModel not found: ' + modelID)
  const now = new Date().toISOString()
  if (plan.retire.length) await db.run(UPDATE(M).set({ status: 'Retired', modifiedAt: now, modifiedBy: changedBy }).where({ ID: { in: plan.retire } }))
  await db.run(UPDATE(M).set({ status: 'Active', modifiedAt: now, modifiedBy: changedBy }).where({ ID: modelID }))
  const activated = models.find(m => m.ID === modelID)
  await _log(db, { objectId: modelID, objectName: `${activated.code} v${activated.version} (activate)`, changedBy,
    reason: 'Risk model version activated',
    changes: [{ fieldName: 'status', oldValue: activated.status, newValue: 'Active' }, { fieldName: 'retired', oldValue: '', newValue: plan.retire.join(',') }] })
  LOG.info('activated RiskModel', { modelID, retired: plan.retire })
  return { modelID, activated: activated.code, version: activated.version, retired: plan.retire.length }
}

async function _log (db, { objectId, objectName, changedBy, reason, changes }) {
  try {
    const { writeChangeLogs } = require('../audit-log')
    await writeChangeLogs(db, { objectType: 'RiskModel', objectId: String(objectId), objectName, source: 'AdminService', batchId: cds.utils.uuid(), changedBy, changeReason: reason, changes })
  } catch (_e) { /* audit best-effort */ }
}

module.exports = { resolveFactorRows, resolveBandRows, rowsFromConfig, loadActiveModel, loadModel, listModels, ensureSeed, saveToModel, cloneModel, activateModel, M, F, B }
