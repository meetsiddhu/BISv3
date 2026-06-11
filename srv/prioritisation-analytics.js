const cds = require('@sap/cds')
const { SELECT } = cds.ql
const { effectiveRuns } = require('./lib/effective-runs')

// ─────────────────────────────────────────────────────────────────────────────
// Council B3a/B3b — BandSummary is aggregated over the EFFECTIVE run set
// (srv/lib/effective-runs.js): review-held runs (reviewStatus='pending') are
// excluded until released, and a bridge carrying BOTH an active manual and an
// active fleet run counts ONCE (manual beats fleet, newest within type). The
// aggregation runs in the service layer because the dedup needs a correlated
// per-bridge precedence rule — this JS path behaves identically on SQLite and
// HANA, where a portable CDL window-function view does not exist. The result
// is small by construction (≤ one row per band), so handler-side aggregation
// costs one indexed read of the active runs.
// ─────────────────────────────────────────────────────────────────────────────
module.exports = class PrioritisationAnalyticsService extends cds.ApplicationService {
  async init () {
    const db = await cds.connect.to('db')
    const log = cds.log('bms')
    const { BandSummary } = this.entities
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

    this.on('READ', BandSummary, async () => {
      const rows = await db.run(SELECT.from('bridge.management.PrioritisationAssessment')
        .columns('ID', 'band', 'bridge_ID', 'bridgeRef', 'runType', 'fleetRunId', 'reviewStatus',
          'active', 'assessedAt', 'createdAt', 'mitigationCostAud', 'likelyFailureCostAud', 'priorityScore')
        .where({ active: true }))
      const eff = effectiveRuns(rows)
      const byBand = new Map()
      for (const r of eff) {
        const e = byBand.get(r.band) || { band: r.band, runs: 0, mitigationAud: 0, failureExposureAud: 0, _score: 0, _n: 0 }
        e.runs++
        e.mitigationAud += num(r.mitigationCostAud)
        e.failureExposureAud += num(r.likelyFailureCostAud)
        if (r.priorityScore != null) { e._score += Number(r.priorityScore); e._n++ }
        byBand.set(r.band, e)
      }
      const out = Array.from(byBand.values())
        .sort((a, b) => String(a.band).localeCompare(String(b.band)))
        .map((e) => ({
          band: e.band, runs: e.runs,
          mitigationAud: Math.round(e.mitigationAud * 100) / 100,
          failureExposureAud: Math.round(e.failureExposureAud * 100) / 100,
          avgScore: e._n ? Math.round((e._score / e._n) * 100) / 100 : null
        }))
      log.debug('BandSummary served from the effective run set', { activeRuns: rows.length, effective: eff.length, bands: out.length })
      return out
    })

    await super.init()
  }
}
