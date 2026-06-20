'use strict'

// ─────────────────────────────────────────────────────────────────────────────
// Budget-constrained capital-program optimiser (CAPEX-1)
//
// Answers the question executives actually ask: "given $X this year, which
// structures do we fund to buy down the most risk / get the best return?"
//
// Input: scored candidates [{ id, name, band, priorityScore, costAud,
//   benefitCostRatio?, expectedValueAud?, riskReductionAud? }] and a budget.
// Output: a selected set + the deferred set, each item carrying a transparent
// RATIONALE (rank, risk-bought-down-per-dollar, benefit basis, cumulative spend,
// shortfall, and a plain-English reason) so the user can see WHY each bridge was
// chosen and HOW the program was arrived at.
//
// Two transparent strategies (config-selectable):
//   'greedy-bcr' (default) — rank by benefit density (risk bought down per $) desc, fund
//                            down the list while it fits. Fast, explainable, near-optimal.
//   'knapsack'             — exact 0/1 dynamic-programming optimum (budget discretised to
//                            `granularityAud` buckets) when an exact answer is wanted.
//
// Benefit precedence per item: riskReductionAud → (expectedValueAud × benefitCostRatio) →
// expectedValueAud → a priority-band weight. Never silently zero — items with no $ benefit
// signal fall back to a band-derived weight (the reason names which basis was used).
// Pure functions, no I/O, config-driven.
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
const BAND_WEIGHT = { P1: 100, P2: 70, P3: 40, P4: 20, P5: 10 }
const BASIS_LABEL = {
  'risk-reduction': 'modelled risk reduction ($)',
  'ev-bcr': 'expected annual loss × benefit-cost ratio',
  'expected-value': 'expected annual loss ($)',
  'band-weight': 'priority band (no $ benefit on record)'
}

// Which benefit signal drives this item + the value, so the reason can name it.
function benefitDetail (item) {
  if (num(item.riskReductionAud) !== null) return { benefit: num(item.riskReductionAud), basis: 'risk-reduction' }
  const ev = num(item.expectedValueAud); const bcr = num(item.benefitCostRatio)
  if (ev !== null && bcr !== null) return { benefit: ev * bcr, basis: 'ev-bcr' }
  if (ev !== null) return { benefit: ev, basis: 'expected-value' }
  return { benefit: BAND_WEIGHT[item.band] || 0, basis: 'band-weight' }
}
function benefitOf (item) { return benefitDetail(item).benefit } // kept for back-compat

function normalise (candidates) {
  return (candidates || [])
    .filter(c => c && num(c.costAud) !== null && num(c.costAud) > 0)
    .map(c => { const d = benefitDetail(c); return { ...c, _cost: num(c.costAud), _benefit: d.benefit, _basis: d.basis } })
}

// ── Greedy by benefit density ─────────────────────────────────────────────────
function greedyBcr (candidates, budget) {
  const items = normalise(candidates)
    .map(c => ({ ...c, _density: c._cost > 0 ? c._benefit / c._cost : 0 }))
    .sort((a, b) => b._density - a._density)
  const selected = []; const deferred = []
  let spent = 0
  items.forEach((it, i) => {
    it._rank = i + 1
    const remaining = budget - spent
    if (it._cost <= remaining) {
      spent += it._cost
      it._funded = true
      it._cumulativeSpend = spent
      selected.push(it)
    } else {
      it._funded = false
      it._remainingWhenReached = remaining
      it._shortfall = it._cost - remaining
      deferred.push(it)
    }
  })
  return finalize(selected, deferred, spent, budget, 'greedy-bcr')
}

// ── Exact 0/1 knapsack (budget bucketed) ───────────────────────────────────────
function knapsack (candidates, budget, granularityAud) {
  const g = num(granularityAud) || Math.max(1, Math.round(budget / 1000)) // ~1000 buckets
  const cap = Math.floor(budget / g)
  const items = normalise(candidates)
    .map(c => ({ ...c, _w: Math.ceil(c._cost / g), _density: c._cost > 0 ? c._benefit / c._cost : 0 }))
  const n = items.length
  const dp = new Array(cap + 1).fill(0)
  const take = Array.from({ length: n }, () => new Array(cap + 1).fill(false))
  for (let i = 0; i < n; i++) {
    const w = items[i]._w, b = items[i]._benefit
    for (let c = cap; c >= w; c--) {
      if (dp[c - w] + b > dp[c]) { dp[c] = dp[c - w] + b; take[i][c] = true }
    }
  }
  let c = cap
  const inSet = new Set()
  for (let i = n - 1; i >= 0; i--) { if (take[i][c]) { inSet.add(items[i].id); c -= items[i]._w } }
  // rank by density for display (so the reason can cite a value-for-money position)
  ;[...items].sort((a, b) => b._density - a._density).forEach((it, i) => { it._rank = i + 1 })
  const selected = []; const deferred = []
  let spent = 0
  for (const it of items) {
    if (inSet.has(it.id)) { it._funded = true; spent += it._cost; it._cumulativeSpend = spent; selected.push(it) } else { it._funded = false; deferred.push(it) }
  }
  selected.sort((a, b) => a._rank - b._rank)
  return finalize(selected, deferred, spent, budget, 'knapsack')
}

// Plain-English rationale per bridge — the "why this one / why not".
function reasonFor (it, strategy, budget) {
  const d = round(it._density || 0)
  const basis = BASIS_LABEL[it._basis] || it._basis
  if (strategy === 'knapsack') {
    return it._funded
      ? `Funded — selected into the cost-benefit-optimal program (buys down $${d} of risk per $1; benefit basis: ${basis}).`
      : `Deferred — excluded from the optimal program that maximises total risk bought down within $${round(budget)}.`
  }
  if (it._funded) {
    return `Funded — ranked #${it._rank} by risk bought down per dollar ($${d}/$1, from ${basis}). ` +
      `Cost $${round(it._cost)} fit the remaining budget; cumulative spend $${round(it._cumulativeSpend)} of $${round(budget)}.`
  }
  return `Deferred — ranked #${it._rank}; only $${round(it._remainingWhenReached)} was left when it was reached but $${round(it._cost)} was needed ` +
    `(short $${round(it._shortfall)}). Higher value-for-money works were funded first.`
}

function finalize (selected, deferred, spent, budget, strategy) {
  const unfundedHigh = deferred.filter(d => d.band === 'P1' || d.band === 'P2')
  return {
    strategy,
    budget: round(budget),
    selectedCount: selected.length,
    spentAud: round(spent),
    remainingAud: round(budget - spent),
    totalBenefit: round(selected.reduce((s, it) => s + it._benefit, 0)),
    // How the program was arrived at — shown to the user above the table.
    methodSummary: strategy === 'knapsack'
      ? `Exact 0/1 optimisation: chose the combination of works that buys down the most total modelled risk for the $${round(budget)} budget. ${selected.length} funded, ${deferred.length} deferred.`
      : `Greedy value-for-money: every costed work was ranked by risk bought down per dollar, then funded down the list until the $${round(budget)} budget ran out. ${selected.length} funded, ${deferred.length} deferred.`,
    selected: selected.map(it => strip(it, strategy, budget)),
    deferred: deferred.map(it => strip(it, strategy, budget)),
    unfundedHighPriority: unfundedHigh.map(d => d.id),
    // governance: the P1/P2 works left unfunded, WITH the reason + shortfall to fund them.
    unfundedHighPriorityDetail: unfundedHigh.map(it => strip(it, strategy, budget))
  }
}

function strip (it, strategy, budget) {
  return {
    id: it.id, name: it.name, band: it.band, priorityScore: it.priorityScore,
    costAud: round(it._cost), benefitAud: round(it._benefit),
    benefitPerDollar: round(it._density != null ? it._density : (it._cost > 0 ? it._benefit / it._cost : 0)),
    benefitBasis: BASIS_LABEL[it._basis] || it._basis,
    rank: it._rank != null ? it._rank : null,
    funded: !!it._funded,
    cumulativeSpendAud: it._cumulativeSpend != null ? round(it._cumulativeSpend) : null,
    shortfallAud: it._shortfall != null ? round(it._shortfall) : null,
    reason: reasonFor(it, strategy, budget)
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

module.exports = { optimise, greedyBcr, knapsack, benefitOf, benefitDetail }
