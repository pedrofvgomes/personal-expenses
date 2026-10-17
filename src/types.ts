export type TxType = 'expense' | 'income' | 'transfer'
export type CategoryKind = 'expense' | 'income'
export type AccountType = 'checking' | 'savings' | 'cash' | 'other'
export type LoanKind = 'habitacao' | 'obras'
export type RateKind = 'fixed' | 'variable' | 'mixed'
export type EuriborTenor = 3 | 6 | 12

export interface Category {
  id: string
  name: string
  emoji: string
  color: string
  kind: CategoryKind
}

export interface Account {
  id: string
  name: string
  type: AccountType
  openingBalance: number
}

export interface Transaction {
  id: string
  amount: number
  type: TxType
  categoryId: string | null
  accountId: string
  toAccountId?: string
  date: string
  note: string
  tags: string[]
  recurringId?: string
  loanPaymentId?: string
}

export interface Budget {
  id: string
  categoryId: string
  limit: number
}

export type RecurUnit = 'day' | 'week' | 'month' | 'year'

export interface Recurring {
  id: string
  amount: number
  type: 'expense' | 'income'
  categoryId: string
  accountId: string
  note: string
  start: string
  every: number
  unit: RecurUnit
  active: boolean
}

export interface Goal {
  id: string
  name: string
  emoji: string
  target: number
  saved: number
}

export interface RateRevision {
  id: string
  date: string
  euribor: number
}

export interface Drawdown {
  id: string
  date: string
  amount: number
}

export interface LoanPayment {
  id: string
  instalmentIndex: number
  transactionId?: string
  amount: number
  date: string
}

export interface Loan {
  id: string
  kind: LoanKind
  name: string
  bank: string
  principal: number
  downPayment: number
  termMonths: number
  startDate: string
  paymentDay: number
  rateKind: RateKind
  annualRate: number
  spread: number
  euriborTenor: EuriborTenor
  initialEuribor: number
  fixedPeriodMonths: number
  graceMonths: number
  revisions: RateRevision[]
  drawdowns: Drawdown[]
  payments: LoanPayment[]
}

export interface AppData {
  version: 1
  updatedAt: string
  categories: Category[]
  accounts: Account[]
  transactions: Transaction[]
  budgets: Budget[]
  recurring: Recurring[]
  goals: Goal[]
  loans: Loan[]
}
