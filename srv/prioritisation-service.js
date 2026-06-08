const cds = require('@sap/cds')
const { SELECT } = cds.ql
const { writeChangeLogs } = require('./audit-log')
const { getConfig } = require('./system-config')
const engine = require('./lib/prioritisation')

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
    const activeConfig = async () => {
      let row = null
      try {
        row = await db.run(SELECT.one.from('bridge.management.PrioritisationConfig')
          .where({ active: true }).orderBy({ modifiedAt: 'desc' }))
      } catch (e) { log.warn('PrioritisationConfig load failed; using engine defaults:', e.message) }
      return engine.resolveConfig(row || {})
    }

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
      delete facts.bridge // strip the raw entity row — return only the federated facts
      return facts
    })

    // ── CREATE: feature-flag gate + SERVER-SIDE compute + immutable run stamp ──
    this.before('CREATE', Assessments, async (req) => {
      if (!(await isEnabled())) return req.reject(403, 'The Bridge Prioritisation module is currently disabled.')
      const d = req.data
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
          if (d.inputsAvailable == null) d.inputsAvailable = f.inputsAvailable
          if (d.inputsTotal == null) d.inputsTotal = f.inputsTotal
          if (d.conditionAsAtMonths == null) d.conditionAsAtMonths = f.conditionAsAtMonths
        }
      }
    })

    // ChangeLog on CREATE (rule 3) — non-bulk source so a transient miss warns, not blocks.
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
