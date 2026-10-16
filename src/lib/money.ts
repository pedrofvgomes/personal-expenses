const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
const num = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 3 })

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function formatEUR(n: number): string {
  return eur.format(Number.isFinite(n) ? n : 0)
}

export function formatNumber(n: number): string {
  return num.format(Number.isFinite(n) ? n : 0)
}

export function formatPct(n: number): string {
  return `${pct.format(n)}%`
}

function parseRaw(input: string, allowNegative: boolean): number | null {
  let t = input.trim().replace(/\s/g, '').replace(/€/g, '')
  if (!t) return null
  let neg = false
  if (t.startsWith('-') || t.startsWith('−')) {
    if (!allowNegative) return null
    neg = true
    t = t.slice(1)
  }
  if (!t) return null
  let n: number
  if (t.includes(',') && t.includes('.')) n = Number(t.replace(/\./g, '').replace(',', '.'))
  else if (t.includes(',')) n = Number(t.replace(',', '.'))
  else n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return neg ? -n : n
}

export function parseAmount(input: string): number | null {
  const n = parseRaw(input, false)
  return n === null ? null : round2(n)
}

export function parseRate(input: string): number | null {
  const n = parseRaw(input, true)
  if (n === null) return null
  return Math.round((n + Number.EPSILON) * 10000) / 10000
}

export function formatRate(n: number): string {
  return new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 4 }).format(n)
}
