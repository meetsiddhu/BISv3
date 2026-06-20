'use strict'

// Single source of truth for the bridge register's data-quality / completeness tier
// (DQ-1, council fix #4). Open-data-sourced records (OpenStreetMap, NHVR National
// Network Map, etc.) frequently lack geometry, structural detail or condition data;
// previously that gap was only narrated in free-text `remarks`. This module turns it
// into a first-class, queryable score + tier so incomplete records are visibly badged
// and filterable — you should never act on an open-data stub as if it were a surveyed
// asset. The field list IS the definition of "complete enough to rely on", grouped so
// each engineering concern is weighted, not just counted.

// Weighted field groups. A group contributes its weight x (fraction of its fields that
// are populated). Weights are deliberate, not magic: identity + location are
// non-negotiable for a register entry; structural + condition drive every downstream
// assessment; administrative is supporting context.
const FIELD_GROUPS = [
  { key: 'identity',       weight: 20, fields: ['bridgeId', 'bridgeName', 'assetClass'] },
  { key: 'location',       weight: 20, fields: ['latitude', 'longitude', 'state'] },
  { key: 'structural',     weight: 25, fields: ['structureType', 'material', 'yearBuilt', 'spanLength', 'totalLength', 'numberOfLanes'] },
  { key: 'condition',      weight: 25, fields: ['conditionRating', 'lastInspectionDate'] },
  { key: 'administrative', weight: 10, fields: ['assetOwner', 'route', 'lga'] }
]

const TIER_COMPLETE = 'Complete'
const TIER_PARTIAL = 'Partial'
const TIER_INCOMPLETE = 'Incomplete'

// Thresholds: a register entry is only "Complete" when it is essentially fully populated;
// "Partial" covers usable-but-gappy records; everything thinner is an "Incomplete" stub.
const COMPLETE_AT = 90
const PARTIAL_AT = 60

function isPopulated (v) {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (typeof v === 'number') return Number.isFinite(v)
  return true
}

function tierForScore (score) {
  if (score >= COMPLETE_AT) return TIER_COMPLETE
  if (score >= PARTIAL_AT) return TIER_PARTIAL
  return TIER_INCOMPLETE
}

// Score a bridge row -> { score: 0..100, tier }. Pure: no DB, no side effects, so it is
// safe to call from a handler on save or from a backfill loop.
function scoreCompleteness (bridge) {
  if (!bridge || typeof bridge !== 'object') return { score: 0, tier: TIER_INCOMPLETE }
  let total = 0
  let earned = 0
  for (const g of FIELD_GROUPS) {
    total += g.weight
    const present = g.fields.filter(f => isPopulated(bridge[f])).length
    earned += g.weight * (present / g.fields.length)
  }
  const score = total > 0 ? Math.round((earned / total) * 100) : 0
  return { score, tier: tierForScore(score) }
}

module.exports = {
  FIELD_GROUPS, TIER_COMPLETE, TIER_PARTIAL, TIER_INCOMPLETE, COMPLETE_AT, PARTIAL_AT,
  isPopulated, tierForScore, scoreCompleteness
}
