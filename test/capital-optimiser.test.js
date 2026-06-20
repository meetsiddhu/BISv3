const opt = require('../srv/lib/capital-optimiser')

// CAPEX-1 — budget-constrained capital-program optimisation over scored assets.
const fleet = [
  { id: 1, name: 'A', band: 'P1', priorityScore: 90, costAud: 100000, expectedValueAud: 500000, benefitCostRatio: 3 },
  { id: 2, name: 'B', band: 'P1', priorityScore: 88, costAud: 400000, expectedValueAud: 600000, benefitCostRatio: 1.2 },
  { id: 3, name: 'C', band: 'P2', priorityScore: 70, costAud: 50000, expectedValueAud: 200000, benefitCostRatio: 2 },
  { id: 4, name: 'D', band: 'P3', priorityScore: 40, costAud: 300000, expectedValueAud: 100000, benefitCostRatio: 0.5 }
]

describe('greedy-bcr', () => {
  test('selects within budget and reports spend/remaining', () => {
    const r = opt.optimise({ candidates: fleet, budget: 200000, strategy: 'greedy-bcr' })
    expect(r.spentAud).toBeLessThanOrEqual(200000)
    expect(r.remainingAud).toBe(r.budget - r.spentAud)
    expect(r.selectedCount).toBeGreaterThan(0)
  })
  test('prefers high benefit-density items (A and C beat D)', () => {
    const r = opt.optimise({ candidates: fleet, budget: 160000, strategy: 'greedy-bcr' })
    const ids = r.selected.map(s => s.id)
    expect(ids).toContain(1) // A: 500k benefit / 100k = density 5
    expect(ids).toContain(3) // C: 400k benefit / 50k = density 8 (riskReduction proxy ev*bcr)
    expect(ids).not.toContain(4) // D: lowest density
  })
  test('surfaces unfunded high-priority (governance, not silent)', () => {
    const r = opt.optimise({ candidates: fleet, budget: 60000, strategy: 'greedy-bcr' })
    expect(Array.isArray(r.unfundedHighPriority)).toBe(true)
  })
})

describe('knapsack', () => {
  test('exact optimum never exceeds budget and beats-or-equals greedy on total benefit', () => {
    const g = opt.optimise({ candidates: fleet, budget: 450000, strategy: 'greedy-bcr' })
    const k = opt.optimise({ candidates: fleet, budget: 450000, strategy: 'knapsack', granularityAud: 10000 })
    expect(k.spentAud).toBeLessThanOrEqual(450000)
    expect(k.totalBenefit).toBeGreaterThanOrEqual(g.totalBenefit - 1) // knapsack ≥ greedy
  })
})

describe('robustness', () => {
  test('items without a cost are excluded; items without benefit fall back to band weight', () => {
    const r = opt.optimise({ candidates: [{ id: 9, band: 'P1', costAud: 0 }, { id: 10, band: 'P2', costAud: 1000 }], budget: 5000 })
    expect(r.selected.map(s => s.id)).toEqual([10]) // id 9 (no/zero cost) excluded
    expect(r.selected[0].benefitAud).toBeGreaterThan(0) // band-weight fallback, not silent zero
  })
  test('negative budget throws', () => {
    expect(() => opt.optimise({ candidates: fleet, budget: -1 })).toThrow(/non-negative/)
  })
})

describe('selection rationale (shown to the user)', () => {
  test('a method summary explains how the program was derived', () => {
    const r = opt.optimise({ candidates: fleet, budget: 160000, strategy: 'greedy-bcr' })
    expect(r.methodSummary).toMatch(/per dollar|risk/i)
    expect(r.strategy).toBe('greedy-bcr')
  })
  test('each funded item carries rank, risk-per-dollar, cumulative spend + a plain-English reason', () => {
    const r = opt.optimise({ candidates: fleet, budget: 160000, strategy: 'greedy-bcr' })
    const top = r.selected[0]
    expect(top.rank).toBe(1)                                  // best value-for-money funded first
    expect(top.benefitPerDollar).toBeGreaterThan(0)
    expect(top.cumulativeSpendAud).toBeGreaterThan(0)
    expect(top.funded).toBe(true)
    expect(top.reason).toMatch(/Funded.*ranked #1.*per dollar/i)
    // funded items are ranked best-first by density
    const ranks = r.selected.map(s => s.rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })
  test('an unfunded P1/P2 is flagged with its shortfall + why it was deferred', () => {
    // budget only fits item A (100k) + C (50k); P1 item B (400k) cannot be funded
    const r = opt.optimise({ candidates: fleet, budget: 160000, strategy: 'greedy-bcr' })
    expect(r.unfundedHighPriority).toContain(2)              // B is a P1 left unfunded
    const b = r.unfundedHighPriorityDetail.find(d => d.id === 2)
    expect(b).toBeTruthy()
    expect(b.funded).toBe(false)
    expect(b.shortfallAud).toBeGreaterThan(0)
    expect(b.reason).toMatch(/Deferred/i)
  })
})
