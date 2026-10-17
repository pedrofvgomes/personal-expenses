import { addMonthsISO, paymentDate } from './dates.ts'
import { round2 } from './money.ts'
import type { Loan } from '../types.ts'

export interface Instalment {
  index: number
  date: string
  rate: number
  interest: number
  capital: number
  instalment: number
  total: number
  balance: number
  phase: 'grace' | 'amort'
}

export interface EarlyRepaymentInput {
  date: string
  amount: number
  mode: 'payment' | 'term'
}

export interface EarlyRepaymentResult {
  feeRate: number
  commission: number
  amountApplied: number
  amountRequested: number
  balanceBefore: number
  interestBefore: number
  interestAfter: number
  interestSaved: number
  netSaved: number
  paymentBefore: number
  paymentAfter: number
  endDateBefore: string
  endDateAfter: string
  instalmentsBefore: number
  instalmentsAfter: number
}

export interface ScheduleResult {
  rows: Instalment[]
  appliedAmount: number
  appliedBalanceBefore: number
}

// shortcut: juros = capital × TAN/12, sem base 30/360; mudar se precisares da convenção do banco.
export function frenchPayment(principal: number, annualPercent: number, months: number): number {
  if (!Number.isFinite(principal) || !Number.isFinite(months) || principal <= 0 || months <= 0) return 0
  const r = annualPercent / 100 / 12
  if (r === 0) return round2(principal / months)
  const factor = (1 + r) ** months
  return round2((principal * r * factor) / (factor - 1))
}

export function annualRateAt(loan: Loan, date: string, monthIndex: number): number {
  if (loan.rateKind === 'fixed') return Math.max(0, loan.annualRate)
  if (loan.rateKind === 'mixed' && monthIndex < (loan.fixedPeriodMonths || 0)) return Math.max(0, loan.annualRate)
  const revisions = [...(loan.revisions ?? [])].filter((r) => r.date <= date).sort((a, b) => a.date.localeCompare(b.date))
  const euribor = revisions.length ? revisions[revisions.length - 1].euribor : loan.initialEuribor || 0
  return Math.max(0, (loan.spread || 0) + euribor)
}

export function earlyRepaymentFee(loan: Loan, monthIndex: number): number {
  // shortcut: comissão legal geral (0,5% variável, 2% fixa); o contrato pode isentar.
  if (loan.rateKind === 'fixed') return 0.02
  if (loan.rateKind === 'variable') return 0.005
  return monthIndex < (loan.fixedPeriodMonths || 0) ? 0.02 : 0.005
}

function monthsToClear(balance: number, annual: number, payment: number): number {
  if (balance <= 0) return 0
  if (payment <= 0) return 600
  let left = balance
  const r = Math.max(0, annual) / 100 / 12
  for (let n = 1; n <= 600; n++) {
    const interest = round2(left * r)
    let capital = round2(payment - interest)
    if (capital <= 0) return 600
    if (capital > left) capital = left
    left = round2(left - capital)
    if (left <= 0) return n
  }
  return 600
}

export function buildSchedule(loan: Loan, extra?: EarlyRepaymentInput): ScheduleResult {
  const contractual = Math.max(0, Math.round(loan.termMonths || 0))
  const grace = Math.min(contractual, Math.max(0, Math.round(loan.graceMonths || 0)))
  const rows: Instalment[] = []
  let balance = loan.kind === 'obras' ? 0 : round2(loan.principal || 0)
  let included = 0
  let payment = 0
  let horizon = contractual
  let appliedAmount = 0
  let appliedBalanceBefore = 0
  let extraDone = false
  let deferTerm = false
  const drawdowns = [...(loan.drawdowns ?? [])].sort((a, b) => a.date.localeCompare(b.date))

  const futureDraw = (date: string) => loan.kind === 'obras' && drawdowns.some((d) => d.date > date)

  for (let i = 0; i < 2400; i++) {
    if (i >= horizon) break
    const date = paymentDate(loan.startDate, i, loan.paymentDay || 1)
    let delta = 0
    if (loan.kind === 'obras') {
      let sum = 0
      for (const d of drawdowns) if (d.date <= date) sum = round2(sum + d.amount)
      delta = round2(sum - included)
      included = sum
      if (delta) balance = round2(balance + delta)
    }

    const annual = annualRateAt(loan, date, i)
    const prev = rows[rows.length - 1]
    const rateChanged = !prev || prev.rate !== annual
    const inGrace = i < grace

    if (!inGrace) {
      if (deferTerm) {
        const sizing = round2(balance + appliedAmount)
        const monthsLeft = Math.max(1, horizon - i)
        payment = frenchPayment(sizing, annual, monthsLeft)
        horizon = Math.min(contractual, i + Math.max(1, monthsToClear(balance, annual, payment)))
        deferTerm = false
      } else if (payment === 0 || rateChanged || delta !== 0) {
        payment = frenchPayment(balance, annual, Math.max(1, horizon - i))
      }
    }

    if (!extraDone && extra && extra.amount > 0 && date >= extra.date && balance > 0) {
      appliedBalanceBefore = balance
      appliedAmount = round2(Math.min(round2(extra.amount), balance))
      balance = round2(balance - appliedAmount)
      extraDone = true
      if (!inGrace && extra.mode === 'term' && payment > 0) {
        horizon = Math.min(contractual, i + Math.max(1, monthsToClear(balance, annual, payment)))
      } else if (!inGrace && extra.mode === 'payment') {
        payment = frenchPayment(balance, annual, Math.max(1, horizon - i))
      } else if (inGrace && extra.mode === 'term') deferTerm = true
      else if (inGrace && extra.mode === 'payment') payment = 0
    }

    const r = Math.max(0, annual) / 100 / 12
    const interest = round2(balance * r)
    let capital = 0
    let instalment = interest
    if (!inGrace) {
      const last = horizon - i <= 1
      capital = round2(payment - interest)
      if (last || capital > balance) capital = balance
      if (capital < 0) capital = 0
      instalment = round2(capital + interest)
      balance = round2(balance - capital)
    }

    rows.push({
      index: i + 1,
      date,
      rate: annual,
      interest,
      capital,
      instalment,
      total: instalment,
      balance,
      phase: inGrace ? 'grace' : 'amort',
    })

    if (!inGrace && balance <= 0 && !futureDraw(date)) horizon = i + 1
  }

  return { rows, appliedAmount, appliedBalanceBefore }
}

export function schedule(loan: Loan): Instalment[] {
  return buildSchedule(loan).rows
}

function sumInterest(rows: Instalment[]): number {
  return round2(rows.reduce((s, r) => s + r.interest, 0))
}

export function simulateEarlyRepayment(loan: Loan, input: EarlyRepaymentInput): EarlyRepaymentResult | null {
  if (!input.amount || input.amount <= 0) return null
  const before = buildSchedule(loan)
  const after = buildSchedule(loan, input)
  if (after.appliedAmount <= 0 || before.rows.length === 0 || after.rows.length === 0) return null
  const appliedRow = before.rows.find((r) => r.date >= input.date)
  if (!appliedRow) return null
  const feeRate = earlyRepaymentFee(loan, appliedRow.index - 1)
  const commission = round2(after.appliedAmount * feeRate)
  const interestBefore = sumInterest(before.rows)
  const interestAfter = sumInterest(after.rows)
  const interestSaved = round2(interestBefore - interestAfter)
  const afterRow = after.rows.find((r) => r.date >= input.date) ?? after.rows[after.rows.length - 1]
  return {
    feeRate,
    commission,
    amountApplied: after.appliedAmount,
    amountRequested: round2(input.amount),
    balanceBefore: after.appliedBalanceBefore,
    interestBefore,
    interestAfter,
    interestSaved,
    netSaved: round2(interestSaved - commission),
    paymentBefore: appliedRow.instalment,
    paymentAfter: afterRow.instalment,
    endDateBefore: before.rows[before.rows.length - 1].date,
    endDateAfter: after.rows[after.rows.length - 1].date,
    instalmentsBefore: before.rows.length,
    instalmentsAfter: after.rows.length,
  }
}

export function propertyValue(loan: Loan): number {
  if (loan.kind !== 'habitacao') return 0
  return round2((loan.principal || 0) + (loan.downPayment || 0))
}

export function equityAt(loan: Loan, on: string): number {
  const value = propertyValue(loan)
  if (value <= 0) return 0
  return round2(value - outstandingAt(loan, on))
}

export function homeEquity(loans: Loan[], on: string): { value: number; debt: number; equity: number } {
  const value = round2(loans.reduce((s, loan) => s + propertyValue(loan), 0))
  const debt = round2(loans.reduce((s, loan) => s + outstandingAt(loan, on), 0))
  return { value, debt, equity: round2(value - debt) }
}

export function outstandingAt(loan: Loan, on: string): number {
  const rows = schedule(loan)
  let last: Instalment | null = null
  for (const row of rows) {
    if (row.date <= on) last = row
    else break
  }
  if (last) return last.balance
  if (loan.kind === 'obras') return round2((loan.drawdowns ?? []).filter((d) => d.date <= on).reduce((s, d) => s + d.amount, 0))
  return round2(loan.principal || 0)
}

export function interestTotals(loan: Loan, on: string): { paid: number; left: number } {
  let paid = 0
  let left = 0
  for (const row of schedule(loan)) {
    if (row.date <= on) paid += row.interest
    else left += row.interest
  }
  return { paid: round2(paid), left: round2(left) }
}

export function nextInstalment(loan: Loan, on: string): Instalment | null {
  for (const row of schedule(loan)) {
    if (row.date < on) continue
    if (loan.payments.some((p) => p.instalmentIndex === row.index)) continue
    return row
  }
  return null
}

export function overdueInstalments(loan: Loan, on: string): Instalment[] {
  return schedule(loan).filter((r) => r.date < on && !loan.payments.some((p) => p.instalmentIndex === r.index))
}

export function nextRevisionDate(loan: Loan): string | null {
  if (loan.rateKind === 'fixed') return null
  const last = [...(loan.revisions ?? [])].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  return addMonthsISO(last?.date ?? loan.startDate, loan.euriborTenor || 12)
}
