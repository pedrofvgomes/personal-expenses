import { describe, expect, it } from 'vitest'
import { paymentDate } from './dates.ts'
import { annualRateAt, frenchPayment, schedule, simulateEarlyRepayment } from './loan.ts'
import { round2 } from './money.ts'
import type { Loan } from '../types.ts'

function loan(partial: Partial<Loan> & Pick<Loan, 'principal' | 'termMonths' | 'rateKind'>): Loan {
  return {
    id: 'l',
    kind: 'habitacao',
    name: 'Teste',
    bank: '',
    startDate: '2026-01-10',
    paymentDay: 10,
    annualRate: 0,
    spread: 0,
    euriborTenor: 12,
    initialEuribor: 0,
    fixedPeriodMonths: 0,
    lifeInsurance: 0,
    homeInsurance: 0,
    graceMonths: 0,
    revisions: [],
    drawdowns: [],
    payments: [],
    ...partial,
  }
}

describe('payment dates', () => {
  it('shifts to the next month when the day already passed', () => {
    expect(paymentDate('2026-03-10', 0, 5)).toBe('2026-04-05')
    expect(paymentDate('2026-03-10', 0, 15)).toBe('2026-03-15')
  })

  it('clamps the payment day to the end of the month', () => {
    expect(paymentDate('2026-01-31', 1, 31)).toBe('2026-02-28')
    expect(paymentDate('2024-01-31', 1, 31)).toBe('2024-02-29')
  })
})

describe('french schedule', () => {
  it('pays a fixed loan down to zero', () => {
    const item = loan({ principal: 100_000, termMonths: 120, rateKind: 'fixed', annualRate: 6 })
    const rows = schedule(item)
    expect(rows).toHaveLength(120)
    expect(rows[0].interest).toBe(500)
    expect(rows[0].instalment).toBeCloseTo(frenchPayment(100_000, 6, 120), 2)
    expect(rows[rows.length - 1].balance).toBe(0)
    expect(round2(rows.reduce((s, r) => s + r.capital, 0))).toBe(100_000)
    const regular = rows.slice(0, -1).map((r) => r.instalment)
    expect(new Set(regular).size).toBe(1)
  })

  it('splits a zero-interest loan into equal capital', () => {
    const rows = schedule(loan({ principal: 1200, termMonths: 12, rateKind: 'fixed', annualRate: 0 }))
    expect(rows.every((r) => r.interest === 0 && r.capital === 100)).toBe(true)
    expect(rows[11].balance).toBe(0)
  })

  it('recalculates the payment when euribor changes', () => {
    const item = loan({
      principal: 10_000,
      termMonths: 8,
      rateKind: 'variable',
      spread: 0,
      initialEuribor: 12,
      revisions: [{ id: 'r', date: '2026-05-10', euribor: 0 }],
    })
    const rows = schedule(item)
    expect(rows[3].rate).toBe(12)
    expect(rows[4].rate).toBe(0)
    expect(rows[4].instalment).not.toBe(rows[3].instalment)
    expect(rows[7].balance).toBe(0)
  })

  it('floors a negative euribor at zero', () => {
    const item = loan({ principal: 1000, termMonths: 2, rateKind: 'variable', spread: 0.2, initialEuribor: -0.5 })
    expect(annualRateAt(item, '2026-01-10', 0)).toBe(0)
  })

  it('adds insurance on top of the instalment', () => {
    const rows = schedule(loan({ principal: 1000, termMonths: 2, rateKind: 'fixed', annualRate: 0, lifeInsurance: 10, homeInsurance: 5 }))
    expect(rows[0].insurance).toBe(15)
    expect(rows[0].total).toBe(round2(rows[0].instalment + 15))
  })
})

describe('crédito obras', () => {
  it('charges interest only during grace, then amortizes what was drawn', () => {
    const item = loan({
      kind: 'obras',
      principal: 5000,
      termMonths: 6,
      graceMonths: 2,
      rateKind: 'fixed',
      annualRate: 12,
      drawdowns: [
        { id: 'a', date: '2026-01-01', amount: 3000 },
        { id: 'b', date: '2026-02-01', amount: 2000 },
      ],
    })
    const rows = schedule(item)
    expect(rows[0]).toMatchObject({ phase: 'grace', capital: 0, interest: 30, balance: 3000 })
    expect(rows[1]).toMatchObject({ phase: 'grace', capital: 0, interest: 50, balance: 5000 })
    expect(rows[2].phase).toBe('amort')
    expect(rows[rows.length - 1].balance).toBe(0)
    expect(round2(rows.reduce((s, r) => s + r.capital, 0))).toBe(5000)
  })
})

describe('early repayment', () => {
  const base = () => loan({ principal: 10_000, termMonths: 10, rateKind: 'fixed', annualRate: 12 })

  it('charges 2% on a fixed rate and reduces interest', () => {
    const result = simulateEarlyRepayment(base(), { date: '2026-05-10', amount: 3000, mode: 'payment' })
    expect(result).not.toBeNull()
    expect(result?.feeRate).toBe(0.02)
    expect(result?.commission).toBe(60)
    expect(result!.interestAfter).toBeLessThan(result!.interestBefore)
    expect(result?.netSaved).toBe(round2(result!.interestSaved - 60))
    expect(result?.instalmentsAfter).toBe(result?.instalmentsBefore)
    expect(result!.paymentAfter).toBeLessThan(result!.paymentBefore)
  })

  it('shortens the term when asked to keep the payment', () => {
    const result = simulateEarlyRepayment(base(), { date: '2026-05-10', amount: 3000, mode: 'term' })
    expect(result!.instalmentsAfter).toBeLessThan(result!.instalmentsBefore)
    expect(result!.paymentAfter).toBeCloseTo(result!.paymentBefore, 1)
  })

  it('charges 0.5% on a variable rate', () => {
    const item = loan({ principal: 10_000, termMonths: 10, rateKind: 'variable', spread: 1, initialEuribor: 2 })
    const result = simulateEarlyRepayment(item, { date: '2026-04-10', amount: 1000, mode: 'payment' })
    expect(result?.feeRate).toBe(0.005)
    expect(result?.commission).toBe(5)
  })

  it('uses the fixed fee during the mixed-rate period', () => {
    const item = loan({
      principal: 10_000,
      termMonths: 14,
      rateKind: 'mixed',
      annualRate: 3,
      spread: 1,
      initialEuribor: 2,
      fixedPeriodMonths: 12,
    })
    expect(simulateEarlyRepayment(item, { date: '2026-06-10', amount: 500, mode: 'payment' })?.feeRate).toBe(0.02)
    expect(simulateEarlyRepayment(item, { date: '2027-02-10', amount: 500, mode: 'payment' })?.feeRate).toBe(0.005)
  })
})
