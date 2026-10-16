import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { LoanForm } from '../components/LoanForm.tsx'
import { Field, Modal, Segmented } from '../components/ui.tsx'
import { formatDate, shiftMonth, todayISO } from '../lib/dates.ts'
import { uid } from '../lib/id.ts'
import { equityAt, interestTotals, nextRevisionDate, outstandingAt, overdueInstalments, propertyValue, schedule, simulateEarlyRepayment, type Instalment } from '../lib/loan.ts'
import { formatEUR, formatPct, parseAmount, parseRate, round2 } from '../lib/money.ts'
import { useStore } from '../store.tsx'
import type { Loan } from '../types.ts'

const tip = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--ink)' }

export default function LoanDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, mutate } = useStore()
  const loan = data.loans.find((l) => l.id === id)
  const [editing, setEditing] = useState(false)
  const [full, setFull] = useState(false)
  const [arm, setArm] = useState(false)
  const [pay, setPay] = useState<Instalment | null>(null)
  if (!loan) {
    return <p className="text-muted">Este crédito não existe. <Link to="/credito" className="text-accent">Voltar</Link></p>
  }
  return (
    <LoanView
      loan={loan}
      editing={editing}
      setEditing={setEditing}
      full={full}
      setFull={setFull}
      arm={arm}
      setArm={setArm}
      pay={pay}
      setPay={setPay}
      onSave={(next) => {
        mutate((d) => {
          const i = d.loans.findIndex((l) => l.id === next.id)
          if (i >= 0) d.loans[i] = next
        })
        setEditing(false)
      }}
      onDelete={() => {
        mutate((d) => { d.loans = d.loans.filter((l) => l.id !== loan.id) })
        navigate('/credito')
      }}
    />
  )
}

function LoanView({
  loan, editing, setEditing, full, setFull, arm, setArm, pay, setPay, onSave, onDelete,
}: {
  loan: Loan
  editing: boolean
  setEditing: (v: boolean) => void
  full: boolean
  setFull: (v: boolean) => void
  arm: boolean
  setArm: (v: boolean) => void
  pay: Instalment | null
  setPay: (v: Instalment | null) => void
  onSave: (loan: Loan) => void
  onDelete: () => void
}) {
  const { data, mutate } = useStore()
  const today = todayISO()
  const rows = useMemo(() => schedule(loan), [loan])
  const owed = outstandingAt(loan, today)
  const value = propertyValue(loan)
  const owned = equityAt(loan, today)
  const interest = interestTotals(loan, today)
  const late = overdueInstalments(loan, today)
  const revision = nextRevisionDate(loan)
  const current = rows.find((r) => r.date >= today) ?? rows[rows.length - 1]
  const cutoff = `${shiftMonth(today.slice(0, 7), -1)}-01`
  const visible = full ? rows : rows.filter((r) => r.date >= cutoff)
  const years = useMemo(() => {
    const map = new Map<string, { year: string; capital: number; interest: number }>()
    for (const row of rows) {
      const year = row.date.slice(0, 4)
      const item = map.get(year) ?? { year, capital: 0, interest: 0 }
      item.capital = round2(item.capital + row.capital)
      item.interest = round2(item.interest + row.interest)
      map.set(year, item)
    }
    return [...map.values()]
  }, [rows])

  function markPast() {
    mutate((d) => {
      const item = d.loans.find((l) => l.id === loan.id)
      if (!item) return
      for (const row of schedule(item)) {
        if (row.date >= today) break
        if (item.payments.some((p) => p.instalmentIndex === row.index)) continue
        item.payments.push({ id: uid(), instalmentIndex: row.index, amount: row.total, date: row.date })
      }
    })
  }

  function unlink(row: Instalment) {
    mutate((d) => {
      const item = d.loans.find((l) => l.id === loan.id)
      if (!item) return
      const payment = item.payments.find((p) => p.instalmentIndex === row.index)
      if (!payment) return
      item.payments = item.payments.filter((p) => p.id !== payment.id)
      const tx = d.transactions.find((t) => t.id === payment.transactionId || t.loanPaymentId === payment.id)
      if (tx) tx.loanPaymentId = undefined
    })
  }

  return (
    <div>
      <Link to="/credito" className="text-sm text-muted">Crédito</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{loan.kind === 'habitacao' ? 'Habitação' : 'Obras'}{loan.bank ? ` · ${loan.bank}` : ''}</p>
          <h1 className="font-serif text-3xl">{loan.name}</h1>
        </div>
        <button type="button" className="btn" onClick={() => setEditing(true)}>Editar</button>
      </div>
      <p className="mt-2 max-w-xl text-sm text-muted">Prestação constante. Quando a taxa muda, é recalculada para o prazo que falta.</p>
      {loan.downPayment > 0 && (
        <p className="mt-1 text-sm text-muted">Entrada {formatEUR(loan.downPayment)} · imóvel {formatEUR(round2(loan.principal + loan.downPayment))}</p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Em dívida" value={formatEUR(owed)} />
        <Stat label="Prestação" value={current ? formatEUR(current.total) : '—'} hint={current ? `TAN ${formatPct(current.rate)}` : undefined} />
        <Stat label="Juros pagos" value={formatEUR(interest.paid)} />
        <Stat label="Juros a pagar" value={formatEUR(interest.left)} />
        {value > 0 && (
          <Stat
            label="Capital próprio"
            value={formatEUR(owned)}
            hint={data.loans.some((l) => l.kind === 'obras')
              ? `${Math.round((owned / value) * 100)}% deste crédito. O crédito obras entra no total da lista.`
              : `${Math.round((owned / value) * 100)}% de ${formatEUR(value)}`}
          />
        )}
      </div>

      {late.length > 0 && (
        <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">{late.length} prestações anteriores ainda não estão registadas.</p>
          <button type="button" className="btn" onClick={markPast}>Marcar anteriores como pagas</button>
        </div>
      )}

      {years.length > 0 && (
        <section className="card mt-4 p-4">
          <h2 className="font-medium">Capital e juros por ano</h2>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={years}>
                <XAxis dataKey="year" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value, name) => [formatEUR(Number(value ?? 0)), name === 'capital' ? 'Capital' : 'Juros']} contentStyle={tip} />
                <Bar dataKey="capital" stackId="a" fill="var(--accent)" />
                <Bar dataKey="interest" stackId="a" fill="var(--bad)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <Simulator loan={loan} />

      {loan.rateKind !== 'fixed' && (
        <section className="card mt-4 p-4">
          <h2 className="font-medium">Revisões da Euribor</h2>
          {revision && <p className="mt-1 text-sm text-muted">Próxima revisão prevista a {formatDate(revision)}.</p>}
          <RevisionForm loan={loan} />
          <ul className="mt-3 divide-y divide-line">
            {[...loan.revisions].sort((a, b) => b.date.localeCompare(a.date)).map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span>{formatDate(r.date)} · {formatPct(r.euribor)}</span>
                <button type="button" className="text-bad" onClick={() => mutate((d) => { const item = d.loans.find((l) => l.id === loan.id); if (item) item.revisions = item.revisions.filter((x) => x.id !== r.id) })}>Apagar</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loan.kind === 'obras' && <Drawdowns loan={loan} />}

      <section className="card mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Mapa de prestações</h2>
          <button type="button" className="btn" onClick={() => setFull(!full)}>{full ? 'Desde o mês passado' : 'Mapa completo'}</button>
        </div>
        <div className="mt-3 max-h-[32rem] overflow-auto">
          <div className="hidden grid-cols-8 gap-2 px-1 pb-2 text-xs text-muted md:grid">
            <span>#</span><span>Data</span><span>Juros</span><span>Capital</span><span>Seguros</span><span>Total</span><span>Dívida</span><span />
          </div>
          {visible.map((row) => {
            const paid = loan.payments.some((p) => p.instalmentIndex === row.index)
            return (
              <div key={row.index} className="grid grid-cols-2 gap-1 border-t border-line py-3 text-sm md:grid-cols-8 md:items-center">
                <span className="text-muted">{row.index}{row.phase === 'grace' ? ' · carência' : ''}</span>
                <span>{formatDate(row.date)}</span>
                <span className="hidden md:block">{formatEUR(row.interest)}</span>
                <span className="hidden md:block">{formatEUR(row.capital)}</span>
                <span className="hidden md:block">{formatEUR(row.insurance)}</span>
                <span className="col-span-2 text-muted md:hidden">Seguros {formatEUR(row.insurance)}</span>
                <span className="amount font-medium">{formatEUR(row.total)}</span>
                <span className="amount text-muted">{formatEUR(row.balance)}</span>
                <span className="col-span-2 md:col-span-1 md:text-right">
                  {paid ? (
                    <button type="button" className="text-sm text-good" onClick={() => unlink(row)}>Pago · desligar</button>
                  ) : (
                    <button type="button" className="text-sm text-accent" onClick={() => setPay(row)}>Registar</button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <button type="button" className="btn btn-danger mt-6" onClick={() => (arm ? onDelete() : setArm(true))}>{arm ? 'Confirmar apagar' : 'Apagar empréstimo'}</button>

      {editing && (
        <Modal title="Editar crédito" onClose={() => setEditing(false)}>
          <LoanForm initial={loan} onCancel={() => setEditing(false)} onSave={onSave} />
        </Modal>
      )}
      {pay && <PayModal loan={loan} row={pay} onClose={() => setPay(null)} />}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="amount mt-1 font-serif text-2xl">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

function Simulator({ loan }: { loan: Loan }) {
  const today = todayISO()
  const [date, setDate] = useState(today)
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<'payment' | 'term'>('payment')
  const parsed = parseAmount(amount || '0') ?? 0
  const result = parsed > 0 ? simulateEarlyRepayment(loan, { date, amount: parsed, mode }) : null
  return (
    <section className="card mt-4 p-4">
      <h2 className="font-medium">Amortização antecipada</h2>
      <p className="mt-1 text-sm text-muted">Isto não altera o empréstimo. A comissão é 0,5% na taxa variável e 2% na fixa; o teu contrato pode isentar.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Data"><input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Valor"><input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5.000,00" /></Field>
      </div>
      <div className="mt-3">
        <Segmented value={mode} onChange={setMode} options={[{ id: 'payment', label: 'Baixar prestação' }, { id: 'term', label: 'Encurtar prazo' }]} />
      </div>
      {parsed > 0 && !result && <p className="mt-3 text-sm text-muted">A data fica fora do prazo, ou já não há capital em dívida.</p>}
      {result && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Comissão" value={formatEUR(result.commission)} hint={formatPct(result.feeRate * 100)} />
          <Stat label="Juros poupados" value={formatEUR(result.interestSaved)} />
          <Stat label="Poupança líquida" value={formatEUR(result.netSaved)} />
          <Stat label={mode === 'payment' ? 'Nova prestação' : 'Prestação'} value={formatEUR(result.paymentAfter)} hint={`Termina a ${formatDate(result.endDateAfter)}`} />
          {result.amountApplied < result.amountRequested && <p className="text-sm text-muted sm:col-span-2">Só apliquei {formatEUR(result.amountApplied)}, o capital em dívida nessa data.</p>}
        </div>
      )}
    </section>
  )
}

function RevisionForm({ loan }: { loan: Loan }) {
  const { mutate } = useStore()
  const [date, setDate] = useState(todayISO())
  const [euribor, setEuribor] = useState('')
  return (
    <form
      className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        const value = parseRate(euribor || '0')
        if (value === null || !date) return
        mutate((d) => {
          const item = d.loans.find((l) => l.id === loan.id)
          item?.revisions.push({ id: uid(), date, euribor: value })
        })
        setEuribor('')
      }}
    >
      <Field label="Data da revisão"><input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
      <Field label="Euribor (%)"><input className="field" inputMode="decimal" value={euribor} onChange={(e) => setEuribor(e.target.value)} placeholder="2,15" /></Field>
      <button className="btn btn-primary" type="submit">Registar</button>
    </form>
  )
}

function Drawdowns({ loan }: { loan: Loan }) {
  const { mutate } = useStore()
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState('')
  const drawn = round2(loan.drawdowns.reduce((s, d) => s + d.amount, 0))
  return (
    <section className="card mt-4 p-4">
      <h2 className="font-medium">Desembolsos</h2>
      <p className="mt-1 text-sm text-muted">{formatEUR(drawn)} usados de {formatEUR(loan.principal)} aprovados.{drawn > loan.principal ? ' Já passaste o capital aprovado.' : ''}</p>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          const value = parseAmount(amount)
          if (!value) return
          mutate((d) => {
            const item = d.loans.find((l) => l.id === loan.id)
            item?.drawdowns.push({ id: uid(), date, amount: value })
          })
          setAmount('')
        }}
      >
        <Field label="Data"><input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Field label="Valor"><input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <button className="btn btn-primary" type="submit">Adicionar</button>
      </form>
      <ul className="mt-3 divide-y divide-line">
        {[...loan.drawdowns].sort((a, b) => b.date.localeCompare(a.date)).map((d) => (
          <li key={d.id} className="flex items-center justify-between py-2 text-sm">
            <span>{formatDate(d.date)} · {formatEUR(d.amount)}</span>
            <button type="button" className="text-bad" onClick={() => mutate((draft) => { const item = draft.loans.find((l) => l.id === loan.id); if (item) item.drawdowns = item.drawdowns.filter((x) => x.id !== d.id) })}>Apagar</button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PayModal({ loan, row, onClose }: { loan: Loan; row: Instalment; onClose: () => void }) {
  const { data, mutate } = useStore()
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? '')
  const [linkId, setLinkId] = useState('')
  const prev = shiftMonth(row.date.slice(0, 7), -1)
  const candidates = data.transactions.filter((t) => t.type === 'expense' && !t.loanPaymentId && (t.date.startsWith(row.date.slice(0, 7)) || t.date.startsWith(prev)))

  function create() {
    if (!accountId) return
    const txId = uid()
    const payId = uid()
    mutate((d) => {
      const item = d.loans.find((l) => l.id === loan.id)
      if (!item || item.payments.some((p) => p.instalmentIndex === row.index)) return
      d.transactions.push({
        id: txId,
        type: 'expense',
        amount: row.total,
        categoryId: d.categories.find((c) => c.id === 'cat-credito')?.id ?? d.categories.find((c) => c.kind === 'expense')?.id ?? null,
        accountId,
        date: row.date,
        note: `Prestação ${row.index} · ${item.name}`,
        tags: ['crédito'],
        loanPaymentId: payId,
      })
      item.payments.push({ id: payId, instalmentIndex: row.index, transactionId: txId, amount: row.total, date: row.date })
    })
    onClose()
  }

  function link() {
    if (!linkId) return
    mutate((d) => {
      const item = d.loans.find((l) => l.id === loan.id)
      const tx = d.transactions.find((t) => t.id === linkId)
      if (!item || !tx || item.payments.some((p) => p.instalmentIndex === row.index)) return
      const payId = uid()
      tx.loanPaymentId = payId
      item.payments.push({ id: payId, instalmentIndex: row.index, transactionId: tx.id, amount: tx.amount, date: row.date })
    })
    onClose()
  }

  return (
    <Modal title={`Prestação ${row.index}`} onClose={onClose}>
      <p className="text-sm text-muted">{formatDate(row.date)} · {formatEUR(row.total)} incluindo seguros.</p>
      <div className="mt-4 grid gap-3">
        <Field label="Conta do débito">
          <select className="field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <button type="button" className="btn btn-primary" onClick={create}>Criar movimento</button>
        {candidates.length > 0 && (
          <>
            <Field label="Ou ligar a um movimento existente">
              <select className="field" value={linkId} onChange={(e) => setLinkId(e.target.value)}>
                <option value="">Escolher</option>
                {candidates.map((t) => <option key={t.id} value={t.id}>{formatDate(t.date)} · {formatEUR(t.amount)} · {t.note || 'sem nota'}</option>)}
              </select>
            </Field>
            <button type="button" className="btn" onClick={link} disabled={!linkId}>Ligar</button>
          </>
        )}
      </div>
    </Modal>
  )
}
