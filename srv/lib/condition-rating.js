'use strict'

// Single source of truth for bridge condition rating (ARCH-2 / INSPECT-5).
//
// Canonical STORED scale = legacy BMS 1-10 where 10 = best (Good) and 1 = worst
// (Critical). The human-readable LABEL uses the TfNSW Bridge Inspection Manual 1-5
// band (1=Good .. 5=Critical). `conditionRating` therefore stays 1-10 for backward
// compatibility; everything else derives from it through this module so the mapping is
// defined exactly once. See CLAUDE.md §"Condition rating".

const CONDITION_LABELS = { 1: 'Good', 2: 'Fair', 3: 'Poor', 4: 'Very Poor', 5: 'Critical' } // TfNSW 1-5
const LEGACY_RATING_TO_TFNSW = { 10: 1, 9: 1, 8: 2, 7: 2, 6: 3, 5: 3, 4: 4, 3: 4, 2: 5, 1: 5 }
// Representative legacy 1-10 rating for each TfNSW band (mid-point; 10=best..2=worst).
// Used when only a TfNSW label is known and a legacy rating must be synthesised.
const TFNSW_TO_LEGACY = { 1: 10, 2: 8, 3: 6, 4: 4, 5: 2 }

const MIN_LEGACY = 1
const MAX_LEGACY = 10

function isValidLegacy (rating) {
  const r = Number(rating)
  return Number.isFinite(r) && r >= MIN_LEGACY && r <= MAX_LEGACY
}

// Map a legacy 1-10 rating to the TfNSW 1-5 band. Returns null if out of range.
function legacyToTfNSW (rating) {
  const r = Math.round(Number(rating))
  return LEGACY_RATING_TO_TFNSW[r] || null
}

function conditionLabel (tfnsw) {
  return CONDITION_LABELS[tfnsw] || null
}

// Reverse: a TfNSW label ('Good'..'Critical') -> TfNSW band (1-5), or null if unknown.
function labelToTfNSW (label) {
  const k = Object.keys(CONDITION_LABELS).find(key => CONDITION_LABELS[key] === label)
  return k ? Number(k) : null
}

// A TfNSW label -> representative legacy 1-10 rating (correct direction), or null.
function labelToLegacy (label) {
  const t = labelToTfNSW(label)
  return t ? TFNSW_TO_LEGACY[t] : null
}

// High-priority on the TfNSW band = Very Poor (4) or Critical (5). For legacy input
// this is equivalent to rating <= 4 (10=best), but stated on the canonical band so it
// stays correct if a TfNSW value is ever supplied directly.
function isHighPriorityTfNSW (tfnsw) {
  return Number(tfnsw) >= 4
}

// Derive the {condition, highPriorityAsset} pair from a legacy rating. Returns null if
// the rating is out of the 1-10 range so callers can raise a validation error.
function deriveCondition (legacyRating) {
  if (!isValidLegacy(legacyRating)) return null
  const tfnsw = legacyToTfNSW(legacyRating)
  return { tfnsw, condition: conditionLabel(tfnsw), highPriorityAsset: isHighPriorityTfNSW(tfnsw) }
}

module.exports = {
  CONDITION_LABELS, LEGACY_RATING_TO_TFNSW, TFNSW_TO_LEGACY, MIN_LEGACY, MAX_LEGACY,
  isValidLegacy, legacyToTfNSW, conditionLabel, labelToTfNSW, labelToLegacy,
  isHighPriorityTfNSW, deriveCondition
}
