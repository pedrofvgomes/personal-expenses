import { formatShortMonth, shiftMonth, thisMonth } from './dates.ts'
import { round2 } from './money.ts'
import type { AppData, Category, Recurring } from '../types.ts'

export function accountBalance(data: AppData, accountId: string): number {
  const opening = data.accounts.find((a) => a.id === accountId)?.openingBalance ?? 0
  let n = opening
  for (const tx of data.transactions) {
    if (tx.accountId === accountId) {
      if (tx.type === 'expense' || tx.type === 'transfer') n -= tx.amount
      else n += tx.amount
    }
    if (tx.type === 'transfer' && tx.toAccountId === accountId) n += tx.amount
  }
  return round2(n)
}

export function monthCashflow(data: AppData, ym: string): { income: number; expense: number; balance: number } {
  let income = 0
  let expense = 0
  for (const tx of data.transactions) {
    if (!tx.date.startsWith(ym)) continue
    if (tx.type === 'income') income += tx.amount
    else if (tx.type === 'expense') expense += tx.amount
  }
  return { income: round2(income), expense: round2(expense), balance: round2(income - expense) }
}

export function spentByCategory(data: AppData, ym: string): { category: Category; value: number }[] {
  const map = new Map<string, number>()
  for (const tx of data.transactions) {
    if (tx.type !== 'expense' || !tx.categoryId || !tx.date.startsWith(ym)) continue
    map.set(tx.categoryId, (map.get(tx.categoryId) ?? 0) + tx.amount)
  }
  return [...map.entries()]
    .map(([id, value]) => ({ category: data.categories.find((c) => c.id === id), value: round2(value) }))
    .filter((row): row is { category: Category; value: number } => Boolean(row.category))
    .sort((a, b) => b.value - a.value)
}

export function monthlyTrend(data: AppData, endYm: string, count = 12) {
  const months: string[] = []
  let cursor = endYm
  for (let i = 0; i < count; i++) {
    months.unshift(cursor)
    cursor = shiftMonth(cursor, -1)
  }
  return months.map((ym, i) => {
    const flow = monthCashflow(data, ym)
    const short = formatShortMonth(ym)
    const label = ym.endsWith('-01') || i === 0 ? `${short} ${ym.slice(2, 4)}` : short
    return { ym, label, ...flow }
  })
}

export function categorySpent(data: AppData, categoryId: string, ym: string): number {
  return round2(
    data.transactions
      .filter((t) => t.type === 'expense' && t.categoryId === categoryId && t.date.startsWith(ym))
      .reduce((s, t) => s + t.amount, 0),
  )
}

export function dueMonths(rec: Recurring, data: AppData, today = new Date()): string[] {
  if (!rec.active) return []
  const ymNow = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const day = today.getDate()
  let cursor = rec.lastGenerated && rec.lastGenerated <= ymNow ? rec.lastGenerated : ymNow
  const out: string[] = []
  for (let i = 0; i < 60 && cursor <= ymNow; i++) {
    const reached = cursor < ymNow || day >= rec.day
    const exists = data.transactions.some((t) => t.recurringId === rec.id && t.date.startsWith(cursor))
    if (reached && !exists) out.push(cursor)
    cursor = shiftMonth(cursor, 1)
  }
  return out
}

export function nextRecurringMonth(rec: Recurring, data: AppData, today = new Date()): string {
  const due = dueMonths(rec, data, today)
  if (due.length) return due[0]
  const ym = thisMonth()
  const generated = data.transactions.some((t) => t.recurringId === rec.id && t.date.startsWith(ym))
  if (!generated && today.getDate() < rec.day) return ym
  return shiftMonth(ym, 1)
}
