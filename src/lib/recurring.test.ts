import { describe, expect, it } from 'vitest'
import type { Recurring } from '../types.ts'
import { defaultData, normalize } from './defaults.ts'
import { dueDates, materializeRecurring, nextOccurrence, scheduleLabel } from './selectors.ts'

function rec(over: Partial<Recurring> = {}): Recurring {
  return {
    id: 'r1',
    amount: 10,
    type: 'expense',
    categoryId: 'cat-casa',
    accountId: 'acc-ordem',
    note: 'Renda',
    start: '2026-01-31',
    every: 1,
    unit: 'month',
    active: true,
    ...over,
  }
}

describe('recurring schedule', () => {
  it('keeps the anchor day across months and skips a date already logged', () => {
    const item = rec()
    const data = defaultData()
    data.transactions.push({
      id: 't',
      amount: 10,
      type: 'expense',
      categoryId: 'cat-casa',
      accountId: 'acc-ordem',
      date: '2026-02-28',
      note: '',
      tags: [],
      recurringId: 'r1',
    })
    expect(dueDates(item, data, '2026-04-15')).toEqual(['2026-01-31', '2026-03-31'])
    expect(dueDates(rec({ active: false }), data, '2026-04-15')).toEqual([])
  })

  it('steps weeks and years from the start date', () => {
    const weeks = rec({ start: '2026-01-05', every: 2, unit: 'week' })
    expect(dueDates(weeks, defaultData(), '2026-02-02')).toEqual(['2026-01-05', '2026-01-19', '2026-02-02'])
    const years = rec({ start: '2024-02-29', unit: 'year' })
    expect(dueDates(years, defaultData(), '2026-03-01')).toEqual(['2024-02-29', '2025-02-28', '2026-02-28'])
    expect(nextOccurrence(rec({ start: '2026-12-01' }), defaultData(), '2026-10-16')).toBe('2026-12-01')
  })

  it('offers only the latest 24 missed days', () => {
    const item = rec({ start: '2020-01-01', unit: 'day' })
    const due = dueDates(item, defaultData(), '2026-10-16')
    expect(due).toHaveLength(24)
    expect(due[0]).toBe('2026-09-23')
    expect(due.at(-1)).toBe('2026-10-16')
  })

  it('names the cadence and moves to the following date once generated', () => {
    expect(scheduleLabel(rec({ every: 1, unit: 'week' }))).toBe('Todas as semanas')
    expect(scheduleLabel(rec({ every: 3, unit: 'month' }))).toBe('A cada 3 meses')
    const item = rec({ start: '2026-10-01', every: 10, unit: 'day' })
    const data = defaultData()
    materializeRecurring(data, item, '2026-10-01')
    expect(data.transactions.map((t) => t.date)).toEqual(['2026-10-01'])
    expect(dueDates(item, data, '2026-10-01')).toEqual([])
    expect(nextOccurrence(item, data, '2026-10-01')).toBe('2026-10-11')
  })

  it('turns an old day-of-month record into a monthly start date', () => {
    const data = normalize({
      version: 1,
      recurring: [{ id: 'old', amount: 5, type: 'expense', categoryId: 'c', accountId: 'a', note: '', day: 5, active: true, lastGenerated: '2026-08' }],
    } as never)
    expect(data.recurring[0]).toMatchObject({ start: '2026-08-05', every: 1, unit: 'month', active: true })
  })
})
