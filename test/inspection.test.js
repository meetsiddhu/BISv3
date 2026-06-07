const { nextInspectionDue, isOverdue } = require('../srv/lib/inspection')

describe('inspection-due decision support (INSPECT-1/2)', () => {
  test('next due = last inspection + interval months', () => {
    expect(nextInspectionDue('2024-01-15', 12)).toBe('2025-01-15')
    expect(nextInspectionDue('2024-06-30', 24)).toBe('2026-06-30')
  })

  test('null when inputs missing/invalid', () => {
    expect(nextInspectionDue(null, 12)).toBeNull()
    expect(nextInspectionDue('2024-01-01', 0)).toBeNull()
    expect(nextInspectionDue('2024-01-01', null)).toBeNull()
    expect(nextInspectionDue('not-a-date', 12)).toBeNull()
  })

  test('overdue when due date is in the past', () => {
    expect(isOverdue('2000-01-01')).toBe(true)
    expect(isOverdue('2999-01-01')).toBe(false)
    expect(isOverdue(null)).toBe(false)
  })

  test('overdue respects an explicit "now"', () => {
    expect(isOverdue('2024-06-01', '2024-07-01')).toBe(true)
    expect(isOverdue('2024-08-01', '2024-07-01')).toBe(false)
  })
})
