import { useState } from 'react'
import { Field, Segmented } from './ui.tsx'
import { uid } from '../lib/id.ts'
import { todayISO } from '../lib/dates.ts'
import { formatNumber, formatRate, parseAmount, parseRate } from '../lib/money.ts'
import type { EuriborTenor, Loan, LoanKind, RateKind } from '../types.ts'

function money(n: number): string {
  return formatNumber(n)
}

export function LoanForm({ initial, onCancel, onSave }: { initial?: Loan; onCancel: () => void; onSave: (loan: Loan) => void }) {
  const [kind, setKind] = useState<LoanKind>(initial?.kind ?? 'habitacao')
  const [name, setName] = useState(initial?.name ?? '')
  const [bank, setBank] = useState(initial?.bank ?? '')
  const [principal, setPrincipal] = useState(initial ? money(initial.principal) : '')
  const [termMonths, setTermMonths] = useState(initial ? String(initial.termMonths) : kind === 'habitacao' ? '360' : '60')
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayISO())
  const [paymentDay, setPaymentDay] = useState(String(initial?.paymentDay ?? 1))
  const [rateKind, setRateKind] = useState<RateKind>(initial?.rateKind ?? 'variable')
  const [annualRate, setAnnualRate] = useState(initial ? formatRate(initial.annualRate) : '')
  const [spread, setSpread] = useState(initial ? formatRate(initial.spread) : '')
  const [initialEuribor, setInitialEuribor] = useState(initial ? formatRate(initial.initialEuribor) : '')
  const [tenor, setTenor] = useState<EuriborTenor>(initial?.euriborTenor ?? 12)
  const [fixedPeriod, setFixedPeriod] = useState(initial ? String(initial.fixedPeriodMonths) : '60')
  const [life, setLife] = useState(initial ? money(initial.lifeInsurance) : '')
  const [home, setHome] = useState(initial ? money(initial.homeInsurance) : '')
  const [grace, setGrace] = useState(initial ? String(initial.graceMonths) : '0')
  const [error, setError] = useState('')

  const months = Number(termMonths)
  const years = Number.isFinite(months) ? Math.floor(months / 12) : 0
  const rem = Number.isFinite(months) ? months % 12 : 0

  function save() {
    const capital = parseAmount(principal)
    const term = Number(termMonths)
    const day = Number(paymentDay)
    const graceMonths = Number(grace || 0)
    const fixedMonths = Number(fixedPeriod || 0)
    if (!name.trim()) return setError('Dá um nome ao crédito.')
    if (!capital || capital <= 0) return setError('Indica o capital.')
    if (!Number.isInteger(term) || term <= 0) return setError('O prazo tem de ser um número de meses.')
    if (!Number.isInteger(day) || day < 1 || day > 31) return setError('O dia de pagamento fica entre 1 e 31.')
    if (!Number.isInteger(graceMonths) || graceMonths < 0 || graceMonths >= term) return setError('A carência tem de ser menor que o prazo.')
    const tan = parseRate(annualRate || '0')
    const spreadN = parseRate(spread || '0')
    const euribor = parseRate(initialEuribor || '0')
    if (tan === null || spreadN === null || euribor === null) return setError('Uma das taxas não é válida.')
    if (rateKind !== 'variable' && tan < 0) return setError('A TAN não pode ser negativa.')
    if (rateKind === 'mixed' && (!Number.isInteger(fixedMonths) || fixedMonths <= 0 || fixedMonths >= term)) {
      return setError('O período de taxa fixa tem de ser menor que o prazo.')
    }
    onSave({
      id: initial?.id ?? uid(),
      kind,
      name: name.trim(),
      bank: bank.trim(),
      principal: capital,
      termMonths: term,
      startDate,
      paymentDay: day,
      rateKind,
      annualRate: tan,
      spread: spreadN,
      euriborTenor: tenor,
      initialEuribor: euribor,
      fixedPeriodMonths: rateKind === 'mixed' ? fixedMonths : 0,
      lifeInsurance: parseAmount(life || '0') ?? 0,
      homeInsurance: parseAmount(home || '0') ?? 0,
      graceMonths,
      revisions: initial?.revisions ?? [],
      drawdowns: initial?.drawdowns ?? [],
      payments: initial?.payments ?? [],
    })
  }

  return (
    <form
      className="grid min-w-0 gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { id: 'habitacao', label: 'Habitação' },
          { id: 'obras', label: 'Obras' },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'habitacao' ? 'Casa' : 'Obras'} />
        </Field>
        <Field label="Banco">
          <input className="field" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Opcional" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={kind === 'obras' ? 'Capital aprovado' : 'Capital'} hint="Em euros">
          <input className="field" inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="150.000,00" />
        </Field>
        <Field label="Prazo (meses)" hint={years ? `${years} anos${rem ? ` e ${rem} meses` : ''}` : undefined}>
          <input className="field" inputMode="numeric" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Início">
          <input className="field" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field label="Dia de pagamento">
          <input className="field" inputMode="numeric" value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} />
        </Field>
      </div>
      <Field label="Taxa">
        <Segmented
          value={rateKind}
          onChange={setRateKind}
          options={[
            { id: 'variable', label: 'Variável' },
            { id: 'fixed', label: 'Fixa' },
            { id: 'mixed', label: 'Mista' },
          ]}
        />
      </Field>
      {rateKind !== 'variable' && (
        <Field label="TAN fixa (%)" hint="Não inclui seguros.">
          <input className="field" inputMode="decimal" value={annualRate} onChange={(e) => setAnnualRate(e.target.value)} placeholder="2,90" />
        </Field>
      )}
      {rateKind !== 'fixed' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Spread (%)">
            <input className="field" inputMode="decimal" value={spread} onChange={(e) => setSpread(e.target.value)} placeholder="0,80" />
          </Field>
          <Field label="Euribor atual (%)">
            <input className="field" inputMode="decimal" value={initialEuribor} onChange={(e) => setInitialEuribor(e.target.value)} placeholder="2,00" />
          </Field>
          <Field label="Revisão">
            <select className="field" value={tenor} onChange={(e) => setTenor(Number(e.target.value) as EuriborTenor)}>
              <option value={3}>3 meses</option>
              <option value={6}>6 meses</option>
              <option value={12}>12 meses</option>
            </select>
          </Field>
        </div>
      )}
      {rateKind === 'mixed' && (
        <Field label="Meses em taxa fixa">
          <input className="field" inputMode="numeric" value={fixedPeriod} onChange={(e) => setFixedPeriod(e.target.value)} />
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Seguro de vida / mês">
          <input className="field" inputMode="decimal" value={life} onChange={(e) => setLife(e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="Multirriscos / mês">
          <input className="field" inputMode="decimal" value={home} onChange={(e) => setHome(e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="Carência (meses)" hint="Só juros, antes da amortização.">
          <input className="field" inputMode="numeric" value={grace} onChange={(e) => setGrace(e.target.value)} />
        </Field>
      </div>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" type="submit">{initial ? 'Guardar' : 'Criar'}</button>
        <button className="btn btn-ghost" type="button" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}
