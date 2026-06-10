const cds = require('@sap/cds')
const { SELECT } = cds.ql
const { writeChangeLogs } = require('./audit-log')
const { getConfig } = require('./system-config')
const engine = require('./lib/prioritisation')
const ruleEngine = require('./lib/prioritisation-rule-engine')
const bhiLib = require('./lib/bhi')
const { Pdf } = require('./lib/pdf')

// Bridge Prioritisation service. Every output is computed SERVER-SIDE from the inputs + the
// active config snapshot (clients never set scores), runs are APPEND-ONLY (no UPDATE/DELETE),
// and each run stores the exact param snapshot so it replays byte-identically. Bounded: reads
// Restrictions + register/condition in-process, READ-ONLY; never writes EAM; separate config
// (no fleet recompute hook). Feature-flag gated server-side.
module.exports = class PrioritisationService extends cds.ApplicationService {
  async init () {
    const { Assessments, Config } = this.entities
    const db = await cds.connect.to('db')
    const log = cds.log('bms')

    // Default-ON when the SystemConfig flag is unset; an explicit false/0/no disables CUD.
    const isEnabled = async () => {
      const v = await getConfig('prioritisationEnabled')
      return v === null || v === undefined ? true : (v === 'true' || v === '1' || v === 'yes')
    }

    // Active config row -> resolved numeric params (engine handles null/non-finite -> defaults).
    const activeConfigRow = async () => {
      try {
        return await db.run(SELECT.one.from('bridge.management.PrioritisationConfig')
          .where({ active: true }).orderBy({ modifiedAt: 'desc' }))
      } catch (e) { log.warn('PrioritisationConfig load failed; using engine defaults:', e.message); return null }
    }
    const activeConfig = async () => engine.resolveConfig(await activeConfigRow() || {})

    // ── RULE ENGINE: load Active models (full bundle) + resolve the model for an asset ──
    const loadActiveModels = async () => {
      const models = await db.run(SELECT.from('bridge.management.PrioritisationModel').where({ status: 'Active' }))
      for (const m of models) {
        m.criteria = await db.run(SELECT.from('bridge.management.ModelCriterion').where({ model_ID: m.ID, active: true }))
        const ids = m.criteria.map(c => c.ID)
        const binds = ids.length ? await db.run(SELECT.from('bridge.management.CriterionSourceBinding').where({ criterion_ID: { in: ids } })) : []
        const bands = ids.length ? await db.run(SELECT.from('bridge.management.CriterionValueBand').where({ criterion_ID: { in: ids } })) : []
        for (const c of m.criteria) {
          c.bindings = binds.filter(b => b.criterion_ID === c.ID).sort((a, b) => String(a.ID).localeCompare(String(b.ID)))
          c.bands = bands.filter(b => b.criterion_ID === c.ID)
        }
        m.classWeights = await db.run(SELECT.from('bridge.management.AssetClassCriterionWeight').where({ model_ID: m.ID }))
        m.rules = await db.run(SELECT.from('bridge.management.AggregationRule').where({ model_ID: m.ID, active: true }))
        m.userTypeWeights = await db.run(SELECT.from('bridge.management.UserTypeCriterionWeight').where({ model_ID: m.ID }))
        m.userTypes = await db.run(SELECT.from('bridge.management.UserTypes').where({ active: true }))
      }
      return models
    }
    // Most-specific class/mode match wins; ties → highest version; ('*','*') is the legacy fallback.
    const resolveModelFor = (models, assetClass, transportMode) => {
      const PRE = [[assetClass || '*', transportMode || '*'], [assetClass || '*', '*'], ['*', transportMode || '*'], ['*', '*']]
      for (const [ac, tm] of PRE) {
        const hits = models.filter(m => (m.classWeights || []).some(w => (w.assetClass || '*') === ac && (w.transportMode || '*') === tm))
        if (hits.length) return hits.sort((a, b) => (b.version || 0) - (a.version || 0))[0]
      }
      return null
    }
    // Context bundle for the pure engine (no I/O inside the engine itself).
    const contextFor = async (bridge, manual) => {
      const bid = bridge.ID
      const [capacities, elements, defects, inspections, restrictions, attrRows] = await Promise.all([
        db.run(SELECT.from('bridge.management.BridgeCapacities').where({ bridge_ID: bid })),
        db.run(SELECT.from('bridge.management.BridgeElements').where({ bridge_ID: bid })),
        db.run(SELECT.from('bridge.management.BridgeDefects').where({ bridge_ID: bid })),
        db.run(SELECT.from('bridge.management.BridgeInspections').where({ bridge_ID: bid })),
        db.run(SELECT.from('bridge.management.BridgeRestrictions').where({ bridge_ID: bid, active: true })),
        db.run(SELECT.from('bridge.management.AttributeValues')
          .where({ objectType: { in: ['bridge', 'Bridge'] }, objectId: String(bid) }))
      ])
      const attributes = {}
      for (const a of attrRows) {
        attributes[a.attributeKey] = a.valueText ?? a.valueDecimal ?? a.valueInteger ?? (a.valueBoolean === null || a.valueBoolean === undefined ? null : String(a.valueBoolean)) ?? a.valueDate
      }
      return { bridge, manual, capacities, elements, defects, inspections, restrictions, attributes,
        asAtMonths: { default: monthsSince(bridge.lastInspectionDate) } }
    }
    // Idempotent ensure of the parameter-pack attribute DEFINITIONS (insert-if-missing only — a
    // CSV seed would TRUNCATE live attribute data on HDI deploy, so we never seed these tables).
    const PACK_ATTRS = [
      ['SCOUR_RATING', 'Scour rating (NBI Item 113)', 'Text'], ['FRACTURE_CRITICAL', 'Fracture-critical member', 'Boolean'],
      ['FATIGUE_REMAINING_LIFE', 'Fatigue remaining life (years)', 'Decimal'], ['SEISMIC_VULNERABILITY', 'Seismic vulnerability (1-5)', 'Integer'],
      ['EXPOSURE_CLASS', 'Environmental exposure class', 'Text'], ['LIFELINE_ROUTE', 'Network role (Lifeline/Strategic/Local)', 'Text'],
      ['DETOUR_LENGTH_KM', 'Detour length (km)', 'Decimal'], ['STRUCTURAL_REDUNDANCY', 'Structural redundancy (None/Partial/Full)', 'Text'],
      ['PT_SERVICES_COUNT', 'Public-transport services/day', 'Integer'], ['ACTIVE_TRANSPORT_EXPOSURE', 'Active-transport exposure (1-5)', 'Integer'],
      ['FREIGHT_VALUE_CLASS', 'Freight economic value (High/Medium/Low)', 'Text'], ['ISOLATION_POPULATION', 'Population isolated on failure', 'Integer'],
      ['CRITICAL_SERVICES_PROXIMITY', 'Critical services proximity', 'Text'], ['UTILITIES_COUNT', 'Third-party utilities carried', 'Integer'],
      ['OVER_OCCUPIED_SPACE', 'Over occupied space / platform (importance 1-4)', 'Integer'], ['HERITAGE_LISTING', 'Heritage listing (State/Local/None)', 'Text'],
      ['ENV_SENSITIVITY', 'Environmental sensitivity (High/Medium/Low)', 'Text'], ['CLIMATE_EXPOSURE_TREND', 'Climate exposure trend', 'Text'],
      ['INCIDENT_COUNT_5Y', 'Safety incidents (5 years)', 'Integer'], ['STATUTORY_OBLIGATION', 'Statutory/contractual obligation', 'Text']
    ]
    const ensurePackAttributes = async () => {
      try {
        let grp = await db.run(SELECT.one.from('bridge.management.AttributeGroups').where({ objectType: 'bridge', internalKey: 'PRIORITISATION' }))
        if (!grp) {
          grp = { ID: cds.utils.uuid(), objectType: 'bridge', name: 'Prioritisation parameters', internalKey: 'PRIORITISATION', displayOrder: 90, status: 'Active' }
          await db.run(cds.ql.INSERT.into('bridge.management.AttributeGroups').entries(grp))
        }
        const existing = await db.run(SELECT.from('bridge.management.AttributeDefinitions').columns('internalKey').where({ objectType: 'bridge' }))
        const have = new Set(existing.map(e => e.internalKey))
        const missing = PACK_ATTRS.filter(([k]) => !have.has(k))
        if (missing.length) {
          await db.run(cds.ql.INSERT.into('bridge.management.AttributeDefinitions').entries(missing.map(([k, n, t], i) => ({
            ID: cds.utils.uuid(), group_ID: grp.ID, objectType: 'bridge', name: n, internalKey: k, dataType: t,
            displayOrder: 900 + i, status: 'Active', helpText: 'Prioritisation rule-engine parameter (standards pack)'
          }))))
          log.info('Prioritisation pack attributes ensured', { created: missing.length })
        }
      } catch (e) { log.warn('ensurePackAttributes skipped:', e.message) }
    }
    ensurePackAttributes()

    const monthsSince = (date) => {
      if (!date) return null
      const then = new Date(date).getTime()
      if (!Number.isFinite(then)) return null
      return Math.max(0, Math.round((Date.now() - then) / (1000 * 60 * 60 * 24 * 30.4375)))
    }

    // Federated read-only facts + confidence for a bridge (used by prefill AND by CREATE).
    const factsFor = async (bridgeID) => {
      const b = await db.run(SELECT.one.from('bridge.management.Bridges').where({ ID: bridgeID }))
      if (!b) return null
      const restr = await db.run(SELECT.from('bridge.management.BridgeRestrictions')
        .where({ bridge_ID: bridgeID, active: true, restrictionStatus: 'Active' }))
      const restrictionFlag = (restr || []).length > 0
      const restrictionSummary = restrictionFlag
        ? `${restr.length} active restriction${restr.length > 1 ? 's' : ''}` + (restr[0].restrictionType ? ` (${restr[0].restrictionType})` : '')
        : 'None'
      // Confidence: 5 federated facts (register, restriction status, condition, structural, load).
      // register + restriction-status are always determinable; the rest depend on data presence.
      const present = (v) => v !== null && v !== undefined && v !== ''
      const inputsAvailable = 2 + [b.conditionRating, b.structuralAdequacyRating, b.loadRating].filter(present).length
      return {
        bridge: b,
        bridgeRef: b.bridgeId, bridgeName: b.bridgeName,
        conditionRating: b.conditionRating ?? null,
        structuralAdequacyRating: b.structuralAdequacyRating ?? null,
        loadRating: b.loadRating ?? null,
        ratingStandardType: b.ratingStandardType || 'AS5100',
        restrictionFlag, restrictionSummary,
        derivedLikelihood: engine.deriveLikelihood(b.conditionRating, b.structuralAdequacyRating),
        inputsAvailable, inputsTotal: 5,
        conditionAsAtMonths: monthsSince(b.lastInspectionDate)
      }
    }

    // ── Prefill: pure read, never writes ──
    this.on('prefill', async (req) => {
      const f = await factsFor(req.data.bridgeID)
      if (!f) return req.reject(404, 'Bridge not found')
      const facts = Object.assign({}, f)
      // RULE ENGINE: resolved model + read-only auto-criteria preview for the Assess screen.
      try {
        const models = await loadActiveModels()
        const model = resolveModelFor(models, f.bridge.assetClass, f.bridge.transportMode)
        if (model) {
          facts.modelCode = model.code
          facts.modelVersion = model.version
          facts.modelName = model.name
          facts.aggregationMethod = model.aggregationMethod
          const context = await contextFor(f.bridge, {})
          const ev = ruleEngine.evaluate({ model, assetClass: f.bridge.assetClass, transportMode: f.bridge.transportMode, context, cfg: await activeConfigRow() || {} })
          facts.autoCriteria = JSON.stringify(
            (ev.criterionBreakdown || []).filter(r => !String(r.source).startsWith('Manual'))
              .map(r => ({ code: r.code, raw: r.raw, source: r.source, score: r.score, weight: r.weight, note: r.note })))
        }
      } catch (e) { log.warn('prefill model preview skipped:', e.message) }
      delete facts.bridge // strip the raw entity row — return only the federated facts
      return facts
    })

    // ── G3/G4: pre-filter + FLEET BATCH SCORING (immutable ranked runs from data alone) ──
    const loadPreFilters = () => db.run(SELECT.from('bridge.management.PrioritisationPreFilter').where({ active: true }))
    this.on('scoreFleet', async (req) => {
      if (!(await isEnabled())) return req.reject(403, 'The Bridge Prioritisation module is currently disabled.')
      const limit = Math.min(num(req.data.limit) || 500, 2000)
      const bridges = await db.run(SELECT.from('bridge.management.Bridges').limit(limit))
      const models = await loadActiveModels()
      const filters = await loadPreFilters()
      const cfgRow = await activeConfigRow() || {}
      const fleetRunId = cds.utils.uuid()
      const scored = []; const excluded = []
      for (const b of bridges) {
        const model = resolveModelFor(models, b.assetClass, b.transportMode)
        if (!model || model.aggregationMethod === 'RiskCritBlend-v1') continue // data-only models only
        const context = await contextFor(b, {})
        const pf = ruleEngine.preFilter(context, filters)
        if (pf.excluded) { excluded.push({ bridge: b.bridgeId, code: pf.code }); continue }
        const ev = ruleEngine.evaluate({ model, assetClass: b.assetClass, transportMode: b.transportMode, context, cfg: cfgRow })
        scored.push({ b, ev })
      }
      scored.sort((x, y) => y.ev.priorityScore - x.ev.priorityScore)
      let rank = 0
      for (const s of scored) {
        rank++
        const id = cds.utils.uuid()
        await db.run(cds.ql.UPDATE('bridge.management.PrioritisationAssessment').set({ active: false, supersededBy_ID: id }).where({ bridge_ID: s.b.ID, active: true }))
        await db.run(cds.ql.INSERT.into('bridge.management.PrioritisationAssessment').entries({
          ID: id, bridge_ID: s.b.ID, bridgeRef: s.b.bridgeId, bridgeName: s.b.bridgeName,
          likelihood: ruleEngine.DERIVED.deriveLikelihood({ bridge: s.b }), likelihoodDerived: ruleEngine.DERIVED.deriveLikelihood({ bridge: s.b }),
          strategy: 'Maintain', restrictionFlag: false,
          priorityScore: s.ev.priorityScore, band: s.ev.band,
          modelCode: s.ev.modelCode, modelVersion: s.ev.modelVersion, weightSetHash: s.ev.weightSetHash,
          criterionBreakdown: JSON.stringify({ rows: s.ev.criterionBreakdown, flags: s.ev.flags, forceReview: s.ev.forceReview, delegated: false, baseScore: s.ev.baseScore, fleet: true }),
          fleetRunId, fleetRank: rank,
          likelyFailureCostAud: s.b.likelyFailureCostAud ?? null, mitigationCostAud: s.b.mitigationCostAud ?? null,
          inputsAvailable: null, inputsTotal: null, conditionAsAtMonths: monthsSince(s.b.lastInspectionDate),
          configVersion: (cfgRow && cfgRow.version) || 'v1', formulaVersion: 'rule-engine-v1',
          paramSnapshot: JSON.stringify({ fleetRunId, model: s.ev.modelCode, v: s.ev.modelVersion }),
          assessedBy: req.user?.id || 'system', assessedAt: new Date().toISOString(), active: true
        }))
      }
      try {
        await writeChangeLogs(db, { objectType: 'PrioritisationFleetRun', objectId: fleetRunId, objectName: 'Fleet scoring run',
          source: 'Prioritisation', changedBy: req.user?.id || 'system',
          changes: [{ fieldName: 'scored', oldValue: '', newValue: String(scored.length) }, { fieldName: 'excluded', oldValue: '', newValue: String(excluded.length) }] })
      } catch (e) { log.warn('fleet ChangeLog skipped', e.message) }
      log.info('Fleet scoring complete', { fleetRunId, scored: scored.length, excluded: excluded.length })
      return { fleetRunId, scored: scored.length, excluded: excluded.length, excludedDetail: JSON.stringify(excluded.slice(0, 50)) }
    })
    // ── BSI/BHI: compute + persist per bridge (gather) — feeds ConditionByMode (visualise) ──
    this.on('computeBhi', async (req) => {
      const where = req.data.bridgeID ? { ID: req.data.bridgeID } : {}
      const bridges = await db.run(SELECT.from('bridge.management.Bridges').where(where).limit(1000))
      let updated = 0
      for (const b of bridges) {
        const elements = await db.run(SELECT.from('bridge.management.BridgeElements').where({ bridge_ID: b.ID }))
        const env = bhiLib.envFromBridge(b)
        const r = bhiLib.computeBSI(elements, b.transportMode, env)
        if (r.bsi === null) continue
        const bhi = bhiLib.computeBHI(r.bsi, env)
        await db.run(cds.ql.UPDATE('bridge.management.Bridges').set({
          bsiScore: r.bsi, bhiScore: bhi, bsiPriority: bhiLib.bsiPriority(r.bsi), bhiComputedAt: new Date().toISOString()
        }).where({ ID: b.ID }))
        updated++
      }
      try { await writeChangeLogs(db, { objectType: 'BridgeBhi', objectId: String(req.data.bridgeID || 'fleet'), objectName: 'BSI/BHI compute', source: 'Prioritisation', changedBy: req.user?.id || 'system', changes: [{ fieldName: 'updated', oldValue: '', newValue: String(updated) }] }) } catch (e) { log.warn('bhi ChangeLog skipped', e.message) }
      log.info('BSI/BHI computed', { updated })
      return { updated }
    })

    // ── BHI/BSI explorer: full calculation transparency for one bridge (calculator parity) ──
    this.on('bhiDetail', async (req) => {
      const b = await db.run(SELECT.one.from('bridge.management.Bridges').where({ ID: req.data.bridgeID }))
      if (!b) return req.reject(404, 'Bridge not found')
      const elements = await db.run(SELECT.from('bridge.management.BridgeElements').where({ bridge_ID: b.ID }))
      const env = bhiLib.envFromBridge(b)
      const mode = b.transportMode || 'Road'
      const main = bhiLib.computeBSI(elements, mode, env)
      const bhi = bhiLib.computeBHI(main.bsi, env)
      // element buckets actually used (worst per bucket) + the active weight set
      const w = bhiLib.weightsFor(mode, env.overWater)
      const buckets = {}
      for (const e of elements) {
        const bk = bhiLib.bucketOf(e.elementType)
        const r = Number(e.conditionRating)
        if (Number.isFinite(r) && (bk in w)) buckets[bk] = buckets[bk] === undefined ? r : Math.min(buckets[bk], r)
      }
      const elementBreakdown = Object.entries(w).map(([k, wt]) => ({ bucket: k, weight: wt, rating: buckets[k] ?? null }))
      // ALL FOUR mode weight-models on the same inputs — "how it is normalised across modes"
      const models = Object.keys(bhiLib.MODE_WEIGHTS).map(mk => {
        const mw = bhiLib.MODE_WEIGHTS[mk]
        let n = 0, d = 0
        for (const [k, wt] of Object.entries(mw)) if (buckets[k] !== undefined) { n += buckets[k] * wt; d += wt }
        if (d === 0 && env.fallbackCondition !== null) { n = env.fallbackCondition; d = 1 }
        const raw = d > 0 ? n / d : null
        const score = raw === null ? null : Math.max(0, Math.min(10, raw * (main.ageFactor ?? 1) - (main.envPenalty ?? 0)))
        return { model: mk, weights: mw, bsi: score === null ? null : Math.round(score * 100) / 100 }
      })
      const fb = Object.keys(buckets).length === 0
      const formulas = [
        'BSI_raw = ' + (fb ? ('register condition fallback = ' + env.fallbackCondition) : elementBreakdown.filter(x => x.rating !== null).map(x => x.rating + 'x' + x.weight).join(' + ') + ' / sum(w)'),
        'ageFactor = max(0, 1 - (' + env.age + '/120)x0.3) = ' + main.ageFactor,
        'envPenalty = (' + env.floodExp + '-1)x0.04 + (' + env.corrZone + '-1)x0.03 + ' + env.seismic + 'x0.02 = ' + main.envPenalty,
        'BSI = clamp(BSI_raw x ageFactor - envPenalty) = ' + main.bsi + ' / 10',
        'vulnerability = min(0.4, (' + env.age + '/100)x0.2 + envPenalty)',
        'importFactor = 0.85 + (' + env.importClass + '-1)x0.03',
        'BHI = BSI x 10 x (1-vulnerability) x importFactor = ' + bhi + ' / 100',
        'RSL = (BSI/10) x (100-' + env.age + ') x 0.6 = ' + bhiLib.remainingServiceLife(main.bsi, env.age) + ' years'
      ]
      return { detail: JSON.stringify({
        bridge: { ID: b.ID, name: b.bridgeName, ref: b.bridgeId, mode, assetClass: b.assetClass },
        env, coverage: main.coverage, usedFallback: fb,
        bsi: main.bsi, bhi, rsl: bhiLib.remainingServiceLife(main.bsi, env.age), priority: bhiLib.bsiPriority(main.bsi),
        elementBreakdown, models, formulas
      }) }
    })

    // ── G8: portfolio data-readiness — % of fleet with a resolvable raw value per criterion ──
    this.on('dataReadiness', async () => {
      const models = await loadActiveModels()
      const model = models.find(m => m.aggregationMethod !== 'RiskCritBlend-v1') || models[0]
      if (!model) return { criteria: '[]' }
      const bridges = await db.run(SELECT.from('bridge.management.Bridges').limit(500))
      const counts = {}
      for (const b of bridges) {
        const context = await contextFor(b, {})
        for (const c of model.criteria) {
          if ((c.bindings || []).every(x => x.sourceType === 'Manual')) continue
          const { raw } = ruleEngine.bindRaw(c, context)
          counts[c.code] = counts[c.code] || { code: c.code, name: c.name, withData: 0, total: 0 }
          counts[c.code].total++; if (raw !== null && raw !== undefined && raw !== '') counts[c.code].withData++
        }
      }
      const rows = Object.values(counts).map(r => Object.assign(r, { pct: r.total ? Math.round(r.withData / r.total * 100) : 0 }))
      return { criteria: JSON.stringify(rows.sort((a, b) => a.pct - b.pct)) }
    })

    // ── Model Builder writes: validation + ChangeLog on every CUD (admin-gated in CDS) ──
    const MODEL_ENTITIES = ['Models', 'ModelCriteria', 'ModelClassWeights', 'ModelRules', 'ModelBindings', 'ModelValueBands']
    for (const en of MODEL_ENTITIES) {
      const target = this.entities[en]
      if (!target) continue
      this.before(['CREATE', 'UPDATE'], target, (req) => {
        const d = req.data || {}
        if (en === 'ModelRules' && d.config !== undefined) {
          try { JSON.parse(d.config || '{}') } catch (_e) { return req.reject(400, 'AggregationRule.config must be valid JSON.') }
        }
        if (en === 'ModelCriteria' && d.rubric) {
          try { JSON.parse(d.rubric) } catch (_e) { return req.reject(400, 'ModelCriterion.rubric must be valid JSON ({"1":"…","5":"…"}).') }
        }
        if (en === 'Models' && d.status === 'Active' && d.code) {
          // activating a model retires other Active versions of the SAME code (mirror config behaviour)
          req._activateCode = d.code
        }
      })
      this.after(['CREATE', 'UPDATE'], target, async (data, req) => {
        try {
          await writeChangeLogs(db, {
            objectType: 'Prioritisation' + en, objectId: String(data.ID || (req.params && req.params[0] && req.params[0].ID) || ''),
            objectName: data.code || data.name || en, source: 'PrioritisationModelBuilder',
            changedBy: req.user?.id || 'system',
            changes: Object.keys(req.data || {}).filter(k => k !== 'ID').slice(0, 12)
              .map(k => ({ fieldName: k, oldValue: '', newValue: String(req.data[k]).slice(0, 120) }))
          })
        } catch (e) { log.warn('ModelBuilder ChangeLog skipped:', e.message) }
      })
    }

    // ── reportPdf: server-rendered, branded, paginated A4 exec one-pager ──
    // Figures are computed HERE from the immutable runs (not the client's view) so the document is
    // reproducible and reconciles exactly to the stored figures. Returns base64 PDF bytes.
    this.on('reportPdf', async () => {
      const runs = await db.run(SELECT.from('bridge.management.PrioritisationAssessment')
        .where({ active: true }).orderBy({ priorityScore: 'desc' }))
      const rawCfg = await db.run(SELECT.one.from('bridge.management.PrioritisationConfig')
        .where({ active: true }).orderBy({ modifiedAt: 'desc' })) || {}
      const cfg = await activeConfig()
      let totalBridges = runs.length
      try { const c = await db.run(SELECT.one`count(*) as n`.from('bridge.management.Bridges')); totalBridges = (c && (c.n ?? c.N)) || runs.length } catch (_e) { /* keep */ }

      const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
      const counts = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0 }
      let stale = 0
      runs.forEach(r => { if (counts[r.band] != null) counts[r.band]++; if (r.conditionAsAtMonths != null && r.conditionAsAtMonths > 12) stale++ })
      const decileN = Math.max(1, Math.ceil(runs.length * 0.1))
      const topDecileCost = runs.slice(0, decileN).reduce((s, r) => s + num(r.mitigationCostAud), 0)
      const fmtM = (n) => n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'm' : n > 0 ? '$' + Math.round(n / 1000) + 'k' : '$0'
      const coveragePct = totalBridges ? Math.round(runs.length / totalBridges * 100) : 0
      const versions = Array.from(new Set(runs.map(r => (r.formulaVersion || '?') + '/' + (r.configVersion || '?'))))
      const owner = rawCfg.methodologyOwner || '—'
      const version = rawCfg.version || cfg.version || 'v1'
      const formulaVersion = rawCfg.formulaVersion || cfg.formulaVersion || 'v1-normalised'
      const today = new Date().toISOString().slice(0, 10)
      // deterministic-ish doc id from the run set (same set → same id)
      let h = 0; const key = runs.map(r => r.ID).sort().join('|')
      for (let i = 0; i < key.length; i++) { h = ((h << 5) - h + key.charCodeAt(i)) | 0 }
      const docId = 'BIS-PRI-' + today.replace(/-/g, '') + '-' + (Math.abs(h).toString(36).toUpperCase() + '0000').slice(0, 4)
      const w = engine.normalise(cfg.dimWeights).map(x => Math.round(x * 100) / 100)
      const pw = engine.normalise(cfg.priorityWeights).map(x => Math.round(x * 100) / 100)

      const doc = new Pdf({ footer: docId + '   ·   figures reconcile to the immutable stored runs' })
      doc.brandHeader('Bridge Prioritisation — Portfolio One-Pager', 'Generated ' + today + ' · methodology ' + formulaVersion + ' / config ' + version + (versions.length > 1 ? '  (mixed versions — see appendix)' : ''))
      doc.kpis([
        { label: 'Top-decile cost (' + decileN + ' worst)', value: fmtM(topDecileCost) },
        { label: 'P1 critical', value: counts.P1 },
        { label: 'Assessed (of ' + totalBridges + ')', value: runs.length + ' / ' + coveragePct + '%' },
        { label: 'Stale (>12 mo)', value: stale }
      ])
      doc.heading('Portfolio by band')
      doc.tableHeader([{ text: 'Band', x: 48, w: 200 }, { text: 'Count', x: 400, w: 99, align: 'right' }])
      ;['P1', 'P2', 'P3', 'P4', 'P5'].forEach(c => doc.tableRow([{ text: c, x: 48, w: 200, bold: true }, { text: counts[c], x: 400, w: 99, align: 'right' }]))
      doc.heading('Headline')
      doc.paragraph(counts.P1 + ' of ' + runs.length + ' assessed structures are P1 critical (covering ' + coveragePct + '% of the ' + totalBridges + '-bridge portfolio). ' +
        'Funding the top decile (' + decileN + ' worst) is an estimated ' + fmtM(topDecileCost) + ' of intervention. ' +
        stale + ' run(s) rely on condition data older than 12 months and should be re-inspected before the funding submission. ' +
        'All figures read from the immutable stored runs' + (versions.length > 1 ? ' (NOTE: ' + versions.length + ' methodology versions present — re-run for a single-version submission).' : '.'))
      doc.heading('Governance')
      doc.kv('Prepared (as-at)', today)
      doc.kv('Methodology owner', owner + ' · ' + formulaVersion + ' / config ' + version)
      doc.kv('Methodology versions', versions.join(', ') + (versions.length > 1 ? '  (mixed)' : ''))
      const modelIds = Array.from(new Set(runs.map(r => (r.modelCode || 'NSW-RISK-V1') + ' v' + (r.modelVersion || 1))))
      doc.kv('Scoring model(s)', modelIds.join(', ') + ' — criteria/weights per Model Builder (BMS Admin)')
      doc.kv('Endorsed by / date', '____________________ / __________')
      doc.heading('Methodology appendix (reproducible)')
      doc.paragraph('criticality = sum(dimension x weight), weights ' + w.join(' / ') + ' (safety/network/financial/environmental/reputational) normalised to 1. ' +
        'tier = round(criticality) clamped 1..5. residual = likelihood x tier (an active restriction is a treatment FLAG, never a score input). ' +
        'priorityScore = ' + pw[0] + ' riskN + ' + pw[1] + ' critN + ' + pw[2] + ' stratN (normalised); band thresholds 80/60/40/20 -> P1..P5. ' +
        'maxResidual ' + cfg.maxResidual + ', maxCriticality ' + cfg.maxCriticality + '. ' +
        'Every run stores its inputs and its exact parameter snapshot, so any past ranked list reproduces byte-identically.')

      log.info('Prioritisation exec PDF rendered', { docId, runs: runs.length, pages: 'auto' })
      return { filename: docId + '.pdf', contentType: 'application/pdf', contentBase64: doc.build().toString('base64'), docId }
    })

    // ── CREATE: feature-flag gate + SERVER-SIDE compute + immutable run stamp ──
    this.before('CREATE', Assessments, async (req) => {
      if (!(await isEnabled())) return req.reject(403, 'The Bridge Prioritisation module is currently disabled.')
      const d = req.data
      // A prioritisation run MUST reference a bridge — this guarantees the federated facts +
      // override-reason enforcement below can never be skipped via a degenerate bridge-less POST.
      if (d.bridge_ID == null) return req.reject(400, 'A prioritisation run must reference a bridge.')
      const cfg = await activeConfig()
      const inputs = {
        dimSafety: d.dimSafety, dimNetwork: d.dimNetwork, dimFinancial: d.dimFinancial,
        dimEnvironmental: d.dimEnvironmental, dimReputational: d.dimReputational,
        likelihood: d.likelihood, strategy: d.strategy
      }
      const out = engine.derivePriority(inputs, cfg)
      // Overwrite ANY client-supplied outputs — the server is the source of truth.
      Object.assign(d, {
        criticality: out.criticality, tier: out.tier, residual: out.residual,
        riskN: out.riskN, critN: out.critN, stratN: out.stratN,
        priorityScore: out.priorityScore, band: out.band,
        configVersion: cfg.version, formulaVersion: out.formulaVersion,
        paramSnapshot: JSON.stringify(cfg),
        // Freeze the rubric wording used at assess time, so a reproduced past run shows exactly what
        // each dimension level MEANT then (not just the number) — full audit reproducibility.
        rubricSnapshot: JSON.stringify(engine.rubricSnapshot(inputs, cfg.rubrics)),
        assessedBy: req.user?.id || 'system', assessedAt: new Date().toISOString(),
        active: true
      })
      // Federated snapshot + confidence + derived likelihood (override logged).
      if (d.bridge_ID != null) {
        const f = await factsFor(d.bridge_ID)
        if (f) {
          d.bridgeRef = d.bridgeRef || f.bridgeRef
          d.bridgeName = d.bridgeName || f.bridgeName
          d.restrictionFlag = f.restrictionFlag
          d.likelihoodDerived = f.derivedLikelihood
          d.likelihoodOverridden = Number(d.likelihood) !== Number(f.derivedLikelihood)
          // GAP #14: a likelihood override MUST carry a logged justification (parity with the
          // BIS risk-override rule). Reject server-side when overridden without a reason.
          if (d.likelihoodOverridden && !String(d.likelihoodOverrideReason || '').trim()) {
            return req.reject(400, 'A likelihood override requires a logged justification (the derived value is ' + f.derivedLikelihood + ').')
          }
          if (d.inputsAvailable == null) d.inputsAvailable = f.inputsAvailable
          if (d.inputsTotal == null) d.inputsTotal = f.inputsTotal
          if (d.conditionAsAtMonths == null) d.conditionAsAtMonths = f.conditionAsAtMonths
          // GAP #9: cost snapshot from the bridge (reproducible $ exposure on the run).
          if (f.bridge) {
            if (d.likelyFailureCostAud == null) d.likelyFailureCostAud = f.bridge.likelyFailureCostAud ?? null
            if (d.mitigationCostAud == null) d.mitigationCostAud = f.bridge.mitigationCostAud ?? null
          }
        }
      }
      // ── RULE ENGINE (Phase 6): resolve the governing model for this asset's class/mode and
      // evaluate. RiskCritBlend-v1 (NSW-RISK-V1) delegates to the approved engine — the values
      // already computed above are kept BYTE-IDENTICAL; only the model identity is stamped.
      // Generic models (NSW-PACK-V1 …) overwrite score+band with the configured evaluation.
      try {
        const f2 = await db.run(SELECT.one.from('bridge.management.Bridges').where({ ID: d.bridge_ID }))
        const models = await loadActiveModels()
        const model = resolveModelFor(models, f2 && f2.assetClass, f2 && f2.transportMode)
        if (model) {
          const context = await contextFor(f2, {
            dimSafety: d.dimSafety, dimNetwork: d.dimNetwork, dimFinancial: d.dimFinancial,
            dimEnvironmental: d.dimEnvironmental, dimReputational: d.dimReputational,
            likelihood: d.likelihood, strategy: d.strategy
          })
          const ev = ruleEngine.evaluate({
            model, assetClass: f2.assetClass, transportMode: f2.transportMode,
            context, cfg: await activeConfigRow() || {}
          })
          d.modelCode = ev.modelCode
          d.modelVersion = ev.modelVersion
          d.weightSetHash = ev.weightSetHash
          d.criterionBreakdown = JSON.stringify({
            rows: ev.criterionBreakdown, flags: ev.flags, forceReview: ev.forceReview,
            delegated: ev.delegated, baseScore: ev.baseScore ?? null
          })
          if (!ev.delegated) { d.priorityScore = ev.priorityScore; d.band = ev.band }
          log.info('Prioritisation model applied', { model: ev.modelCode, v: ev.modelVersion, delegated: ev.delegated, band: d.band })
        }
      } catch (e) { log.error('Rule-engine evaluation failed (run keeps approved-engine values):', e.message) }
      // GAP #4 (ATOMIC): supersede prior active runs for this bridge IN THE SAME TRANSACTION as the
      // insert, stamping supersededBy = this run's id. Done in `before` (not `after`) so two active
      // runs can never coexist — even on a crash between insert and supersede. The new run isn't
      // inserted yet, so every currently-active run for the bridge is a prior to retire.
      if (!d.ID) d.ID = cds.utils.uuid()
      if (d.bridge_ID != null) {
        await db.run(cds.ql.UPDATE('bridge.management.PrioritisationAssessment')
          .set({ active: false, supersededBy_ID: d.ID })
          .where({ bridge_ID: d.bridge_ID, active: true }))
      }
    })

    // ChangeLog on CREATE (rule 3) — non-bulk source so a transient miss warns, not blocks.
    // GAP #4: also SUPERSEDE prior active runs for the same bridge so the worklist + exec counts
    // show exactly ONE current run per bridge (no double-counting on re-assessment). The prior
    // runs are kept (immutable) but marked active=false + supersededBy=new run.
    this.after('CREATE', Assessments, async (data, req) => {
      try {
        await writeChangeLogs(db, {
          objectType: 'PrioritisationAssessment', objectId: String(data.ID),
          objectName: data.bridgeName || data.bridgeRef || data.ID,
          source: 'Prioritisation', changedBy: req.user?.id || 'system',
          changes: [
            { fieldName: 'priorityScore', oldValue: '', newValue: String(data.priorityScore) },
            { fieldName: 'band', oldValue: '', newValue: String(data.band) },
            { fieldName: 'tier', oldValue: '', newValue: String(data.tier) }
          ]
        })
      } catch (e) { log.error('Prioritisation ChangeLog failed:', e.message) }
      // The supersede MUTATION already happened atomically in before('CREATE'); here we only AUDIT
      // it (best-effort) by logging the prior runs this run retired (supersededBy = data.ID).
      try {
        const superseded = await db.run(SELECT.from('bridge.management.PrioritisationAssessment')
          .columns('ID').where({ supersededBy_ID: data.ID }))
        for (const p of (superseded || [])) {
          await writeChangeLogs(db, {
            objectType: 'PrioritisationAssessment', objectId: String(p.ID), objectName: data.bridgeName || data.bridgeRef || p.ID,
            source: 'Prioritisation', changedBy: req.user?.id || 'system',
            changes: [{ fieldName: 'active', oldValue: 'true', newValue: 'false' }, { fieldName: 'supersededBy', oldValue: '', newValue: String(data.ID) }]
          }).catch(() => {})
        }
        if (superseded && superseded.length) log.info('Prioritisation run superseded prior active run(s)', { bridge_ID: data.bridge_ID, superseded: superseded.length, by: data.ID })
      } catch (e) { log.error('Prioritisation supersede audit failed:', e.message) }
    })

    // ── EAM-outbound: raise a work request (bounded — NEVER writes EAM) ──
    // Creates a local QUEUED outbound record + audit. In STANDALONE mode it stays QUEUED; a
    // future integration worker drains the queue and POSTs to EAM, stamping externalRef.
    this.on('raiseWorkRequest', Assessments, async (req) => {
      if (!(await isEnabled())) return req.reject(403, 'The Bridge Prioritisation module is currently disabled.')
      const key = req.params[req.params.length - 1]
      const aid = key && (key.ID || key)
      const a = await db.run(SELECT.one.from('bridge.management.PrioritisationAssessment').where({ ID: aid }))
      if (!a) return req.reject(404, 'Assessment not found.')
      let bridge = null
      if (a.bridge_ID != null) bridge = await db.run(SELECT.one.from('bridge.management.Bridges').where({ ID: a.bridge_ID }))
      const targetEamSystem = (bridge && bridge.eamSystem) || (await getConfig('eamOutboundSystem')) || 'STANDALONE'
      const eamObjectRef = bridge ? (bridge.eamEquipId || bridge.eamFlocId || '') : ''
      const reqType = ['Inspection', 'Intervention', 'Review'].includes(req.data.requestType) ? req.data.requestType : 'Inspection'
      const id = cds.utils.uuid()
      const now = new Date().toISOString()
      const payload = {
        source: 'BIS-Prioritisation', assessmentID: aid, bridgeRef: a.bridgeRef, priorityBand: a.band,
        priorityScore: a.priorityScore, criticality: a.criticality, tier: a.tier, residual: a.residual,
        formulaVersion: a.formulaVersion, configVersion: a.configVersion, requestType: reqType,
        eamObjectRef, targetEamSystem, raisedAt: now, note: req.data.notes || ''
      }
      const row = {
        ID: id, assessment_ID: aid, bridge_ID: a.bridge_ID, bridgeRef: a.bridgeRef, bridgeName: a.bridgeName,
        priorityBand: a.band, priorityScore: a.priorityScore, requestType: reqType, targetEamSystem,
        eamObjectRef, status: 'QUEUED', payload: JSON.stringify(payload), notes: req.data.notes || null,
        raisedBy: req.user?.id || 'system', raisedAt: now, active: true
      }
      await db.run(cds.ql.INSERT.into('bridge.management.EamWorkRequest').entries(row))
      try {
        await writeChangeLogs(db, {
          objectType: 'EamWorkRequest', objectId: id, objectName: (a.bridgeName || a.bridgeRef || aid) + ' · ' + reqType,
          source: 'Prioritisation', changedBy: req.user?.id || 'system',
          changes: [
            { fieldName: 'status', oldValue: '', newValue: 'QUEUED' },
            { fieldName: 'requestType', oldValue: '', newValue: reqType },
            { fieldName: 'targetEamSystem', oldValue: '', newValue: targetEamSystem }
          ]
        })
      } catch (e) { log.error('WorkRequest ChangeLog failed:', e.message) }
      log.info('EAM work request queued (not yet pushed — EAM never modified)', { id, bridgeRef: a.bridgeRef, targetEamSystem, reqType })
      return db.run(SELECT.one.from('bridge.management.EamWorkRequest').where({ ID: id }))
    })

    // WorkRequests soft-delete (cancel)
    this.on('deactivate', this.entities.WorkRequests, async (req) => {
      const key = req.params[req.params.length - 1]
      const id = key && (key.ID || key)
      await db.run(cds.ql.UPDATE('bridge.management.EamWorkRequest').set({ active: false, status: 'CANCELLED' }).where({ ID: id }))
      return db.run(SELECT.one.from('bridge.management.EamWorkRequest').where({ ID: id }))
    })

    // ── Immutability: reject any UPDATE on a stored run (append-only) ──
    this.before('UPDATE', Assessments, (req) =>
      req.reject(400, 'Prioritisation runs are immutable. Create a new assessment to record a change (the old run is preserved).'))

    // ── deactivate: soft-delete only (admin) ──
    this.on('deactivate', Assessments, async (req) => {
      const key = req.params[req.params.length - 1]
      const id = key && (key.ID || key)
      await db.run(cds.ql.UPDATE('bridge.management.PrioritisationAssessment').set({ active: false }).where({ ID: id }))
      try {
        await writeChangeLogs(db, {
          objectType: 'PrioritisationAssessment', objectId: String(id), objectName: String(id),
          source: 'Prioritisation', changedBy: req.user?.id || 'system',
          changes: [{ fieldName: 'active', oldValue: 'true', newValue: 'false' }]
        })
      } catch (e) { log.error('Prioritisation deactivate ChangeLog failed:', e.message) }
      return db.run(SELECT.one.from('bridge.management.PrioritisationAssessment').where({ ID: id }))
    })

    // ── Config writes (admin): validate, version, single active row ──
    this.before(['CREATE', 'UPDATE'], Config, (req) => {
      const c = req.data
      const ladder = (() => { try { return typeof c.bandThresholds === 'string' ? JSON.parse(c.bandThresholds) : c.bandThresholds } catch (_e) { return null } })()
      if (ladder && !engine.resolveConfig({ bandThresholds: ladder }).bandThresholds) {
        return req.reject(400, 'Invalid band ladder.')
      }
      for (const k of ['wSafety', 'wNetwork', 'wFinancial', 'wEnvironmental', 'wReputational', 'wRisk', 'wCrit', 'wStrat']) {
        if (c[k] != null && (!Number.isFinite(Number(c[k])) || Number(c[k]) < 0)) {
          return req.reject(400, `Weight "${k}" must be a non-negative number.`)
        }
      }
    })
    // When a new active config version is created, retire prior active versions (soft-delete),
    // so exactly one config is "active" for FUTURE runs; past runs are unaffected (snapshot).
    this.after('CREATE', Config, async (data) => {
      if (data.active !== false) {
        await db.run(cds.ql.UPDATE('bridge.management.PrioritisationConfig')
          .set({ active: false }).where({ active: true, ID: { '!=': data.ID } }))
      }
    })

    await super.init()
  }
}
