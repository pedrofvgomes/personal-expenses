import { dateInMonth, thisMonth } from './dates.ts'
import type { Account, AppData, Category, EuriborTenor, Loan, Recurring, RecurUnit } from '../types.ts'

const expense = (id: string, name: string, emoji: string, color: string): Category => ({ id, name, emoji, color, kind: 'expense' })

export function defaultCategories(): Category[] {
  return [
    expense('cat-alimentacao', 'Alimentação', '🛒', '#c2410c'),
    expense('cat-casa', 'Casa', '🏠', '#b45309'),
    expense('cat-transportes', 'Transportes', '🚗', '#1d4ed8'),
    expense('cat-saude', 'Saúde', '💊', '#be123c'),
    expense('cat-lazer', 'Lazer', '🎭', '#7c3aed'),
    expense('cat-restauracao', 'Restauração', '🍽️', '#c026d3'),
    expense('cat-compras', 'Compras', '🛍️', '#a16207'),
    expense('cat-subscricoes', 'Subscrições', '📱', '#0e7490'),
    expense('cat-educacao', 'Educação', '📚', '#4338ca'),
    expense('cat-credito', 'Crédito', '🏦', '#0f6e6b'),
    expense('cat-seguros', 'Seguros', '🛡️', '#0369a1'),
    expense('cat-outros', 'Outros', '📦', '#57534e'),
    { id: 'cat-salario', name: 'Salário', emoji: '💼', color: '#0f7a4a', kind: 'income' },
    { id: 'cat-outros-rend', name: 'Outros rendimentos', emoji: '💰', color: '#4d7c0f', kind: 'income' },
  ]
}

export function defaultData(): AppData {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    categories: defaultCategories(),
    accounts: [{ id: 'acc-ordem', name: 'Conta à ordem', type: 'checking', openingBalance: 0 }],
    transactions: [],
    budgets: [],
    recurring: [],
    goals: [],
    loans: [],
  }
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function normalize(input: Partial<AppData> | null | undefined): AppData {
  const base = defaultData()
  if (!input) return base
  const categories = Array.isArray(input.categories) && input.categories.length ? input.categories : base.categories
  const accounts = Array.isArray(input.accounts) ? input.accounts : []
  const transactions = (Array.isArray(input.transactions) ? input.transactions : []).map((t) => ({
    ...t,
    note: t.note ?? '',
    tags: t.tags ?? [],
    categoryId: t.categoryId ?? null,
  }))
  const loans = (Array.isArray(input.loans) ? input.loans : []).map((l) => normalizeLoan(l))
  return {
    version: 1,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date().toISOString(),
    categories,
    accounts: accounts.map((a) => ({ ...a, openingBalance: num(a.openingBalance) })),
    transactions,
    budgets: Array.isArray(input.budgets) ? input.budgets : [],
    recurring: (Array.isArray(input.recurring) ? input.recurring : []).map((r) => normalizeRecurring(r)),
    goals: (Array.isArray(input.goals) ? input.goals : []).map((g) => ({ ...g, saved: num(g.saved), target: num(g.target) })),
    loans,
  }
}

const UNITS: RecurUnit[] = ['day', 'week', 'month', 'year']

function normalizeRecurring(raw: Recurring & { day?: number; lastGenerated?: string | null }): Recurring {
  const unit = UNITS.includes(raw.unit) ? raw.unit : 'month'
  const every = Number.isInteger(raw.every) && raw.every >= 1 ? raw.every : 1
  let start = typeof raw.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.start) ? raw.start : ''
  if (!start) {
    const day = Number.isInteger(raw.day) ? Math.min(31, Math.max(1, raw.day as number)) : 1
    const stamp = typeof raw.lastGenerated === 'string' ? raw.lastGenerated : ''
    const ym = /^\d{4}-\d{2}/.test(stamp) ? stamp.slice(0, 7) : thisMonth()
    start = dateInMonth(ym, day)
  }
  return {
    id: raw.id,
    amount: num(raw.amount),
    type: raw.type === 'income' ? 'income' : 'expense',
    categoryId: raw.categoryId,
    accountId: raw.accountId,
    note: raw.note ?? '',
    start,
    every,
    unit,
    active: raw.active !== false,
  }
}

function normalizeLoan(loan: Loan): Loan {
  const tenor = loan.euriborTenor
  const euriborTenor: EuriborTenor = tenor === 3 || tenor === 6 || tenor === 12 ? tenor : 12
  return {
    ...loan,
    principal: num(loan.principal),
    downPayment: num(loan.downPayment),
    termMonths: num(loan.termMonths),
    paymentDay: num(loan.paymentDay, 1),
    annualRate: num(loan.annualRate),
    spread: num(loan.spread),
    initialEuribor: num(loan.initialEuribor),
    fixedPeriodMonths: num(loan.fixedPeriodMonths),
    lifeInsurance: num(loan.lifeInsurance),
    homeInsurance: num(loan.homeInsurance),
    graceMonths: num(loan.graceMonths),
    euriborTenor,
    revisions: loan.revisions ?? [],
    drawdowns: loan.drawdowns ?? [],
    payments: loan.payments ?? [],
  }
}

export function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false
  const o = value as AppData
  return o.version === 1 && Array.isArray(o.categories) && Array.isArray(o.accounts) && Array.isArray(o.transactions) && Array.isArray(o.loans)
}

export function accountLabel(type: Account['type']): string {
  if (type === 'checking') return 'Conta à ordem'
  if (type === 'savings') return 'Poupança'
  if (type === 'cash') return 'Dinheiro'
  return 'Outra'
}
