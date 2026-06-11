'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Council B3a/B3b — ONE definition of "the effective current run set" shared by
// every default read surface (reportPdf portfolio + BandSummary aggregation; the
// worklist READ guard in srv/prioritisation-service.js applies the same rules in
// SQL). Pure functions, no I/O — works identically on SQLite and HANA rows.
//
//   B3a  a run held for review (reviewStatus = 'pending', stamped by scoreFleet
//        when a non-compensatory rule trips forceReview) is EXCLUDED until
//        releaseRun clears the hold. Held runs stay readable via an explicit
//        reviewStatus filter — they are hidden from DEFAULT surfaces only.
//   B3b  when a bridge has BOTH an active manual run and an active fleet run
//        (scoreFleet never retires engineer judgement), the surfaces count/show
//        ONE run per bridge with deterministic precedence: runType 'manual'
//        beats 'fleet'; newest first within a type. Legacy rows (runType NULL)
//        are manual unless they carry a fleetRunId (pre-runType fleet batches).
// ─────────────────────────────────────────────────────────────────────────────

const isHeld = (r) => String((r && r.reviewStatus) || '') === 'pending'
// fleet = explicit runType OR a legacy pre-runType batch row (identified by fleetRunId,
// the same heuristic the scoreFleet supersede path uses).
const isFleet = (r) => r.runType === 'fleet' || (!r.runType && !!r.fleetRunId)
const typeRank = (r) => (isFleet(r) ? 1 : 0) // manual (incl. legacy null) wins
const ts = (r) => {
  const t = Date.parse(r.assessedAt || r.createdAt || '')
  return Number.isFinite(t) ? t : 0
}

/**
 * Reduce a set of ACTIVE assessment rows to the effective one-run-per-bridge set:
 * review-held rows dropped first, then manual-beats-fleet, newest-within-type.
 * Rows with active === false are ignored defensively (callers pass active rows).
 */
function effectiveRuns (runs) {
  const byBridge = new Map()
  for (const r of (runs || [])) {
    if (!r || r.active === false || isHeld(r)) continue
    const key = r.bridge_ID != null ? 'b:' + r.bridge_ID : 'r:' + (r.bridgeRef || r.ID)
    const cur = byBridge.get(key)
    if (!cur) { byBridge.set(key, r); continue }
    // candidate r beats cur when its type ranks higher (manual < fleet) or, same type, it is newer
    const verdict = (typeRank(r) - typeRank(cur)) || (ts(cur) - ts(r))
    if (verdict < 0) byBridge.set(key, r)
  }
  return Array.from(byBridge.values())
}

module.exports = { effectiveRuns, isHeld, isFleet }
