import { useState, type FormEvent } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { PageHeader } from '../components/ui.tsx'
import { formatDate, thisMonth, todayISO } from '../lib/dates.ts'
import { formatEUR, formatNumber, parseAmount } from '../lib/money.ts'
import { netWorthAt, netWorthTrend, recordPortfolio } from '../lib/selectors.ts'
import { useStore } from '../store.tsx'

const tip = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--ink)' }

export default function Wealth() {
  const { data, mutate } = useStore()
  const today = todayISO()
  const latest = data.portfolio.at(-1)
  const savedPortfolio = latest ? formatNumber(latest.total) : ''
  const [draft, setDraft] = useState(savedPortfolio)
  const [savedSeen, setSavedSeen] = useState(savedPortfolio)
  if (savedSeen !== savedPortfolio) {
    setSavedSeen(savedPortfolio)
    setDraft(savedPortfolio)
  }
  const [error, setError] = useState('')
  const worth = netWorthAt(data, today)
  const trend = netWorthTrend(data, thisMonth())

  function save(event: FormEvent) {
    event.preventDefault()
    const value = parseAmount(draft || '0')
    if (value === null) {
      setError('Indica um valor em euros.')
      return
    }
    setError('')
    mutate((d) => {
      d.portfolio = recordPortfolio(d.portfolio, today, value)
    })
  }

  return (
    <div>
      <PageHeader title="Património" sub="Contas, investimentos e a casa." />
      <section className="card p-5">
        <p className="text-sm text-muted">Património líquido · {formatDate(today)}</p>
        <p className="amount mt-1 font-serif text-4xl">{formatEUR(worth.total)}</p>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted">Contas</p>
            <p className="amount">{formatEUR(worth.accounts)}</p>
          </div>
          <div>
            <p className="text-muted">Investimentos</p>
            <p className="amount">{formatEUR(worth.invested)}</p>
          </div>
          <div>
            <p className="text-muted">Capital próprio da casa</p>
            <p className="amount">{formatEUR(worth.equity)}</p>
          </div>
        </div>
        <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={save}>
          <label className="min-w-40 flex-1">
            <span className="label">Valor do portefólio</span>
            <input className="field" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="0,00" />
          </label>
          <button className="btn btn-primary" type="submit">Guardar</button>
        </form>
        {error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
        {trend.some((row) => row.total !== 0) && (
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => formatEUR(Number(value ?? 0))} contentStyle={tip} />
                <Line type="monotone" dataKey="total" name="Património" stroke="var(--accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  )
}
