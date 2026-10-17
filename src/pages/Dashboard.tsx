import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { useShell } from '../components/Layout.tsx'
import { Empty, Meter, MonthSwitch, PageHeader } from '../components/ui.tsx'
import { formatDate, formatMonthName, thisMonth } from '../lib/dates.ts'
import { formatEUR, round2 } from '../lib/money.ts'
import { nextInstalment } from '../lib/loan.ts'
import {
  accountBalance,
  categorySpent,
  dailyCumulative,
  dueDates,
  materializeRecurring,
  monthCashflow,
  monthlyTrend,
  nextOccurrence,
  risingCategories,
  savingsStats,
  scheduleLabel,
  spendingCompare,
  spentByCategory,
  topExpenses,
  upcoming,
} from '../lib/selectors.ts'
import { useStore } from '../store.tsx'

const tip = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--ink)' }

function changeText(current: number, base: number): string {
  const diff = round2(current - base)
  const sign = diff > 0 ? '+' : ''
  if (base === 0) return `${sign}${formatEUR(diff)}`
  const pct = Math.round((diff / base) * 100)
  return `${sign}${formatEUR(diff)} (${pct > 0 ? '+' : ''}${pct}%)`
}

function rateText(rate: number | null): string {
  if (rate === null) return '—'
  return `${Math.round(rate * 100)}%`
}

export default function Dashboard() {
  const { data, mutate } = useStore()
  const { openTx } = useShell()
  const [month, setMonth] = useState(thisMonth())
  const flow = monthCashflow(data, month)
  const compare = spendingCompare(data, month)
  const savings = savingsStats(data, month)
  const aheadAll = upcoming(data)
  const ahead = aheadAll.slice(0, 8)
  const biggest = topExpenses(data, month)
  const rising = risingCategories(data, month)
  const daily = dailyCumulative(data, month)
  const slices = spentByCategory(data, month).map((s) => ({ id: s.category.id, name: s.category.name, emoji: s.category.emoji, color: s.category.color, value: s.value }))
  const trend = monthlyTrend(data, month)
  const budgets = data.budgets
    .map((b) => {
      const category = data.categories.find((c) => c.id === b.categoryId)
      if (!category) return null
      return { ...b, category, spent: categorySpent(data, b.categoryId, month) }
    })
    .filter((b) => b !== null)
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit)
  const pending = data.recurring.filter((r) => dueDates(r, data).length > 0)
  const loans = data.loans
    .map((loan) => ({ loan, next: nextInstalment(loan, new Date().toISOString().slice(0, 10)) }))
    .filter((row) => row.next)
    .sort((a, b) => a.next!.date.localeCompare(b.next!.date))

  function generateAll() {
    mutate((d) => {
      for (const rec of d.recurring) materializeRecurring(d, rec)
    })
  }

  return (
    <div>
      <PageHeader title="Painel" sub="O mês, visto de cima." action={<MonthSwitch value={month} onChange={setMonth} />} />

      <section className="rounded-3xl bg-accent p-5 text-accent-ink">
        <p className="text-sm opacity-80">Balanço de {formatMonthName(month)}</p>
        <p className="amount mt-1 font-serif text-4xl">{formatEUR(flow.balance)}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="opacity-75">Receitas</p>
            <p className="amount text-lg">{formatEUR(flow.income)}</p>
          </div>
          <div>
            <p className="opacity-75">Despesas</p>
            <p className="amount text-lg">{formatEUR(flow.expense)}</p>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="font-medium">Comparação</h2>
          <p className={`amount mt-2 text-2xl ${compare.expense > compare.previous ? 'text-bad' : 'text-good'}`}>{changeText(compare.expense, compare.previous)}</p>
          <p className="text-sm text-muted">em relação ao mês anterior</p>
          <p className="mt-1 text-sm text-muted">Mês anterior {formatEUR(compare.previous)} · média de 12 meses {formatEUR(compare.average)} ({changeText(compare.expense, compare.average)})</p>
          {compare.categories.length > 0 && (
            <ul className="mt-3 divide-y divide-line">
              {compare.categories.slice(0, 5).map((row) => (
                <li key={row.category.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{row.category.emoji} {row.category.name}</span>
                  <span className="shrink-0 text-muted">{formatEUR(row.spent)} · {changeText(row.spent, row.previous)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="font-medium">Taxa de poupança</h2>
          <p className="amount mt-2 font-serif text-4xl">{rateText(savings.rate)}</p>
          <p className="mt-2 text-sm text-muted">Média de 12 meses {rateText(savings.averageRate)}</p>
          <p className="mt-1 text-sm text-muted">Gasto médio mensal {formatEUR(savings.averageSpend)}</p>
        </section>
      </div>

      <section className="card mt-4 p-4">
        <h2 className="font-medium">Gasto diário</h2>
        {daily.every((row) => row.current === 0 && row.previous === 0) ? (
          <p className="mt-6 text-sm text-muted">Sem despesas neste mês nem no anterior.</p>
        ) : (
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value, name) => [formatEUR(Number(value ?? 0)), name === 'current' ? 'Este mês' : 'Mês anterior']} contentStyle={tip} />
                <Line type="monotone" dataKey="previous" name="previous" stroke="var(--muted)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="current" name="current" stroke="var(--bad)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="font-medium">Próximos 30 dias</h2>
          {ahead.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Nada previsto. <Link to="/recorrentes" className="text-accent">Recorrentes</Link></p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {ahead.map((item) => (
                <li key={`${item.date}-${item.label}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{formatDate(item.date)} · {item.label}</span>
                  <span className="shrink-0 text-right">
                    <span className={item.kind === 'income' ? 'text-good' : ''}>{item.kind === 'income' ? '+' : '−'}{formatEUR(item.amount)}</span>
                    <span className="mt-0.5 block text-xs text-muted">{formatEUR(item.balanceAfter)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {aheadAll.length > ahead.length && <p className="mt-2 text-xs text-muted">Mais {aheadAll.length - ahead.length}.</p>}
        </section>

        <section className="card p-4">
          <h2 className="font-medium">Maiores despesas</h2>
          {biggest.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Sem despesas neste mês.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {biggest.map((tx) => {
                const category = data.categories.find((item) => item.id === tx.categoryId)
                return (
                  <li key={tx.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{category?.emoji} {tx.note || category?.name} · {formatDate(tx.date)}</span>
                    <span className="amount shrink-0">{formatEUR(tx.amount)}</span>
                  </li>
                )
              })}
            </ul>
          )}
          {rising.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium">A subir</h3>
              <ul className="mt-2 grid gap-1">
                {rising.map((row) => (
                  <li key={row.category.id} className="flex justify-between text-sm text-muted">
                    <span>{row.category.emoji} {row.category.name}</span>
                    <span>{changeText(row.spent, row.average)} face à média</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="font-medium">Por categoria</h2>
          {slices.length === 0 ? (
            <p className="mt-6 text-sm text-muted">Sem despesas neste mês.</p>
          ) : (
            <div className="mt-2 grid items-center gap-2 sm:grid-cols-[180px_1fr]">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={slices} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none">
                      {slices.map((s) => <Cell key={s.id} fill={s.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => formatEUR(Number(value ?? 0))} contentStyle={tip} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="grid gap-2">
                {slices.slice(0, 6).map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                    <span className="flex-1 truncate">{s.emoji} {s.name}</span>
                    <span className="amount">{formatEUR(s.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Orçamentos</h2>
            <Link to="/orcamentos" className="text-sm text-accent">Ver</Link>
          </div>
          {budgets.length === 0 ? (
            <p className="mt-6 text-sm text-muted">Ainda não definiste limites.</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {budgets.slice(0, 4).map((b) => (
                <li key={b.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{b.category.emoji} {b.category.name}</span>
                    <span className={b.spent > b.limit ? 'text-bad' : 'text-muted'}>{formatEUR(b.spent)} / {formatEUR(b.limit)}</span>
                  </div>
                  <Meter value={b.spent} max={b.limit} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-4 p-4">
        <h2 className="font-medium">Últimos 12 meses</h2>
        {trend.every((row) => row.income === 0 && row.expense === 0) ? (
          <p className="mt-6 text-sm text-muted">Ainda sem histórico.</p>
        ) : (
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value, name) => [formatEUR(Number(value ?? 0)), name === 'income' ? 'Receitas' : 'Despesas']} contentStyle={tip} />
                <Bar dataKey="income" fill="var(--good)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="var(--bad)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium">Recorrentes</h2>
            {pending.length > 0 && <button type="button" className="btn btn-primary" onClick={generateAll}>Gerar {pending.length}</button>}
          </div>
          {data.recurring.filter((r) => r.active).length === 0 ? (
            <p className="mt-4 text-sm text-muted">Renda, luz, subscrições. <Link to="/recorrentes" className="text-accent">Adicionar</Link></p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {data.recurring.filter((r) => r.active).slice(0, 5).map((r) => {
                const due = dueDates(r, data)
                const cat = data.categories.find((c) => c.id === r.categoryId)
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{cat?.emoji} {r.note || cat?.name} · {scheduleLabel(r)}</span>
                    <span className="shrink-0 text-muted">{due.length ? 'por confirmar' : formatDate(nextOccurrence(r, data))}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="font-medium">Próximas prestações</h2>
          {loans.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Sem prestações à vista. <Link to="/credito" className="text-accent">Ver crédito</Link></p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {loans.slice(0, 4).map(({ loan, next }) => (
                <li key={loan.id}>
                  <Link to={`/credito/${loan.id}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{loan.name}</span>
                    <span className="amount shrink-0">{formatDate(next!.date)} · {formatEUR(next!.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        {data.accounts.map((a) => (
          <Link key={a.id} to="/contas" className="card px-4 py-3">
            <p className="text-sm text-muted">{a.name}</p>
            <p className="amount mt-1 font-serif text-2xl">{formatEUR(accountBalance(data, a.id))}</p>
          </Link>
        ))}
      </section>

      {data.transactions.length === 0 && (
        <div className="mt-4">
          <Empty title="Ainda está tudo em branco" body="Regista o primeiro movimento. No telemóvel, o botão + está sempre à mão." action={<button type="button" className="btn btn-primary" onClick={() => openTx()}>Novo movimento</button>} />
        </div>
      )}
    </div>
  )
}
