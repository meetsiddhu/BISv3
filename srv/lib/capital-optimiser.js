'use strict'

// ─────────────────────────────────────────────────────────────────────────────
// Budget-constrained capital-program optimiser (CAPEX-1)
//
// Answers the question executives actually ask: "given $X this year, which
// structures do we fund to buy down the most risk / get the best return?"
//
// Input: scored candidates [{ id, name, band, priorityScore, costAud,
//   benefitCostRatio?, expectedValueAud?, riskReductionAud? }] and a budget.
// Output: a selected set and the leftover, maximising total benefit within budget.
//
// Two transparent strategies (config-selectable):
//   'greedy-bcr' (default) — sort by benefit-density (benefit per $) desc, take while
//                            it fits. Fast, explainable, near-optimal for many small items.
//   'knapsack'             — exact 0/1 dynamic-programming optimum (budget discretised to
//                            `granularityAud` buckets) when an exact answer is wanted and the
//                            item count is modest.
//
// Benefit precedence per item: riskReductionAud → (expectedValueAud × benefitCostRatio
// proxy) → expectedValueAud → a band weight. Never silently zero — items with no benefit
// signal fall back to a band-derived weight so they still rank sensibly.
// Pure functions, no I/O, config-driven.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
const BAND_WEIGHT = { P1: 100, P2: 70, P3: 40, P4: 20, P5: 10 }

function benefitOf (item) {
  if (num(item.riskReductionAud) !== null) return num(item.riskReductionAud)
  const ev = num(item.expectedValueAud)
  const bcr = num(item.benefitCostRatio)
  if (ev !== null && bcr !== null) return ev * bcr
  if (ev !== null) return ev
  // fall back to a band-derived weight so unpriced items still rank (never a silent zero)
  return BAND_WEIGHT[item.band] || 0
}

function normalise (candidates) {
  return (candidates || [])
    .filter(c => c && num(c.costAud) !== null && num(c.costAud) > 0)
    .map(c => ({ ...c, _cost: num(c.costAud), _benefit: benefitOf(c) }))
}

// ── Greedy by benefit density ─────────────────────────────────────────────────
function greedyBcr (candidates, budget) {
  const items = normalise(candidates)
    .map(c => ({ ...c, _density: c._benefit / c._cost }))
    .sort((a, b) => b._density - a._density)
  const selected = []
  let spent = 0
  for (const it of items) {
    if (spent + it._cost <= budget) { selected.push(it); spent += it._cost }
  }
  return finalize(selected, spent, budget, candidates)
}

// ── Exact 0/1 knapsack (budget bucketed) ───────────────────────────────────────
function knapsack (candidates, budget, granularityAud) {
  const g = num(granularityAud) || Math.max(1, Math.round(budget / 1000)) // ~1000 buckets
  const cap = Math.floor(budget / g)
  const items = normalise(candidates).map(c => ({ ...c, _w: Math.ceil(c._cost / g) }))
  const n = items.length
  // dp[w] = best benefit achievable with capacity w; track picks via parent pointers
  const dp = new Array(cap + 1).fill(0)
  const take = Array.from({ length: n }, () => new Array(cap + 1).fill(false))
  for (let i = 0; i < n; i++) {
    const w = items[i]._w, b = items[i]._benefit
    for (let c = cap; c >= w; c--) {
      if (dp[c - w] + b > dp[c]) { dp[c] = dp[c - w] + b; take[i][c] = true }
    }
  }
  // backtrack
  let c = cap
  const selected = []
  for (let i = n - 1; i >= 0; i--) {
    if (take[i][c]) { selected.push(items[i]); c -= items[i]._w }
  }
  const spent = selected.reduce((s, it) => s + it._cost, 0)
  return finalize(selected, spent, budget, candidates)
}

function finalize (selected, spent, budget, allCandidates) {
  const selectedIds = new Set(selected.map(s => s.id))
  const deferred = normalise(allCandidates).filter(c => !selectedIds.has(c.id))
  return {
    budget: round(budget),
    selectedCount: selected.length,
    spentAud: round(spent),
    remainingAud: round(budget - spent),
    totalBenefit: round(selected.reduce((s, it) => s + it._benefit, 0)),
    selected: selected.map(strip),
    deferred: deferred.map(strip),
    // governance: how much P1/P2 risk could NOT be funded this round
    unfundedHighPriority: deferred.filter(d => d.band === 'P1' || d.band === 'P2').map(d => d.id)
  }
}

function strip (it) {
  return {
    id: it.id, name: it.name, band: it.band, priorityScore: it.priorityScore,
    costAud: round(it._cost), benefitAud: round(it._benefit)
  }
}

function round (n) { return Math.round(Number(n) * 100) / 100 }

// strategy: 'greedy-bcr' (default) | 'knapsack'
function optimise ({ candidates, budget, strategy = 'greedy-bcr', granularityAud } = {}) {
  const b = num(budget)
  if (b === null || b < 0) throw new Error('budget must be a non-negative number')
  if (strategy === 'knapsack') return knapsack(candidates, b, granularityAud)
  return greedyBcr(candidates, b)
}

module.exports = { optimise, greedyBcr, knapsack, benefitOf }
