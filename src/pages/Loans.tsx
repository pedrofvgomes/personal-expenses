import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LoanForm } from '../components/LoanForm.tsx'
import { Empty, Meter, Modal, PageHeader } from '../components/ui.tsx'
import { todayISO, formatDate } from '../lib/dates.ts'
import { formatEUR, formatPct } from '../lib/money.ts'
import { homeEquity, nextInstalment, nextRevisionDate, outstandingAt, overdueInstalments, schedule } from '../lib/loan.ts'
import { useStore } from '../store.tsx'
import type { Loan } from '../types.ts'

export default function Loans() {
  const { data, mutate } = useStore()
  const [open, setOpen] = useState(false)
  const today = todayISO()
  const equity = homeEquity(data.loans, today)

  function save(loan: Loan) {
    mutate((d) => d.loans.push(loan))
    setOpen(false)
  }

  return (
    <div>
      <PageHeader title="Crédito" sub="Habitação e obras, com o mapa de prestações." action={<button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Novo crédito</button>} />
      {data.loans.length === 0 ? (
        <Empty title="Sem créditos" body="Regista o crédito habitação ou o crédito obras para veres a prestação, a dívida e uma amortização antecipada." action={<button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Adicionar</button>} />
      ) : (
        <>
        {equity.value > 0 && (
          <section className="card mb-4 p-4">
            <p className="text-sm text-muted">Capital próprio</p>
            <p className="amount mt-1 font-serif text-3xl">{formatEUR(equity.equity)}</p>
            <p className="text-sm text-muted">{Math.round((equity.equity / equity.value) * 100)}% de {formatEUR(equity.value)}</p>
            <div className="mt-3"><Meter value={Math.max(0, equity.equity)} max={equity.value} /></div>
            <p className="mt-3 text-sm text-muted">Dívida {formatEUR(equity.debt)}{data.loans.some((l) => l.kind === 'obras') ? ' · habitação e obras' : ''}</p>
          </section>
        )}
        <ul className="grid gap-3">
          {data.loans.map((loan) => {
            const owed = outstandingAt(loan, today)
            const next = nextInstalment(loan, today)
            const late = overdueInstalments(loan, today).length
            const rows = schedule(loan)
            const paid = rows.filter((r) => r.date <= today).reduce((s, r) => s + r.capital, 0)
            const revision = nextRevisionDate(loan)
            const rate = (rows.find((r) => r.date >= today) ?? rows[rows.length - 1])?.rate
            return (
              <li key={loan.id}>
                <Link to={`/credito/${loan.id}`} className="card block p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-muted">{loan.kind === 'habitacao' ? 'Habitação' : 'Obras'}{loan.bank ? ` · ${loan.bank}` : ''}</p>
                      <p className="mt-1 font-medium">{loan.name}</p>
                    </div>
                    {rate !== undefined && <p className="text-sm text-muted">TAN {formatPct(rate)}</p>}
                  </div>
                  <p className="amount mt-3 font-serif text-3xl">{formatEUR(owed)}</p>
                  <p className="text-sm text-muted">em dívida{loan.downPayment > 0 ? ` · entrada ${formatEUR(loan.downPayment)}` : ''}</p>
                  <div className="mt-3"><Meter value={paid} max={paid + owed || 1} /></div>
                  <p className="mt-3 text-sm">
                    {next ? `Próxima ${formatDate(next.date)} · ${formatEUR(next.total)}` : 'Sem prestações futuras'}
                    {late > 0 ? ` · ${late} por registar` : ''}
                  </p>
                  {revision && revision <= today && loan.rateKind !== 'fixed' && (
                    <p className="mt-1 text-sm text-bad">Euribor por atualizar desde {formatDate(revision)}</p>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
        </>
      )}
      {open && (
        <Modal title="Novo crédito" onClose={() => setOpen(false)}>
          <LoanForm onCancel={() => setOpen(false)} onSave={save} />
        </Modal>
      )}
    </div>
  )
}
