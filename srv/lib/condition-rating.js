'use strict'

// Single source of truth for bridge condition rating (ARCH-2 / INSPECT-5).
//
// Canonical STORED scale = legacy BMS 1-10 where 10 = best (Good) and 1 = worst
// (Critical). The human-readable LABEL uses the 1-5 condition band common in
// bridge inspection manuals (1=Good .. 5=Critical). `conditionRating` therefore
// stays 1-10 for backward compatibility; everything else derives from it through
// this module so the mapping is defined exactly once. See CLAUDE.md §"Condition rating".

const CONDITION_LABELS = { 1: 'Good', 2: 'Fair', 3: 'Poor', 4: 'Very Poor', 5: 'Critical' } // 1-5 band
const LEGACY_RATING_TO_BAND = { 10: 1, 9: 1, 8: 2, 7: 2, 6: 3, 5: 3, 4: 4, 3: 4, 2: 5, 1: 5 }
// Representative legacy 1-10 rating for each condition band (mid-point; 10=best..2=worst).
// Used when only a band label is known and a legacy rating must be synthesised.
const BAND_TO_LEGACY = { 1: 10, 2: 8, 3: 6, 4: 4, 5: 2 }

const MIN_LEGACY = 1
const MAX_LEGACY = 10

function isValidLegacy (rating) {
  const r = Number(rating)
  return Number.isFinite(r) && r >= MIN_LEGACY && r <= MAX_LEGACY
}

// Map a legacy 1-10 rating to the 1-5 condition band. Returns null if out of range.
function legacyToBand (rating) {
  const r = Math.round(Number(rating))
  return LEGACY_RATING_TO_BAND[r] || null
}

function conditionLabel (band) {
  return CONDITION_LABELS[band] || null
}

// Reverse: a band label ('Good'..'Critical') -> condition band (1-5), or null if unknown.
function labelToBand (label) {
  const k = Object.keys(CONDITION_LABELS).find(key => CONDITION_LABELS[key] === label)
  return k ? Number(k) : null
}

// A band label -> representative legacy 1-10 rating (correct direction), or null.
function labelToLegacy (label) {
  const t = labelToBand(label)
  return t ? BAND_TO_LEGACY[t] : null
}

// High-priority on the condition band = Very Poor (4) or Critical (5). For legacy input
// this is equivalent to rating <= 4 (10=best), but stated on the canonical band so it
// stays correct if a band value is ever supplied directly.
function isHighPriorityBand (band) {
  return Number(band) >= 4
}

// Derive the {condition, highPriorityAsset} pair from a legacy rating. Returns null if
// the rating is out of the 1-10 range so callers can raise a validation error.
function deriveCondition (legacyRating) {
  if (!isValidLegacy(legacyRating)) return null
  const band = legacyToBand(legacyRating)
  return { band, condition: conditionLabel(band), highPriorityAsset: isHighPriorityBand(band) }
}

module.exports = {
  CONDITION_LABELS, LEGACY_RATING_TO_BAND, BAND_TO_LEGACY, MIN_LEGACY, MAX_LEGACY,
  isValidLegacy, legacyToBand, conditionLabel, labelToBand, labelToLegacy,
  isHighPriorityBand, deriveCondition
}
