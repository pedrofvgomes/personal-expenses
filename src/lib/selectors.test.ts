import { describe, expect, it } from 'vitest'
import { defaultData, normalize } from './defaults.ts'
import {
  accountBalanceAt,
  dailyCumulative,
  netWorthAt,
  portfolioAt,
  recordPortfolio,
  risingCategories,
  savingsStats,
  spendingCompare,
  topExpenses,
  upcoming,
} from './selectors.ts'
import type { AppData } from '../types.ts'

function book(): AppData {
  const data = defaultData()
  data.accounts = [{ id: 'a', name: 'Ordem', type: 'checking', openingBalance: 100 }]
  data.transactions = [
    { id: 't1', amount: 40, type: 'expense', categoryId: 'cat-casa', accountId: 'a', date: '2026-01-10', note: 'Renda', tags: [] },
    { id: 't2', amount: 200, type: 'income', categoryId: 'cat-salario', accountId: 'a', date: '2026-01-05', note: '', tags: [] },
    { id: 't3', amount: 10, type: 'expense', categoryId: 'cat-casa', accountId: 'a', date: '2026-02-02', note: 'Luz', tags: [] },
    { id: 't4', amount: 25, type: 'expense', categoryId: 'cat-lazer', accountId: 'a', date: '2026-02-03', note: 'Cinema', tags: [] },
  ]
  return data
}

describe('portfolio and balances', () => {
  it('ignores movements after the date and keeps the latest portfolio point', () => {
    const data = book()
    expect(accountBalanceAt(data, 'a', '2026-01-31')).toBe(260)
    expect(accountBalanceAt(data, 'a', '2026-02-28')).toBe(225)
    const points = recordPortfolio(recordPortfolio([], '2026-01-01', 10), '2026-01-01', 12)
    expect(points).toEqual([{ date: '2026-01-01', total: 12 }])
    expect(portfolioAt(points, '2025-12-01')).toBe(0)
    expect(portfolioAt([{ date: '2026-01-01', total: 12 }, { date: '2026-03-01', total: 30 }], '2026-02-01')).toBe(12)
    data.portfolio = [{ date: '2026-01-15', total: 50 }]
    expect(netWorthAt(data, '2026-01-31')).toMatchObject({ accounts: 260, invested: 50, total: 310 })
  })

  it('drops invalid portfolio points and keeps one per day', () => {
    const data = normalize({
      portfolio: [
        { date: '2026-01-02', total: 10 },
        { date: '2026-01-02', total: 12 },
        { date: 'nope', total: 1 },
      ],
    })
    expect(data.portfolio).toEqual([{ date: '2026-01-02', total: 12 }])
  })
})

describe('month comparisons', () => {
  it('compares spending, savings and the days of the month', () => {
    const data = book()
    const compare = spendingCompare(data, '2026-02')
    expect(compare.expense).toBe(35)
    expect(compare.previous).toBe(40)
    const casa = compare.categories.find((row) => row.category.id === 'cat-casa')
    expect(casa).toMatchObject({ spent: 10, previous: 40 })
    const save = savingsStats(data, '2026-01')
    expect(save.rate).toBeCloseTo(160 / 200)
    expect(save.averageRate).not.toBeNull()
    const days = dailyCumulative(data, '2026-02')
    expect(days[0]).toEqual({ day: 1, current: 0, previous: 0 })
    expect(days[1].current).toBe(10)
    expect(days[2].current).toBe(35)
    expect(days[9].previous).toBe(40)
    expect(topExpenses(data, '2026-02').map((tx) => tx.amount)).toEqual([25, 10])
    data.transactions.push(
      { id: 'old', amount: 5, type: 'expense', categoryId: 'cat-lazer', accountId: 'a', date: '2026-01-20', note: '', tags: [] },
    )
    expect(risingCategories(data, '2026-02')[0]?.category.id).toBe('cat-lazer')
  })
})

describe('upcoming', () => {
  it('projects the balance after a recurring expense', () => {
    const data = book()
    data.recurring = [{
      id: 'r',
      amount: 50,
      type: 'expense',
      categoryId: 'cat-casa',
      accountId: 'a',
      note: 'Renda',
      start: '2026-03-01',
      every: 1,
      unit: 'month',
      active: true,
    }]
    const rows = upcoming(data, '2026-02-28', 30)
    expect(rows[0]).toMatchObject({ date: '2026-03-01', label: 'Renda', amount: 50, kind: 'expense' })
    expect(rows[0].balanceAfter).toBe(accountBalanceAt(data, 'a', '2026-02-28') - 50)
  })
})
