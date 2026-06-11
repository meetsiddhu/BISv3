const cds = require('@sap/cds')
const { SELECT } = cds.ql
const { writeChangeLogs } = require('./audit-log')
const { getConfig, getConfigInt } = require('./system-config')
const engine = require('./lib/prioritisation')
const ruleEngine = require('./lib/prioritisation-rule-engine')
const { effectiveRuns } = require('./lib/effective-runs')
const bhiLib = require('./lib/bhi')
const { Pdf } = require('./lib/pdf')

// B1 (council v3.12): module-scope numeric coercion helper — single source of truth for every
// handler in this service (it was previously scoped inside reportPdf, crashing scoreFleet with
// "num is not defined" on its first statement).
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// B2: fleet-scoring knobs are config-driven (SystemConfig) with documented code fallbacks —
// same pattern as GIS_CRS_EPSG. The old hardcoded 2,000 cap silently truncated an 11,850-bridge
// fleet; the default cap now covers the whole fleet and truncation is loud (log + return flag).
const FLEET_SCORE_MAX_DEFAULT = 20000   // SystemConfig key: fleetScoreMaxBridges
const FLEET_SCORE_PAGE_DEFAULT = 500    // SystemConfig key: fleetScorePageSize

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

    // B8: BSI/BHI mode weights + environmental coefficients are GOVERNED CONFIG (SystemConfig
    // row 'bhiWeights', JSON) — refreshed at every computing entry point (60s-cached read).
    // The documented defaults (the approved calculator's values) live in srv/lib/bhi.js; a
    // missing/invalid row resolves to those defaults, so calculator parity holds untouched.
    const refreshBhiConfig = async () => bhiLib.configure(await getConfig('bhiWeights'))

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
    // Pure context assembly from pre-fetched child rows (single source of truth — used by the
    // per-bridge contextFor AND by the set-based fleet path, so the attribute fold can't drift).
    const buildContext = (bridge, manual, { capacities, elements, defects, inspections, restrictions, attrRows }) => {
      const attributes = {}
      for (const a of (attrRows || [])) {
        attributes[a.attributeKey] = a.valueText ?? a.valueDecimal ?? a.valueInteger ?? (a.valueBoolean === null || a.valueBoolean === undefined ? null : String(a.valueBoolean)) ?? a.valueDate
      }
      return { bridge, manual,
        capacities: capacities || [], elements: elements || [], defects: defects || [],
        inspections: inspections || [], restrictions: restrictions || [], attributes,
        asAtMonths: { default: monthsSince(bridge.lastInspectionDate) } }
    }
    // Context bundle for the pure engine (no I/O inside the engine itself) — single bridge.
    const contextFor = async (bridge, manual) => {
      const bid = bridge.ID
      const [capacities, elements, defects, inspections, restrictions, attrRows] = await Promise.all([
        db.run(SELECT.from('bridge.management.BridgeCapacities').where({ bridge_ID: bid })),
        db.run(SELECT.from('bridge.management.BridgeElements').where({ bridge_ID: bid })),
        db.run(SELECT.from('bridge.management.BridgeDefects').where({ bridge_ID: bid })),
        db.run(SELECT.from('bridge.management.BridgeInspections').where({ bridge_ID: bid })),
        // R6: restriction context reads the UNION view over BOTH masters — a
        // restriction entered via the Restrictions app now influences scoring
        // exactly like one entered on the Bridges register tab.
        db.run(SELECT.from('bridge.management.UnifiedRestrictions').where({ bridge_ID: bid, active: true })),
        db.run(SELECT.from('bridge.management.AttributeValues')
          .where({ objectType: { in: ['bridge', 'Bridge'] }, objectId: String(bid) }))
      ])
      return buildContext(bridge, manual, { capacities, elements, defects, inspections, restrictions, attrRows })
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
      ['INCIDENT_COUNT_5Y', 'Safety incidents (5 years)', 'Integer'], ['STATUTORY_OBLIGATION', 'Statutory/contractual obligation', 'Text'],
      // B7: explicit Over/Under-bridge axis for the user-type weighting (Over | Under | Both).
      // When unset, the engine derives it from the register (secondaryModes heuristic).
      ['OVER_UNDER', 'Over/Under-bridge axis (Over/Under/Both)', 'Text']
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
    // B8: idempotent ensure of the 'bhiWeights' SystemConfig row so the BSI/BHI weight set is
    // visible + editable in the admin config tile (insert-if-missing ONLY — same pattern as
    // ensurePackAttributes; a CSV seed would truncate admin edits on HDI redeploy).
    const ensureBhiConfigRow = async () => {
      try {
        const existing = await db.run(SELECT.one.from('bridge.management.SystemConfig').where({ configKey: 'bhiWeights' }))
        if (existing) return
        await db.run(cds.ql.INSERT.into('bridge.management.SystemConfig').entries({
          configKey: 'bhiWeights', category: 'Prioritisation', label: 'BSI/BHI weights & coefficients (JSON)',
          value: null, defaultValue: JSON.stringify(bhiLib.DEFAULT_BHI_CONFIG), dataType: 'string',
          description: 'Per-transport-mode element weights, environmental/age/importance coefficients and the calibrated-mode list for the BSI/BHI engine. JSON; partial overrides merge over the documented defaults in srv/lib/bhi.js (the approved calculator values). Non-road modes stay road-derived until calibrated and are labelled accordingly in bhiDetail.',
          isReadOnly: false, sortOrder: 95, modifiedAt: new Date().toISOString(), modifiedBy: 'system'
        }))
        log.info('SystemConfig bhiWeights ensured (defaults documented in srv/lib/bhi.js)')
      } catch (e) { log.warn('ensureBhiConfigRow skipped:', e.message) }
    }
    ensureBhiConfigRow()

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
      // R6: restrictionFlag considers BOTH masters via the UnifiedRestrictions
      // union view (previously BridgeRestrictions only — Restrictions-app rows
      // never flipped the flag).
      const restr = await db.run(SELECT.from('bridge.management.UnifiedRestrictions')
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

    // ── Council B3a/B3b: DEFAULT worklist read guard ─────────────────────────────────────────
    // The worklist surface is any Assessments READ that filters on `active` (the UI sends
    // "active eq true") WITHOUT explicitly referencing reviewStatus. On that default surface:
    //   B3a  review-held runs (reviewStatus='pending', stamped by scoreFleet on forceReview)
    //        are EXCLUDED — they re-enter via releaseRun, or stay reachable through an explicit
    //        reviewStatus filter (the worklist 'Pending review' segment / run history / key reads,
    //        none of which filter on `active` + omit reviewStatus, are untouched).
    //   B3b  when a bridge has BOTH an active manual and an active fleet run, the fleet row is
    //        suppressed (manual beats fleet) so the surface shows ONE run per bridge — the same
    //        precedence srv/lib/effective-runs.js applies to BandSummary and the exec PDF.
    const whereRefs = (xpr, out = new Set()) => {
      for (const t of (Array.isArray(xpr) ? xpr : [])) {
        if (t && t.ref) out.add(String(t.ref[t.ref.length - 1]))
        if (t && Array.isArray(t.xpr)) whereRefs(t.xpr, out)
        if (t && Array.isArray(t.args)) whereRefs(t.args, out)
        if (t && Array.isArray(t.list)) whereRefs(t.list, out)
      }
      return out
    }
    this.before('READ', Assessments, async (req) => {
      const S = req.query && req.query.SELECT
      if (!S) return
      const refs = whereRefs(S.where)
      if (!refs.has('active') || refs.has('reviewStatus')) return // not the default worklist surface
      // B3a: hide review-held runs (NULL-safe != keeps reviewStatus IS NULL rows — @cap-js dbs)
      const cond = [{ ref: ['reviewStatus'] }, '!=', { val: 'pending' }]
      // B3b: hide fleet rows whose bridge also has an ACTIVE (non-held) manual run. Legacy rows
      // (runType NULL) are manual unless they carry a fleetRunId (pre-runType fleet batches).
      const manuals = await db.run(SELECT.from('bridge.management.PrioritisationAssessment')
        .columns('bridge_ID')
        .where({ active: true, runType: { '!=': 'fleet' }, fleetRunId: null, reviewStatus: { '!=': 'pending' }, bridge_ID: { '!=': null } }))
      const ids = Array.from(new Set(manuals.map((m) => m.bridge_ID).filter((v) => v != null)))
      if (ids.length) {
        const isManualRow = { xpr: [{ ref: ['runType'] }, '!=', { val: 'fleet' }, 'and', { ref: ['fleetRunId'] }, '=', { val: null }] }
        const bridgeHasManual = { xpr: [{ ref: ['bridge_ID'] }, 'in', { list: ids.map((v) => ({ val: v })) }] }
        cond.push('and', { xpr: [isManualRow, 'or', 'not', bridgeHasManual] })
      }
      S.where = (S.where && S.where.length) ? [{ xpr: S.where }, 'and', ...cond] : cond
    })

    // ── Prefill: pure read, never writes ──
    this.on('prefill', async (req) => {
      const f = await factsFor(req.data.bridgeID)
      if (!f) return req.reject(404, 'Bridge not found')
      const facts = Object.assign({}, f)
      // RULE ENGINE: resolved model + read-only auto-criteria preview for the Assess screen.
      try {
        await refreshBhiConfig() // B8: the derived BSI/BHI criteria read the governed weight set
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

    // ── G3/G4 (reworked for council B2, governed per B3–B6): pre-filter + FLEET BATCH SCORING ──
    // Deterministic paged job: WHERE active (soft-deleted bridges excluded), ORDER BY ID paging,
    // ONE set-based read per child table per page (grouped in JS — no per-bridge N+1), batch
    // INSERT of the ranked runs, and LOUD truncation when the cap cuts the fleet short.
    // Governance: runs are stamped runType='fleet' (data-only — no fabricated judgement fields),
    // only ever supersede prior FLEET runs (engineer runs are never retired by a batch), each
    // supersession is ChangeLogged per run id, ranking is band-first (P5 never above P1), and
    // every run freezes the RESOLVED model bundle + the applied pre-filter set for replay.
    const loadPreFilters = () => db.run(SELECT.from('bridge.management.PrioritisationPreFilter').where({ active: true }))
    // Soft-deleted bridges carry status 'Inactive' (admin deactivate action); anything else —
    // including NULL from mass upload — is a live asset. `!=` is NULL-safe on @cap-js db services.
    const ACTIVE_BRIDGE = { status: { '!=': 'Inactive' } }
    const groupBy = (rows, key) => {
      const m = new Map()
      for (const r of rows) { const k = r[key]; const a = m.get(k); if (a) a.push(r); else m.set(k, [r]) }
      return m
    }
    this.on('scoreFleet', async (req) => {
      if (!(await isEnabled())) return req.reject(403, 'The Bridge Prioritisation module is currently disabled.')
      await refreshBhiConfig() // B8: the BSI/BHI derived criteria read the governed weight set
      const maxBridges = await getConfigInt('fleetScoreMaxBridges', FLEET_SCORE_MAX_DEFAULT)
      const pageSize = Math.max(1, await getConfigInt('fleetScorePageSize', FLEET_SCORE_PAGE_DEFAULT))
      const limit = Math.min(num(req.data.limit) || maxBridges, maxBridges)
      // The fleet denominator: every ACTIVE bridge (the rank is meaningless against a slice).
      const cnt = await db.run(SELECT.one`count(*) as n`.from('bridge.management.Bridges').where(ACTIVE_BRIDGE))
      const fleetTotal = num(cnt && (cnt.n ?? cnt.N))
      const truncated = fleetTotal > limit
      if (truncated) {
        // B2: fail LOUDLY — a truncated "fleet rank" is not a fleet rank. Surfaced in the log,
        // the ChangeLog and the action result so no caller can mistake a slice for the fleet.
        log.warn('FLEET SCORING TRUNCATED — ranking covers a SLICE, not the fleet', {
          fleetTotal, limit, unscored: fleetTotal - limit,
          hint: 'raise the limit parameter or SystemConfig fleetScoreMaxBridges'
        })
      }
      const models = await loadActiveModels()
      const filters = await loadPreFilters()
      const cfgRow = await activeConfigRow() || {}
      const fleetRunId = cds.utils.uuid()
      // B5: the band-severity ladder (P1 first) from the ACTIVE config — rank sorts band-first so
      // a non-compensatory rule (SafetyFloor/Escalate/HurdleMin) that raises a band also raises
      // the rank. The rank can never contradict the band again.
      const ladder = engine.resolveConfig(cfgRow).bandThresholds
      const bandRank = new Map(ladder.slice().sort((a, b) => num(b.min) - num(a.min)).map((b, i) => [b.code, i]))
      const bandIdx = (band) => bandRank.has(band) ? bandRank.get(band) : ladder.length
      // B6: the RESOLVED model bundle frozen onto every run's paramSnapshot — criteria (with
      // bindings + value bands), per-class weights, rules, user-type weights AND the pre-filter
      // set actually applied. A past fleet run replays from THIS copy even after the live model
      // config is edited (the old snapshot was a mutable pointer: {model, v} only).
      const bundleCache = new Map()
      const resolvedBundle = (model) => {
        if (!bundleCache.has(model.ID)) {
          bundleCache.set(model.ID, JSON.stringify({
            fleetRunId, model: model.code, v: model.version, aggregationMethod: model.aggregationMethod,
            configVersion: (cfgRow && cfgRow.version) || 'v1',
            criteria: (model.criteria || []).map(c => ({
              code: c.code, category: c.category, valueType: c.valueType,
              bindings: (c.bindings || []).map(x => ({ sourceType: x.sourceType, sourceRef: x.sourceRef, transform: x.transform })),
              bands: (c.bands || []).map(x => ({ lowerBound: x.lowerBound, upperBound: x.upperBound, textValue: x.textValue, score: x.score, label: x.label }))
            })),
            weights: (model.classWeights || []).map(w => ({ assetClass: w.assetClass, transportMode: w.transportMode, criterion_ID: w.criterion_ID, included: w.included, weight: w.weight, missingDataPolicy: w.missingDataPolicy })),
            rules: (model.rules || []).filter(r => r.active !== false).map(r => ({ ruleType: r.ruleType, criterion_ID: r.criterion_ID, config: r.config, priority: r.priority })),
            userTypeWeights: (model.userTypeWeights || []).map(u => ({ userType: u.userType, criterion_ID: u.criterion_ID, overUnder: u.overUnder, applicable: u.applicable, weight: u.weight })),
            userTypes: (model.userTypes || []).map(u => ({ code: u.code, weighting: u.weighting })),
            preFilters: filters.map(f => ({ code: f.code, sourceType: f.sourceType, sourceRef: f.sourceRef, condition: f.condition }))
          }))
        }
        return bundleCache.get(model.ID)
      }
      const scored = []; const excluded = []; let skipped = 0
      // Deterministic paging: WHERE active, ORDER BY ID — same fleet ⇒ same scan order.
      for (let offset = 0; offset < limit; offset += pageSize) {
        const take = Math.min(pageSize, limit - offset)
        const page = await db.run(SELECT.from('bridge.management.Bridges')
          .where(ACTIVE_BRIDGE).orderBy('ID').limit(take, offset))
        if (!page.length) break
        // Set-based child reads: ONE query per child table for the whole page, grouped in JS.
        const ids = page.map(b => b.ID)
        const [caps, elems, defs, insps, restrs, attrs] = await Promise.all([
          db.run(SELECT.from('bridge.management.BridgeCapacities').where({ bridge_ID: { in: ids } })),
          db.run(SELECT.from('bridge.management.BridgeElements').where({ bridge_ID: { in: ids } })),
          db.run(SELECT.from('bridge.management.BridgeDefects').where({ bridge_ID: { in: ids } })),
          db.run(SELECT.from('bridge.management.BridgeInspections').where({ bridge_ID: { in: ids } })),
          // R6: fleet restriction context unions BOTH masters (same source as
          // the per-bridge contextFor — the attribute fold cannot drift).
          db.run(SELECT.from('bridge.management.UnifiedRestrictions').where({ bridge_ID: { in: ids }, active: true })),
          db.run(SELECT.from('bridge.management.AttributeValues')
            .where({ objectType: { in: ['bridge', 'Bridge'] }, objectId: { in: ids.map(String) } }))
        ])
        const byB = { caps: groupBy(caps, 'bridge_ID'), elems: groupBy(elems, 'bridge_ID'), defs: groupBy(defs, 'bridge_ID'),
          insps: groupBy(insps, 'bridge_ID'), restrs: groupBy(restrs, 'bridge_ID'), attrs: groupBy(attrs, 'objectId') }
        for (const b of page) {
          const model = resolveModelFor(models, b.assetClass, b.transportMode)
          if (!model || model.aggregationMethod === 'RiskCritBlend-v1') { skipped++; continue } // data-only models only
          const context = buildContext(b, {}, {
            capacities: byB.caps.get(b.ID), elements: byB.elems.get(b.ID), defects: byB.defs.get(b.ID),
            inspections: byB.insps.get(b.ID), restrictions: byB.restrs.get(b.ID), attrRows: byB.attrs.get(String(b.ID))
          })
          const pf = ruleEngine.preFilter(context, filters)
          if (pf.excluded) { excluded.push({ bridge: b.bridgeId, code: pf.code, rationale: pf.rationale || null }); continue }
          const ev = ruleEngine.evaluate({ model, assetClass: b.assetClass, transportMode: b.transportMode, context, cfg: cfgRow, preFilters: filters })
          // B4: restrictionFlag from the LOADED context (active 'Active' restrictions) — the prior
          // hardcoded `false` fabricated an engineer-looking judgement field on data-only runs.
          const restrictionFlag = (context.restrictions || []).some(r => (r.restrictionStatus || 'Active') === 'Active')
          scored.push({ b, ev, model, restrictionFlag })
        }
        if (page.length < take) break // end of fleet
      }
      // B5 deterministic, band-coherent ranking: band severity FIRST (P1 before P2 … — so a
      // non-compensatory band raise also raises the rank), then score DESC within the band, then
      // bridge ID ASC as the tiebreak (same inputs ⇒ same ranks).
      scored.sort((x, y) => (bandIdx(x.ev.band) - bandIdx(y.ev.band)) ||
        (y.ev.priorityScore - x.ev.priorityScore) || (num(x.b.ID) - num(y.b.ID)))
      // B5 (partition): fleetRank is PER (modelCode, modelVersion) PARTITION, restarting at 1 in
      // each. Scores from different models are not commensurable — a single fleet-wide sequence
      // ranked a rail asset "above" a road asset on numbers produced by different parameter sets.
      // The global band-first sort above is order-preserving inside every partition, so each
      // partition's sequence stays band-first (P1 before P2, score DESC within a band, ID tiebreak).
      const partitionRanks = new Map()
      const partitionKeyOf = (ev) => (ev.modelCode || '?') + '|' + (ev.modelVersion ?? 1)
      const assessedAt = new Date().toISOString()
      const assessedBy = req.user?.id || 'system'
      const entries = scored.map((s) => {
        const lk = ruleEngine.DERIVED.deriveLikelihood({ bridge: s.b })
        const pk = partitionKeyOf(s.ev)
        const rank = (partitionRanks.get(pk) || 0) + 1
        partitionRanks.set(pk, rank)
        return {
          ID: cds.utils.uuid(), bridge_ID: s.b.ID, bridgeRef: s.b.bridgeId, bridgeName: s.b.bridgeName,
          likelihood: lk, likelihoodDerived: lk,
          // B3/B4: honest data-only stamp — runType discriminates the batch run, strategy stays
          // NULL (no engineer chose one; 'Maintain' was fabricated) and restrictionFlag comes
          // from the loaded restriction context, never a hardcoded false.
          runType: 'fleet', strategy: null, restrictionFlag: s.restrictionFlag,
          // B3a: a run that trips a forceReview rule is HELD ('pending') — excluded from the
          // default read surfaces until an engineer releases it (releaseRun, ChangeLogged).
          reviewStatus: s.ev.forceReview ? 'pending' : null,
          // B4: coverage disclosure — the resolved weight actually scored vs the model's full
          // weight for this asset class (missing-data criteria are excluded from the former).
          includedWeight: s.ev.includedWeight ?? null, totalWeight: s.ev.totalWeight ?? null,
          priorityScore: s.ev.priorityScore, band: s.ev.band,
          modelCode: s.ev.modelCode, modelVersion: s.ev.modelVersion, weightSetHash: s.ev.weightSetHash,
          criterionBreakdown: JSON.stringify({ rows: s.ev.criterionBreakdown, flags: s.ev.flags, forceReview: s.ev.forceReview, delegated: false, baseScore: s.ev.baseScore, includedWeight: s.ev.includedWeight ?? null, totalWeight: s.ev.totalWeight ?? null, fleet: true }),
          fleetRunId, fleetRank: rank,
          likelyFailureCostAud: s.b.likelyFailureCostAud ?? null, mitigationCostAud: s.b.mitigationCostAud ?? null,
          inputsAvailable: null, inputsTotal: null, conditionAsAtMonths: monthsSince(s.b.lastInspectionDate),
          configVersion: (cfgRow && cfgRow.version) || 'v1', formulaVersion: 'rule-engine-v1',
          // B6: the snapshot is the resolved bundle COPY (reproducible), not a mutable pointer.
          paramSnapshot: resolvedBundle(s.model),
          assessedBy, assessedAt, active: true
        }
      })
      // Batched writes per page-sized chunk: ONE prior-run lookup + ONE batch INSERT per chunk.
      // B3: a fleet run only ever supersedes prior FLEET runs (runType 'fleet'; legacy fleet rows
      // pre-dating the runType column are identified by their fleetRunId). Engineer (manual)
      // judgement runs are NEVER retired by a batch job — they stay active alongside.
      let supersededCount = 0
      for (let i = 0; i < entries.length; i += pageSize) {
        const chunk = entries.slice(i, i + pageSize)
        const priors = await db.run(SELECT.from('bridge.management.PrioritisationAssessment')
          .columns('ID', 'bridge_ID', 'bridgeRef', 'bridgeName', 'runType', 'fleetRunId')
          .where({ bridge_ID: { in: chunk.map(e => e.bridge_ID) }, active: true }))
        const priorByBridge = groupBy(priors.filter(p => p.runType === 'fleet' || p.fleetRunId), 'bridge_ID')
        const audits = []
        for (const e of chunk) {
          const ps = priorByBridge.get(e.bridge_ID) || []
          if (ps.length) {
            await db.run(cds.ql.UPDATE('bridge.management.PrioritisationAssessment')
              .set({ active: false, supersededBy_ID: e.ID }).where({ ID: { in: ps.map(p => p.ID) } }))
            for (const p of ps) audits.push({ prior: p, byId: e.ID })
          }
        }
        await db.run(cds.ql.INSERT.into('bridge.management.PrioritisationAssessment').entries(chunk))
        // B3 (audit): one ChangeLog PER SUPERSEDED RUN ID (parity with the manual-run path) —
        // the count-only fleet log could not answer "who retired run X, and what replaced it?".
        supersededCount += audits.length
        for (const a of audits) {
          try {
            await writeChangeLogs(db, {
              objectType: 'PrioritisationAssessment', objectId: String(a.prior.ID),
              objectName: a.prior.bridgeName || a.prior.bridgeRef || String(a.prior.ID),
              source: 'Prioritisation', changedBy: assessedBy, batchId: fleetRunId,
              changes: [
                { fieldName: 'active', oldValue: 'true', newValue: 'false' },
                { fieldName: 'supersededBy', oldValue: '', newValue: String(a.byId) }
              ]
            })
          } catch (e) { log.warn('fleet supersede audit skipped', { run: a.prior.ID, error: e.message }) }
        }
      }
      try {
        await writeChangeLogs(db, { objectType: 'PrioritisationFleetRun', objectId: fleetRunId, objectName: 'Fleet scoring run',
          source: 'Prioritisation', changedBy: assessedBy,
          changes: [
            { fieldName: 'scored', oldValue: '', newValue: String(scored.length) },
            { fieldName: 'excluded', oldValue: '', newValue: String(excluded.length) },
            // B6: the FULL per-bridge exclusion detail (code + rationale) is PERSISTED on the
            // audit trail — not just returned transiently to the caller — so a past fleet run's
            // population is reconstructible.
            { fieldName: 'exclusions', oldValue: '', newValue: JSON.stringify(excluded) },
            { fieldName: 'superseded', oldValue: '', newValue: String(supersededCount) },
            { fieldName: 'fleetTotal', oldValue: '', newValue: String(fleetTotal) },
            { fieldName: 'truncated', oldValue: '', newValue: String(truncated) },
            // B3a: how many runs this batch HELD for review (forceReview → reviewStatus
            // 'pending') — on the audit trail so a shrunken default worklist is explainable.
            { fieldName: 'heldForReview', oldValue: '', newValue: String(entries.filter(e => e.reviewStatus === 'pending').length) },
            // B5: the (modelCode, modelVersion) rank partitions are STAMPED on the audit trail —
            // a past run's ranked lists are reconstructible per scoring model, count included.
            { fieldName: 'partitions',
              oldValue: '',
              newValue: JSON.stringify(Array.from(partitionRanks, ([k, n]) => {
                const [mc, mv] = k.split('|')
                return { modelCode: mc, modelVersion: Number(mv) || mv, scored: n }
              })) }
          ] })
      } catch (e) { log.warn('fleet ChangeLog skipped', e.message) }
      log.info('Fleet scoring complete', { fleetRunId, scored: scored.length, excluded: excluded.length, skipped, superseded: supersededCount, fleetTotal, truncated, heldForReview: entries.filter(e => e.reviewStatus === 'pending').length })
      return { fleetRunId, scored: scored.length, excluded: excluded.length,
        excludedDetail: JSON.stringify(excluded.slice(0, 50)), fleetTotal, truncated }
    })
    // ── BSI/BHI: compute + persist per bridge (gather) — feeds ConditionByMode (visualise) ──
    this.on('computeBhi', async (req) => {
      const bhiCfg = await refreshBhiConfig() // B8: governed weights/coefficients
      const where = req.data.bridgeID ? { ID: req.data.bridgeID } : {}
      const bridges = await db.run(SELECT.from('bridge.management.Bridges').where(where).limit(1000))
      let updated = 0
      for (const b of bridges) {
        const elements = await db.run(SELECT.from('bridge.management.BridgeElements').where({ bridge_ID: b.ID }))
        const env = bhiLib.envFromBridge(b)
        const r = bhiLib.computeBSI(elements, b.transportMode, env, bhiCfg)
        if (r.bsi === null) continue
        const bhi = bhiLib.computeBHI(r.bsi, env, bhiCfg)
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
      const bhiCfg = await refreshBhiConfig() // B8: governed weights/coefficients
      const E = bhiCfg.env
      const b = await db.run(SELECT.one.from('bridge.management.Bridges').where({ ID: req.data.bridgeID }))
      if (!b) return req.reject(404, 'Bridge not found')
      const elements = await db.run(SELECT.from('bridge.management.BridgeElements').where({ bridge_ID: b.ID }))
      const env = bhiLib.envFromBridge(b)
      const mode = b.transportMode || 'Road'
      const modeKey = bhiLib.modeKeyFor(mode, env.overWater)
      const main = bhiLib.computeBSI(elements, mode, env, bhiCfg)
      const bhi = bhiLib.computeBHI(main.bsi, env, bhiCfg)
      const rsl = bhiLib.remainingServiceLife(main.bsi, env.age, bhiCfg)
      // element buckets actually used (worst per bucket) + the active weight set
      const w = bhiLib.weightsFor(mode, env.overWater, bhiCfg)
      const buckets = {}
      for (const e of elements) {
        const bk = bhiLib.bucketOf(e.elementType)
        const r = Number(e.conditionRating)
        if (Number.isFinite(r) && (bk in w)) buckets[bk] = buckets[bk] === undefined ? r : Math.min(buckets[bk], r)
      }
      const elementBreakdown = Object.entries(w).map(([k, wt]) => ({ bucket: k, weight: wt, rating: buckets[k] ?? null }))
      // B8 calibration honesty: the source calculator's weight sets are ROAD (NHVR/RMS)
      // methodology — non-calibrated modes carry an explicit label until a defensible
      // rail/pedestrian weight set is sourced (governed via bhiWeights.calibrated).
      const CALIBRATION_NOTE = 'road-derived weights (calibrate)'
      const calibrationOf = (mk) => bhiCfg.calibrated.includes(mk) ? null : CALIBRATION_NOTE
      // ALL configured mode weight-models on the same inputs — "how it is normalised across modes"
      const models = Object.keys(bhiCfg.modeWeights).map(mk => {
        const mw = bhiCfg.modeWeights[mk]
        let n = 0, d = 0
        for (const [k, wt] of Object.entries(mw)) if (buckets[k] !== undefined) { n += buckets[k] * wt; d += wt }
        if (d === 0 && env.fallbackCondition !== null) { n = env.fallbackCondition; d = 1 }
        const raw = d > 0 ? n / d : null
        const score = raw === null ? null : Math.max(0, Math.min(10, raw * (main.ageFactor ?? 1) - (main.envPenalty ?? 0)))
        return { model: mk, weights: mw, bsi: score === null ? null : Math.round(score * 100) / 100, calibrated: bhiCfg.calibrated.includes(mk), calibration: calibrationOf(mk) }
      })
      const fb = Object.keys(buckets).length === 0
      // The substituted formulas print the ACTIVE coefficients (config-driven, B8) — what ran.
      const formulas = [
        'BSI_raw = ' + (fb ? ('register condition fallback = ' + env.fallbackCondition) : elementBreakdown.filter(x => x.rating !== null).map(x => x.rating + 'x' + x.weight).join(' + ') + ' / sum(w)'),
        'ageFactor = max(0, 1 - (' + env.age + '/' + E.ageSpanYears + ')x' + E.ageWearMax + ') = ' + main.ageFactor,
        'envPenalty = (' + env.floodExp + '-1)x' + E.floodStep + ' + (' + env.corrZone + '-1)x' + E.corrStep + ' + ' + env.seismic + 'x' + E.seismicStep + ' = ' + main.envPenalty,
        'BSI = clamp(BSI_raw x ageFactor - envPenalty) = ' + main.bsi + ' / 10',
        'vulnerability = min(' + E.vulnCap + ', (' + env.age + '/' + E.vulnAgeSpanYears + ')x' + E.vulnAgeShare + ' + envPenalty)',
        'importFactor = ' + E.importBase + ' + (' + env.importClass + '-1)x' + E.importStep,
        'BHI = BSI x 10 x (1-vulnerability) x importFactor = ' + bhi + ' / 100',
        'RSL = (BSI/10) x (' + E.rslHorizonYears + '-' + env.age + ') x ' + E.rslUtilisation + ' = ' + rsl + ' years'
      ]
      return { detail: JSON.stringify({
        bridge: { ID: b.ID, name: b.bridgeName, ref: b.bridgeId, mode, assetClass: b.assetClass },
        env, coverage: main.coverage, usedFallback: fb,
        bsi: main.bsi, bhi, rsl, priority: bhiLib.bsiPriority(main.bsi),
        modeKey, calibrated: bhiCfg.calibrated.includes(modeKey), calibration: calibrationOf(modeKey),
        weightsSource: 'SystemConfig:bhiWeights (defaults: srv/lib/bhi.js)',
        elementBreakdown, models, formulas
      }) }
    })

    // ── G8: portfolio data-readiness — % of fleet with a resolvable raw value per criterion ──
    this.on('dataReadiness', async () => {
      await refreshBhiConfig() // B8: derived BSI/BHI bindings read the governed weight set
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
    const NS = 'bridge.management.'
    // i18n-able server message (locked rule 6): resolve from the messages bundle, fall back to
    // the documented English default so a missing translation can never blank a rejection.
    const i18nText = (key, args, fallback) => {
      try {
        const t = cds.i18n && cds.i18n.messages && cds.i18n.messages.at(key, args)
        if (t && t !== key) return t
      } catch (_e) { /* fall back below */ }
      return fallback
    }
    // ── B6b: Active-model in-place edit guard ────────────────────────────────────────────────
    // A model that is Active AND referenced by at least one ACTIVE assessment is the stated
    // audit basis of stored runs — editing its scoring parameters in place silently re-writes
    // what every consumer believes those runs were scored with. MATERIAL changes are therefore
    // rejected (409) with a clone-to-new-version direction; Draft/Retired models and
    // non-material fields (descriptions, notes, labels) stay freely editable.
    const MODEL_TABLE = {
      Models: 'PrioritisationModel', ModelCriteria: 'ModelCriterion',
      ModelClassWeights: 'AssetClassCriterionWeight', ModelRules: 'AggregationRule',
      ModelBindings: 'CriterionSourceBinding', ModelValueBands: 'CriterionValueBand'
    }
    const NON_MATERIAL_FIELDS = {
      Models: ['name', 'description', 'status', 'reviewedBy', 'reviewedAt', 'reviewSource'],
      ModelCriteria: ['name', 'description', 'standardRef', 'displayOrder'],
      ModelClassWeights: [],                       // every field moves a score → all material
      ModelRules: ['rationale'],
      ModelBindings: ['unit'],
      ModelValueBands: ['label', 'displayOrder']
    }
    const FRAMEWORK_FIELDS = ['ID', 'createdAt', 'createdBy', 'modifiedAt', 'modifiedBy']
    // Target row id of an UPDATE: payload key, bound param, or the ID predicate of the query.
    const targetIdOf = (req) => {
      if (req.data && req.data.ID) return req.data.ID
      const p = req.params && req.params[req.params.length - 1]
      if (p) return p.ID || p
      const where = req.query && req.query.UPDATE && req.query.UPDATE.where
      if (Array.isArray(where)) {
        for (let i = 0; i + 2 < where.length; i++) {
          const r = where[i]
          if (r && r.ref && r.ref[r.ref.length - 1] === 'ID' && where[i + 1] === '=' &&
              where[i + 2] && where[i + 2].val !== undefined) return where[i + 2].val
        }
      }
      return null
    }
    // Resolve the OWNING PrioritisationModel of a Model Builder row (direct, or via criterion).
    const owningModelOf = async (en, id) => {
      if (!id) return null
      if (en === 'Models') return db.run(SELECT.one.from(NS + 'PrioritisationModel').where({ ID: id }))
      let modelId = null
      if (en === 'ModelBindings' || en === 'ModelValueBands') {
        const row = await db.run(SELECT.one.from(NS + MODEL_TABLE[en]).columns('criterion_ID').where({ ID: id }))
        if (!row || !row.criterion_ID) return null
        const c = await db.run(SELECT.one.from(NS + 'ModelCriterion').columns('model_ID').where({ ID: row.criterion_ID }))
        modelId = c && c.model_ID
      } else {
        const row = await db.run(SELECT.one.from(NS + MODEL_TABLE[en]).columns('model_ID').where({ ID: id }))
        modelId = row && row.model_ID
      }
      return modelId ? db.run(SELECT.one.from(NS + 'PrioritisationModel').where({ ID: modelId })) : null
    }
    const guardActiveModelEdit = async (en, req) => {
      const material = Object.keys(req.data || {})
        .filter(k => !FRAMEWORK_FIELDS.includes(k) && !NON_MATERIAL_FIELDS[en].includes(k))
      if (!material.length) return // description/notes-type edit — always allowed
      const m = await owningModelOf(en, targetIdOf(req))
      if (!m || m.status !== 'Active') return // Draft/Retired models stay freely editable
      const cnt = await db.run(SELECT.one`count(*) as n`.from(NS + 'PrioritisationAssessment')
        .where({ modelCode: m.code, modelVersion: m.version, active: true }))
      const refs = num(cnt && (cnt.n ?? cnt.N))
      if (!refs) return // Active but unreferenced — still safely editable
      log.warn('Model Builder material edit REJECTED on referenced Active model', {
        entity: en, model: m.code, version: m.version, activeRuns: refs, fields: material })
      return req.reject(409, i18nText('modelActiveInUse', [m.code, m.version, refs],
        `Model ${m.code} v${m.version} is Active and referenced by ${refs} active assessment run(s). ` +
        'Editing its scoring parameters in place would silently re-write the stated basis of those runs. ' +
        'Use cloneModel to create a new Draft version, adjust it, and activate it after review.'))
    }
    for (const en of MODEL_ENTITIES) {
      const target = this.entities[en]
      if (!target) continue
      this.before(['CREATE', 'UPDATE'], target, async (req) => {
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
        if (req.event === 'UPDATE') return guardActiveModelEdit(en, req)
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

    // ── B6b: cloneModel — the GOVERNED change path for a referenced Active model ─────────────
    // Deep-copies the FULL bundle (model + criteria + bindings + value bands + class weights +
    // rules + user-type weights) to version = max(version)+1 of the same code, status 'Draft',
    // with NEW UUIDs throughout (criterion references remapped). Admin-gated in CDS; ChangeLogged.
    this.on('cloneModel', async (req) => {
      const srcID = req.data.modelID
      const src = srcID && await db.run(SELECT.one.from(NS + 'PrioritisationModel').where({ ID: srcID }))
      if (!src) return req.reject(404, i18nText('modelNotFound', [String(srcID)], 'Model not found.'))
      const maxRow = await db.run(SELECT.one`max(version) as v`.from(NS + 'PrioritisationModel').where({ code: src.code }))
      const newVersion = num(maxRow && (maxRow.v ?? maxRow.V)) + 1
      const strip = (row) => {
        const c = Object.assign({}, row)
        for (const k of FRAMEWORK_FIELDS) delete c[k]
        return c
      }
      const newModelID = cds.utils.uuid()
      await db.run(cds.ql.INSERT.into(NS + 'PrioritisationModel').entries(Object.assign(strip(src), {
        ID: newModelID, version: newVersion, status: 'Draft',
        // a clone is NOT signed off — review fields restart empty for the new version
        reviewedBy: null, reviewedAt: null
      })))
      // criteria first — the old→new id map drives every child remap below
      const criteria = await db.run(SELECT.from(NS + 'ModelCriterion').where({ model_ID: srcID }))
      const critMap = new Map()
      for (const c of criteria) critMap.set(c.ID, cds.utils.uuid())
      if (criteria.length) {
        await db.run(cds.ql.INSERT.into(NS + 'ModelCriterion').entries(criteria.map(c =>
          Object.assign(strip(c), { ID: critMap.get(c.ID), model_ID: newModelID }))))
      }
      const srcCritIds = criteria.map(c => c.ID)
      const remapCrit = (id) => (id && critMap.get(id)) || null
      const copyChildren = async (table, rows, patch) => {
        if (!rows.length) return 0
        await db.run(cds.ql.INSERT.into(NS + table).entries(rows.map(r =>
          Object.assign(strip(r), { ID: cds.utils.uuid() }, patch(r)))))
        return rows.length
      }
      const bindings = srcCritIds.length ? await db.run(SELECT.from(NS + 'CriterionSourceBinding').where({ criterion_ID: { in: srcCritIds } })) : []
      const bands = srcCritIds.length ? await db.run(SELECT.from(NS + 'CriterionValueBand').where({ criterion_ID: { in: srcCritIds } })) : []
      const classWeights = await db.run(SELECT.from(NS + 'AssetClassCriterionWeight').where({ model_ID: srcID }))
      const rules = await db.run(SELECT.from(NS + 'AggregationRule').where({ model_ID: srcID }))
      const userTypeWeights = await db.run(SELECT.from(NS + 'UserTypeCriterionWeight').where({ model_ID: srcID }))
      const counts = {
        criteria: criteria.length,
        bindings: await copyChildren('CriterionSourceBinding', bindings, (r) => ({ criterion_ID: remapCrit(r.criterion_ID) })),
        bands: await copyChildren('CriterionValueBand', bands, (r) => ({ criterion_ID: remapCrit(r.criterion_ID) })),
        classWeights: await copyChildren('AssetClassCriterionWeight', classWeights, (r) => ({ model_ID: newModelID, criterion_ID: remapCrit(r.criterion_ID) })),
        rules: await copyChildren('AggregationRule', rules, (r) => ({ model_ID: newModelID, criterion_ID: remapCrit(r.criterion_ID) })),
        userTypeWeights: await copyChildren('UserTypeCriterionWeight', userTypeWeights, (r) => ({ model_ID: newModelID, criterion_ID: remapCrit(r.criterion_ID) }))
      }
      try {
        await writeChangeLogs(db, {
          objectType: 'PrioritisationModels', objectId: String(newModelID),
          objectName: src.code + ' v' + newVersion + ' (clone)', source: 'PrioritisationModelBuilder',
          changedBy: req.user?.id || 'system',
          changes: [
            { fieldName: 'clonedFrom', oldValue: '', newValue: String(srcID) },
            { fieldName: 'code', oldValue: '', newValue: String(src.code) },
            { fieldName: 'version', oldValue: String(src.version), newValue: String(newVersion) },
            { fieldName: 'status', oldValue: '', newValue: 'Draft' },
            { fieldName: 'bundle', oldValue: '', newValue: JSON.stringify(counts) }
          ]
        })
      } catch (e) { log.warn('cloneModel ChangeLog skipped:', e.message) }
      log.info('Prioritisation model cloned to new Draft version', { from: srcID, to: newModelID, code: src.code, version: newVersion, counts })
      return Object.assign({ modelID: newModelID, code: src.code, version: newVersion, status: 'Draft' }, counts)
    })

    // ── reportPdf: server-rendered, branded, paginated A4 exec one-pager ──
    // Figures are computed HERE from the immutable runs (not the client's view) so the document is
    // reproducible and reconciles exactly to the stored figures. Returns base64 PDF bytes.
    this.on('reportPdf', async () => {
      // B3a/B3b: the portfolio reads the EFFECTIVE run set — review-held runs are excluded
      // (until releaseRun) and a bridge carrying both an active manual and an active fleet run
      // counts ONCE (manual wins, newest within type) — srv/lib/effective-runs.js, the same
      // rules BandSummary and the default worklist apply.
      const allActive = await db.run(SELECT.from('bridge.management.PrioritisationAssessment')
        .where({ active: true }).orderBy({ priorityScore: 'desc' }))
      const heldCount = allActive.filter(r => String(r.reviewStatus || '') === 'pending').length
      const runs = effectiveRuns(allActive).sort((a, b) => num(b.priorityScore) - num(a.priorityScore))
      const rawCfg = await db.run(SELECT.one.from('bridge.management.PrioritisationConfig')
        .where({ active: true }).orderBy({ modifiedAt: 'desc' })) || {}
      const cfg = await activeConfig()
      let totalBridges = runs.length
      try { const c = await db.run(SELECT.one`count(*) as n`.from('bridge.management.Bridges')); totalBridges = (c && (c.n ?? c.N)) || runs.length } catch (_e) { /* keep */ }

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
      // B3a disclosure: held runs are excluded from every figure above — say so, with the count.
      if (heldCount > 0) doc.kv('Held for review (excluded)', heldCount + ' run(s) pending engineering review (forceReview) — release via the worklist to include them')
      doc.kv('Endorsed by / date', '____________________ / __________')
      doc.heading('Methodology appendix (reproducible)')
      // B6a: the appendix documents HOW the runs in THIS portfolio were actually scored — it
      // branches on each stored run's formulaVersion instead of printing one static text.
      // rule-engine-v1 runs (modelCode stamped) get the configurable-engine methodology; legacy
      // v1-normalised runs keep the approved-formula text; a mixed portfolio prints BOTH with
      // per-method run counts. An empty portfolio documents the approved formula (the default).
      const isRuleRun = (r) => String(r.formulaVersion || '').startsWith('rule-engine')
      const ruleRuns = runs.filter(isRuleRun)
      const legacyRuns = runs.filter(r => !isRuleRun(r))
      const ladderTxt = (cfg.bandThresholds || []).slice()
        .sort((a, b) => num(b.min) - num(a.min)).map(b => b.min).join('/')
      if (ruleRuns.length && legacyRuns.length) {
        doc.paragraph('Mixed-method portfolio: ' + ruleRuns.length + ' rule-engine run(s) and ' +
          legacyRuns.length + ' approved-formula run(s). Both methodologies are documented below; ' +
          'every stored run names its own method in formulaVersion.')
      }
      if (legacyRuns.length || !ruleRuns.length) {
        const legacyVersions = Array.from(new Set(legacyRuns.map(r => r.formulaVersion || formulaVersion)))
        doc.kv('Approved formula', (ruleRuns.length ? legacyRuns.length + ' run(s) · ' : '') +
          (legacyVersions.length ? legacyVersions.join(', ') : formulaVersion))
        doc.paragraph('criticality = sum(dimension x weight), weights ' + w.join(' / ') + ' (safety/network/financial/environmental/reputational) normalised to 1. ' +
          'tier = round(criticality) clamped 1..5. residual = likelihood x tier (an active restriction is a treatment FLAG, never a score input). ' +
          'priorityScore = ' + pw[0] + ' riskN + ' + pw[1] + ' critN + ' + pw[2] + ' stratN (normalised); band thresholds 80/60/40/20 -> P1..P5. ' +
          'maxResidual ' + cfg.maxResidual + ', maxCriticality ' + cfg.maxCriticality + '. ' +
          'Every run stores its inputs and its exact parameter snapshot, so any past ranked list reproduces byte-identically.')
      }
      if (ruleRuns.length) {
        // One sub-section per (modelCode, modelVersion): run count, frozen criteria count (from
        // the immutable criterionBreakdown / paramSnapshot, never the live model) + weightSetHash.
        const byModel = new Map()
        for (const r of ruleRuns) {
          const key = (r.modelCode || '?') + ' v' + (r.modelVersion ?? 1)
          let e = byModel.get(key)
          if (!e) { e = { runs: 0, hashes: new Set(), criteria: 0 }; byModel.set(key, e) }
          e.runs++
          if (r.weightSetHash) e.hashes.add(r.weightSetHash)
          if (!e.criteria) {
            try { const cb = JSON.parse(r.criterionBreakdown || '{}'); if (Array.isArray(cb.rows)) e.criteria = cb.rows.length } catch (_e) { /* fall through to paramSnapshot */ }
          }
          if (!e.criteria) {
            try { const ps = JSON.parse(r.paramSnapshot || '{}'); if (Array.isArray(ps.criteria)) e.criteria = ps.criteria.length } catch (_e) { /* unknown */ }
          }
        }
        doc.kv('Configurable rule engine', ruleRuns.length + ' run(s) · rule-engine-v1')
        doc.paragraph('Each criterion raw value resolves from its governed source binding, maps to a 0..100 score through the model value bands, and ' +
          'aggregates as a weighted sum: priorityScore = sum(score x weight x confidence x user-type factor) / sum(weight). ' +
          'Non-compensatory rules (SafetyFloor / Veto / Escalate / HurdleMin) then adjust the band so a safety-critical signal is never averaged away; ' +
          'band thresholds ' + ladderTxt + ' -> P1..P5. Missing data follows the explicit per-criterion policy (flagged, never a silent zero). ' +
          'Every run freezes the RESOLVED model bundle (criteria, bindings, value bands, class weights, rules, pre-filters) in its paramSnapshot ' +
          'and stamps the weightSetHash naming the exact parameter set, so any past ranked list reproduces byte-identically.')
        for (const [key, e] of byModel) {
          doc.kv('Model ' + key, e.runs + ' run(s) · ' + (e.criteria || '?') + ' criteria frozen per run')
          const hashes = Array.from(e.hashes)
          doc.kv('weightSetHash', hashes.length === 1 ? hashes[0]
            : hashes.length + ' parameter sets: ' + hashes.map(h => String(h).slice(0, 12)).join(', '))
        }
      }

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
      // B3/B4: every service CREATE is an engineer-judgement run; runType 'fleet' is reserved
      // for the scoreFleet batch path (a client cannot masquerade a manual POST as a fleet run).
      Object.assign(d, {
        runType: 'manual',
        // B3a: engineer-judgement runs are never review-held (the engineer IS the review) and a
        // client cannot stamp a hold — reviewStatus is reserved for the scoreFleet batch path.
        reviewStatus: null,
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
        await refreshBhiConfig() // B8: the derived BSI/BHI criteria read the governed weight set
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
          // B4: stamp the coverage pair on the run (null on delegated approved-formula runs).
          d.includedWeight = ev.includedWeight ?? null
          d.totalWeight = ev.totalWeight ?? null
          d.criterionBreakdown = JSON.stringify({
            rows: ev.criterionBreakdown, flags: ev.flags, forceReview: ev.forceReview,
            delegated: ev.delegated, baseScore: ev.baseScore ?? null,
            includedWeight: ev.includedWeight ?? null, totalWeight: ev.totalWeight ?? null
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

    // ── Council B3a: releaseRun — clear a review hold (manage scope, ChangeLogged) ──
    // The HOLD (reviewStatus='pending') is a lifecycle flag like `active`, not a scored output —
    // clearing it never touches the immutable run figures. Inactive (superseded/deactivated)
    // runs are rejected: only the CURRENT run can be released back into the default surfaces.
    this.on('releaseRun', async (req) => {
      const id = req.data && req.data.ID
      const run = id && await db.run(SELECT.one.from('bridge.management.PrioritisationAssessment').where({ ID: id }))
      if (!run) return req.reject(404, i18nText('runNotFound', [String(id)], `Assessment run ${id} was not found.`))
      if (run.active === false) {
        return req.reject(409, i18nText('runInactiveRelease', [String(id)],
          `Assessment run ${id} is not active (superseded or deactivated) — only the current review-held run can be released.`))
      }
      if (!run.reviewStatus) return { ID: run.ID, reviewStatus: null } // idempotent: nothing to clear
      await db.run(cds.ql.UPDATE('bridge.management.PrioritisationAssessment')
        .set({ reviewStatus: null }).where({ ID: id }))
      try {
        await writeChangeLogs(db, {
          objectType: 'PrioritisationAssessment', objectId: String(id),
          objectName: run.bridgeName || run.bridgeRef || String(id),
          source: 'Prioritisation', changedBy: req.user?.id || 'system',
          changes: [{ fieldName: 'reviewStatus', oldValue: String(run.reviewStatus), newValue: '' }]
        })
      } catch (e) { log.error('releaseRun ChangeLog failed:', e.message) }
      log.info('Prioritisation run released from review hold', { id, bridgeRef: run.bridgeRef, by: req.user?.id || 'system' })
      return { ID: run.ID, reviewStatus: null }
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
