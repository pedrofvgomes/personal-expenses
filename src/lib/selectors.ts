import type { AppData, Category, Recurring, RecurUnit } from '../types.ts'
import { addDaysISO, addMonthsISO, diffDays, formatShortMonth, shiftMonth, todayISO } from './dates.ts'
import { uid } from './id.ts'
import { round2 } from './money.ts'

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

const DUE_CAP = 24 // shortcut: only the latest 24 missed dates are offered; raise this for a longer catch-up

export function occurrence(rec: Pick<Recurring, 'start' | 'every' | 'unit'>, index: number): string {
  const step = index * Math.max(1, rec.every)
  if (rec.unit === 'day') return addDaysISO(rec.start, step)
  if (rec.unit === 'week') return addDaysISO(rec.start, step * 7)
  if (rec.unit === 'year') return addMonthsISO(rec.start, step * 12)
  return addMonthsISO(rec.start, step)
}

function lastIndexOnOrBefore(rec: Pick<Recurring, 'start' | 'every' | 'unit'>, today: string): number {
  if (rec.start > today) return -1
  const rough = rec.unit === 'day' || rec.unit === 'week'
    ? Math.floor(diffDays(rec.start, today) / (rec.unit === 'week' ? rec.every * 7 : rec.every))
    : Math.floor(monthsBetween(rec.start, today) / (rec.unit === 'year' ? rec.every * 12 : rec.every))
  let n = Math.max(0, rough)
  let guard = 0
  while (occurrence(rec, n) > today && n > 0 && guard++ < 8) n--
  while (occurrence(rec, n + 1) <= today && guard++ < 8) n++
  return n
}

function monthsBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  let n = (by - ay) * 12 + (bm - am)
  if (bd < ad) n -= 1
  return n
}

export function dueDates(rec: Recurring, data: AppData, today = todayISO()): string[] {
  if (!rec.active || !rec.start || rec.start > today) return []
  const last = lastIndexOnOrBefore(rec, today)
  const from = Math.max(0, last - DUE_CAP + 1)
  const out: string[] = []
  for (let i = from; i <= last; i++) {
    const date = occurrence(rec, i)
    if (date > today) continue
    if (data.transactions.some((t) => t.recurringId === rec.id && t.date === date)) continue
    out.push(date)
  }
  return out
}

export function nextOccurrence(rec: Recurring, data: AppData, today = todayISO()): string {
  const due = dueDates(rec, data, today)
  if (due.length) return due[0]
  if (!rec.start || rec.start > today) return rec.start
  return occurrence(rec, lastIndexOnOrBefore(rec, today) + 1)
}

const UNIT_ONE: Record<RecurUnit, string> = { day: 'Todos os dias', week: 'Todas as semanas', month: 'Todos os meses', year: 'Todos os anos' }
const UNIT_MANY: Record<RecurUnit, string> = { day: 'dias', week: 'semanas', month: 'meses', year: 'anos' }

export function scheduleLabel(rec: Pick<Recurring, 'every' | 'unit'>): string {
  if (rec.every === 1) return UNIT_ONE[rec.unit]
  return `A cada ${rec.every} ${UNIT_MANY[rec.unit]}`
}

export function materializeRecurring(data: AppData, rec: Recurring, today = todayISO()): void {
  for (const date of dueDates(rec, data, today)) {
    data.transactions.push({
      id: uid(),
      type: rec.type,
      amount: rec.amount,
      categoryId: rec.categoryId,
      accountId: rec.accountId,
      date,
      note: rec.note,
      tags: ['recorrente'],
      recurringId: rec.id,
    })
  }
}
