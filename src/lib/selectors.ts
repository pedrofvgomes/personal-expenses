import type { AppData, Category, PortfolioPoint, Recurring, RecurUnit, Transaction } from '../types.ts'
import { addDaysISO, addMonthsISO, diffDays, formatShortMonth, shiftMonth, todayISO } from './dates.ts'
import { uid } from './id.ts'
import { homeEquity, schedule } from './loan.ts'
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

export function accountBalanceAt(data: AppData, accountId: string, on: string): number {
  const opening = data.accounts.find((a) => a.id === accountId)?.openingBalance ?? 0
  let n = opening
  for (const tx of data.transactions) {
    if (tx.date > on) continue
    if (tx.accountId === accountId) {
      if (tx.type === 'expense' || tx.type === 'transfer') n -= tx.amount
      else n += tx.amount
    }
    if (tx.type === 'transfer' && tx.toAccountId === accountId) n += tx.amount
  }
  return round2(n)
}

export function portfolioAt(points: PortfolioPoint[], on: string): number {
  let total = 0
  for (const point of points) {
    if (point.date > on) break
    total = point.total
  }
  return total
}

export function recordPortfolio(points: PortfolioPoint[], date: string, total: number): PortfolioPoint[] {
  const next = points.filter((point) => point.date !== date)
  next.push({ date, total: round2(total) })
  next.sort((a, b) => a.date.localeCompare(b.date))
  return next
}

function monthEnd(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

function monthsEnding(endYm: string, count: number): { ym: string; label: string }[] {
  const months: string[] = []
  let cursor = endYm
  for (let i = 0; i < count; i++) {
    months.unshift(cursor)
    cursor = shiftMonth(cursor, -1)
  }
  return months.map((ym, i) => {
    const short = formatShortMonth(ym)
    const label = ym.endsWith('-01') || i === 0 ? `${short} ${ym.slice(2, 4)}` : short
    return { ym, label }
  })
}

export function netWorthTrend(data: AppData, endYm: string, count = 12) {
  return monthsEnding(endYm, count).map(({ ym, label }) => {
    const on = monthEnd(ym)
    const accounts = round2(data.accounts.reduce((sum, account) => sum + accountBalanceAt(data, account.id, on), 0))
    const invested = portfolioAt(data.portfolio, on)
    const equity = homeEquity(data.loans, on).equity
    return { ym, label, accounts, invested, equity, total: round2(accounts + invested + equity) }
  })
}

export function netWorthAt(data: AppData, on: string) {
  const accounts = round2(data.accounts.reduce((sum, account) => sum + accountBalanceAt(data, account.id, on), 0))
  const invested = portfolioAt(data.portfolio, on)
  const equity = homeEquity(data.loans, on).equity
  return { accounts, invested, equity, total: round2(accounts + invested + equity) }
}

export function spendingCompare(data: AppData, ym: string) {
  const expense = monthCashflow(data, ym).expense
  const previousYm = shiftMonth(ym, -1)
  const previous = monthCashflow(data, previousYm).expense
  const prior = monthlyTrend(data, previousYm, 12)
  const average = round2(prior.reduce((sum, row) => sum + row.expense, 0) / 12)
  const current = new Map(spentByCategory(data, ym).map((row) => [row.category.id, row]))
  const last = new Map(spentByCategory(data, previousYm).map((row) => [row.category.id, row]))
  const ids = new Set([...current.keys(), ...last.keys()])
  const categories = [...ids]
    .map((id) => {
      const category = current.get(id)?.category ?? last.get(id)?.category
      if (!category) return null
      return { category, spent: current.get(id)?.value ?? 0, previous: last.get(id)?.value ?? 0 }
    })
    .filter((row): row is { category: Category; spent: number; previous: number } => Boolean(row))
    .sort((a, b) => Math.abs(b.spent - b.previous) - Math.abs(a.spent - a.previous))
  return { expense, previous, average, categories }
}

export function savingsStats(data: AppData, ym: string) {
  const flow = monthCashflow(data, ym)
  const months = monthlyTrend(data, ym, 12)
  const income = months.reduce((sum, row) => sum + row.income, 0)
  const expense = months.reduce((sum, row) => sum + row.expense, 0)
  return {
    rate: flow.income > 0 ? (flow.income - flow.expense) / flow.income : null,
    averageRate: income > 0 ? (income - expense) / income : null,
    averageSpend: round2(expense / 12),
  }
}

export type UpcomingItem = {
  date: string
  label: string
  amount: number
  kind: 'expense' | 'income' | 'loan'
  balanceAfter: number
}

export function upcoming(data: AppData, today = todayISO(), days = 30): UpcomingItem[] {
  const until = addDaysISO(today, days)
  const items: Omit<UpcomingItem, 'balanceAfter'>[] = []
  for (const rec of data.recurring) {
    if (!rec.active || !rec.start) continue
    let index = rec.start > today ? 0 : lastIndexOnOrBefore(rec, today)
    if (index < 0) index = 0
    if (occurrence(rec, index) < today) index++
    for (let guard = 0; guard < 400; guard++, index++) {
      const date = occurrence(rec, index)
      if (date > until) break
      if (date < today) continue
      if (data.transactions.some((tx) => tx.recurringId === rec.id && tx.date === date)) continue
      const category = data.categories.find((item) => item.id === rec.categoryId)
      items.push({ date, label: rec.note || category?.name || 'Recorrente', amount: rec.amount, kind: rec.type })
    }
  }
  for (const loan of data.loans) {
    for (const row of schedule(loan)) {
      if (row.date < today) continue
      if (row.date > until) break
      if (loan.payments.some((payment) => payment.instalmentIndex === row.index)) continue
      items.push({ date: row.date, label: loan.name, amount: row.total, kind: 'loan' })
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label, 'pt'))
  let balance = round2(data.accounts.reduce((sum, account) => sum + accountBalanceAt(data, account.id, today), 0))
  return items.map((item) => {
    balance = round2(balance + (item.kind === 'income' ? item.amount : -item.amount))
    return { ...item, balanceAfter: balance }
  })
}

export function topExpenses(data: AppData, ym: string, count = 5): Transaction[] {
  return data.transactions
    .filter((tx) => tx.type === 'expense' && tx.date.startsWith(ym))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, count)
}

export function risingCategories(data: AppData, ym: string, count = 3) {
  const previous = [shiftMonth(ym, -1), shiftMonth(ym, -2), shiftMonth(ym, -3)]
  return data.categories
    .filter((category) => category.kind === 'expense')
    .map((category) => {
      const spent = categorySpent(data, category.id, ym)
      const average = round2(previous.reduce((sum, month) => sum + categorySpent(data, category.id, month), 0) / 3)
      return { category, spent, average, delta: round2(spent - average) }
    })
    .filter((row) => row.spent > 0 && row.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, count)
}

function daysInMonth(ym: string): number {
  return Number(monthEnd(ym).slice(8))
}

function cumulativeByDay(data: AppData, ym: string): number[] {
  const days = daysInMonth(ym)
  const added = Array.from({ length: days + 1 }, () => 0)
  for (const tx of data.transactions) {
    if (tx.type !== 'expense' || !tx.date.startsWith(ym)) continue
    const day = Number(tx.date.slice(8, 10))
    if (day >= 1 && day <= days) added[day] += tx.amount
  }
  const totals = [0]
  for (let day = 1; day <= days; day++) totals[day] = round2(totals[day - 1] + added[day])
  return totals
}

export function dailyCumulative(data: AppData, ym: string): { day: number; current: number; previous: number }[] {
  const current = cumulativeByDay(data, ym)
  const previous = cumulativeByDay(data, shiftMonth(ym, -1))
  const lastPrevious = previous[previous.length - 1] ?? 0
  return Array.from({ length: daysInMonth(ym) }, (_, index) => {
    const day = index + 1
    return { day, current: current[day] ?? 0, previous: previous[day] ?? lastPrevious }
  })
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
