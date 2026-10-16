export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function thisMonth(): string {
  return todayISO().slice(0, 7)
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7)
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function cap(label: string): string {
  return label.charAt(0).toLocaleUpperCase('pt-PT') + label.slice(1)
}

export function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return cap(new Date(y, m - 1, 1).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' }))
}

export function formatMonthName(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-PT', { month: 'long' })
}

export function formatShortMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '')
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDayHeading(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = todayISO()
  const yest = new Date()
  yest.setDate(yest.getDate() - 1)
  if (iso === today) return 'Hoje'
  if (iso === toISODate(yest)) return 'Ontem'
  return cap(date.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }))
}

export function clampDay(year: number, monthIndex: number, day: number): string {
  const last = new Date(year, monthIndex + 1, 0).getDate()
  const d = Math.min(Math.max(1, day), last)
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toISODate(new Date(y, m - 1, d + days))
}

export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const total = m - 1 + months
  const year = y + Math.floor(total / 12)
  const monthIndex = ((total % 12) + 12) % 12
  return clampDay(year, monthIndex, d)
}

export function dateInMonth(ym: string, day: number): string {
  const [y, m] = ym.split('-').map(Number)
  return clampDay(y, m - 1, day)
}

/** First instalment falls in the start month when paymentDay >= start day, otherwise the next month. */
export function paymentDate(startDate: string, index: number, paymentDay: number): string {
  const [y, m, startDay] = startDate.split('-').map(Number)
  const shift = paymentDay < startDay ? 1 : 0
  const total = m - 1 + index + shift
  const year = y + Math.floor(total / 12)
  const monthIndex = ((total % 12) + 12) % 12
  return clampDay(year, monthIndex, paymentDay)
}
