'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE PLUGIN: governed-config — the lifecycle mechanics of a versioned, templated,
// admin-governed configuration model (clone → tune → activate, with per-class/per-mode
// precedence resolution). INDEPENDENT: imports no other plugin and — deliberately — no
// `@sap/cds`. Every function here is PURE (data in → data out); the service layer applies
// the returned plans to the database. That keeps the plugin portable (drop it into any CAP
// app), trivially unit-testable, and free of side effects. Backed by the `governedModel`
// aspect in ./governed-config-schema.cds. No BIS specifics.
//
// This generalises the proven PrioritisationModel clone/version/activate pattern so BHI and
// Risk can adopt the SAME governance without re-implementing it (see
// docs/CONFIGURABLE-ENGINES-ASSESSMENT.md §6).
// ─────────────────────────────────────────────────────────────────────────────

// Managed/key fields that must NOT be copied when cloning a row (a clone gets fresh ones).
const DEFAULT_FRAMEWORK_FIELDS = ['ID', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy']
const WILDCARD = '*'

// Next version number for a model code: max(existing) + 1, or 1 when none exist.
function nextVersion (versions) {
  const nums = (versions || []).map(v => Number(v)).filter(Number.isFinite)
  return (nums.length ? Math.max(...nums) : 0) + 1
}

// Strip framework/key fields off a row so it can be re-inserted as a fresh copy.
function stripFramework (row, frameworkFields = DEFAULT_FRAMEWORK_FIELDS) {
  const c = Object.assign({}, row)
  for (const k of frameworkFields) delete c[k]
  return c
}

// Deep-copy a governed model + its flat child rows into a NEW Draft (pure; no DB).
// - model:      the source model row
// - children:   child rows that reference the model by `parentFkField` (e.g. weight rows)
// - genId:      () => uuid  (injected so the plugin stays dependency-free + deterministic in tests)
// - overrides:  fields to force on the new model (merged last)
// Returns { model, children, newModelId } ready for INSERT. The new model is always Draft,
// version-bumped, clonedFrom-stamped, and review fields reset (a clone is not signed off).
function cloneTree ({ model, children = [], genId, overrides = {}, frameworkFields, parentFkField = 'model_ID', siblingVersions } = {}) {
  if (!model || typeof genId !== 'function') throw new Error('cloneTree requires { model, genId }')
  const newModelId = genId()
  const version = nextVersion(siblingVersions != null ? siblingVersions : [model.version])
  const newModel = Object.assign(
    stripFramework(model, frameworkFields),
    {
      ID: newModelId,
      version,
      status: 'Draft',
      isTemplate: false,
      clonedFrom: model.ID || null,
      reviewedBy: null,
      reviewedAt: null
    },
    overrides
  )
  const newChildren = (children || []).map(row =>
    Object.assign(stripFramework(row, frameworkFields), { ID: genId(), [parentFkField]: newModelId }))
  return { model: newModel, children: newChildren, newModelId }
}

// Per-class / per-mode precedence resolution — the SAME ladder prioritisation uses:
//   (assetClass, mode) → (assetClass, '*') → ('*', mode) → ('*', '*') → null
// `rows` each carry a class + a mode value (field names configurable). Returns the most
// specific matching row, or null. Pure.
function precedenceResolve (rows, { assetClass, mode, classKey = 'assetClass', modeKey = 'mode', wildcard = WILDCARD } = {}) {
  if (!Array.isArray(rows) || !rows.length) return null
  const find = (cls, mo) => rows.find(r => (r[classKey] ?? wildcard) === cls && (r[modeKey] ?? wildcard) === mo) || null
  const ladder = [
    [assetClass, mode],
    [assetClass, wildcard],
    [wildcard, mode],
    [wildcard, wildcard]
  ]
  for (const [c, m] of ladder) {
    if (c == null || m == null) continue
    const hit = find(c, m)
    if (hit) return hit
  }
  return null
}

// Activation plan for making one model version the Active one: which model to activate and
// which sibling versions (same code, currently Active) to retire. Pure — caller applies it.
function activationPlan (models, targetID, { codeOf = m => m.code, statusOf = m => m.status } = {}) {
  const target = (models || []).find(m => m.ID === targetID)
  if (!target) return { ok: false, reason: 'not-found' }
  const retire = (models || [])
    .filter(m => m.ID !== targetID && codeOf(m) === codeOf(target) && statusOf(m) === 'Active')
    .map(m => m.ID)
  return { ok: true, activate: targetID, retire }
}

module.exports = {
  DEFAULT_FRAMEWORK_FIELDS,
  WILDCARD,
  nextVersion,
  stripFramework,
  cloneTree,
  precedenceResolve,
  activationPlan
}
