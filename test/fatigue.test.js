'use strict'

const { screenFatigue, isFatigueSensitive } = require('../srv/lib/fatigue')

// FATIGUE-1 (council fix #3): AS 5100.6 advisory fatigue screening.
describe('fatigue screening', () => {
  test('non-fatigue materials screen as Not Applicable', () => {
    expect(screenFatigue({ material: 'Reinforced Concrete', yearBuilt: 1970, transportMode: 'Road' }, null, 2026).status).toBe('Not Applicable')
    expect(screenFatigue({ material: 'Timber', yearBuilt: 1950, transportMode: 'Rail' }, null, 2026).status).toBe('Not Applicable')
  })

  test('isFatigueSensitive recognises steel/composite/iron', () => {
    expect(isFatigueSensitive('Steel')).toBe(true)
    expect(isFatigueSensitive('Steel/Concrete Composite')).toBe(true)
    expect(isFatigueSensitive('Wrought Iron')).toBe(true)
    expect(isFatigueSensitive('Concrete')).toBe(false)
  })

  test('a steel structure with unknown year is Not Assessed (no fabricated number)', () => {
    const r = screenFatigue({ material: 'Steel', transportMode: 'Rail' }, null, 2026)
    expect(r.status).toBe('Not Assessed')
    expect(r.estimatedFatigueLifeYears).toBeNull()
  })

  test('an old steel RAIL structure screens worse than a young one', () => {
    const old = screenFatigue({ material: 'Steel', yearBuilt: 1935, transportMode: 'Rail' }, null, 2026)
    const young = screenFatigue({ material: 'Steel', yearBuilt: 2015, transportMode: 'Rail' }, null, 2026)
    const rank = { Low: 1, Elevated: 2, High: 3 }
    expect(rank[old.status]).toBeGreaterThan(rank[young.status])
    expect(old.estimatedFatigueLifeYears).toBeLessThan(young.estimatedFatigueLifeYears)
  })

  test('rail demand is harsher than road for the same age (mode matters)', () => {
    const rail = screenFatigue({ material: 'Steel', yearBuilt: 1965, transportMode: 'Rail' }, null, 2026)
    const road = screenFatigue({ material: 'Steel', yearBuilt: 1965, transportMode: 'Road' }, null, 2026)
    expect(rail.estimatedFatigueLifeYears).toBeLessThan(road.estimatedFatigueLifeYears)
  })

  test('a poorer AS 5100.6 detail category consumes life faster', () => {
    const poor = screenFatigue({ material: 'Steel', yearBuilt: 1980, transportMode: 'Rail', fatigueDetailCategory: '36' }, null, 2026)
    const good = screenFatigue({ material: 'Steel', yearBuilt: 1980, transportMode: 'Rail', fatigueDetailCategory: '125' }, null, 2026)
    expect(poor.estimatedFatigueLifeYears).toBeLessThan(good.estimatedFatigueLifeYears)
  })

  test('superstructureMaterial overrides the generic material when present', () => {
    const r = screenFatigue({ material: 'Concrete', superstructureMaterial: 'Steel', yearBuilt: 1960, transportMode: 'Rail' }, null, 2026)
    expect(r.status).not.toBe('Not Applicable')
  })
})
