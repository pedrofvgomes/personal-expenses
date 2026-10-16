import { useState } from 'react'
import { Empty, Field, Modal, PageHeader, Segmented } from '../components/ui.tsx'
import { formatDate, todayISO } from '../lib/dates.ts'
import { uid } from '../lib/id.ts'
import { formatEUR, formatNumber, parseAmount } from '../lib/money.ts'
import { dueDates, materializeRecurring, nextOccurrence, scheduleLabel } from '../lib/selectors.ts'
import { useStore } from '../store.tsx'
import type { Recurring, RecurUnit } from '../types.ts'

export default function RecurringPage() {
  const { data, mutate } = useStore()
  const [editing, setEditing] = useState<Recurring | null | undefined>(undefined)

  function generate(rec: Recurring) {
    mutate((d) => {
      const item = d.recurring.find((r) => r.id === rec.id)
      if (item) materializeRecurring(d, item)
    })
  }

  return (
    <div>
      <PageHeader title="Recorrentes" sub="Repetem-se ao ritmo que escolheres. Confirmas com um toque." action={<button type="button" className="btn btn-primary" onClick={() => setEditing(null)}>Nova</button>} />
      {data.recurring.length === 0 ? (
        <Empty title="Nada se repete ainda" body="Semanal, de duas em duas semanas, mensal, anual, ou de tantos em tantos dias." action={<button type="button" className="btn btn-primary" onClick={() => setEditing(null)}>Adicionar</button>} />
      ) : (
        <ul className="grid gap-3">
          {data.recurring.map((r) => {
            const cat = data.categories.find((c) => c.id === r.categoryId)
            const due = dueDates(r, data)
            return (
              <li key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(r)}>
                  <p className="font-medium">{cat?.emoji} {r.note || cat?.name}</p>
                  <p className="text-sm text-muted">{scheduleLabel(r)} · {formatEUR(r.amount)} · {r.active ? 'ativa' : 'pausada'}</p>
                  {r.active && (
                    <p className="text-sm text-muted">{due.length ? `Por confirmar · ${formatDate(due[0])}` : `Próxima · ${formatDate(nextOccurrence(r, data))}`}</p>
                  )}
                </button>
                {due.length > 0 && (
                  <button type="button" className="btn btn-primary" onClick={() => generate(r)}>
                    Gerar{due.length > 1 ? ` ${due.length}` : ''}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {editing !== undefined && (
        <Modal title={editing ? 'Editar recorrente' : 'Nova recorrente'} onClose={() => setEditing(undefined)}>
          <RecurringForm initial={editing ?? undefined} onClose={() => setEditing(undefined)} />
        </Modal>
      )}
    </div>
  )
}

function RecurringForm({ initial, onClose }: { initial?: Recurring; onClose: () => void }) {
  const { data, mutate } = useStore()
  const [type, setType] = useState<'expense' | 'income'>(initial?.type ?? 'expense')
  const [amount, setAmount] = useState(initial ? formatNumber(initial.amount) : '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [accountId, setAccountId] = useState(initial?.accountId ?? data.accounts[0]?.id ?? '')
  const [every, setEvery] = useState(String(initial?.every ?? 1))
  const [unit, setUnit] = useState<RecurUnit>(initial?.unit ?? 'month')
  const [start, setStart] = useState(initial?.start ?? todayISO())
  const [note, setNote] = useState(initial?.note ?? '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [error, setError] = useState('')
  const cats = data.categories.filter((c) => c.kind === type)
  const everyN = Number(every)
  const unitWord = (one: string, many: string) => (everyN === 1 ? one : many)

  function save() {
    const parsed = parseAmount(amount)
    if (!parsed) return setError('Indica o valor.')
    if (!Number.isInteger(everyN) || everyN < 1 || everyN > 999) return setError('A repetição fica entre 1 e 999.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return setError('Indica a data de início.')
    const cat = categoryId || cats[0]?.id
    if (!cat || !accountId) return setError('Falta a categoria ou a conta.')
    const item: Recurring = {
      id: initial?.id ?? uid(),
      amount: parsed,
      type,
      categoryId: cat,
      accountId,
      note: note.trim(),
      start,
      every: everyN,
      unit,
      active,
    }
    mutate((d) => {
      const i = d.recurring.findIndex((r) => r.id === item.id)
      if (i >= 0) d.recurring[i] = item
      else d.recurring.push(item)
    })
    onClose()
  }

  return (
    <form className="grid min-w-0 gap-4" onSubmit={(e) => { e.preventDefault(); save() }}>
      <Segmented value={type} onChange={(next) => { setType(next); setCategoryId('') }} options={[{ id: 'expense', label: 'Despesa' }, { id: 'income', label: 'Receita' }]} />
      <Field label="Valor"><input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <div className="grid min-w-0 grid-cols-2 gap-3">
        <label className="block min-w-0">
          <span className="label">A cada</span>
          <input className="field" inputMode="numeric" value={every} onChange={(e) => setEvery(e.target.value)} />
        </label>
        <label className="block min-w-0">
          <span className="label">Unidade</span>
          <select className="field" value={unit} onChange={(e) => setUnit(e.target.value as RecurUnit)}>
            <option value="day">{unitWord('dia', 'dias')}</option>
            <option value="week">{unitWord('semana', 'semanas')}</option>
            <option value="month">{unitWord('mês', 'meses')}</option>
            <option value="year">{unitWord('ano', 'anos')}</option>
          </select>
        </label>
      </div>
      <Field label="A partir de"><input className="field" type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
      <Field label="Categoria">
        <select className="field" value={categoryId || cats[0]?.id || ''} onChange={(e) => setCategoryId(e.target.value)}>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </select>
      </Field>
      <Field label="Conta">
        <select className="field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Nota"><input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Renda, Netflix…" /></Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ativa
      </label>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" type="submit">Guardar</button>
        {initial && (
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => {
              mutate((d) => { d.recurring = d.recurring.filter((r) => r.id !== initial.id) })
              onClose()
            }}
          >
            Apagar
          </button>
        )}
      </div>
    </form>
  )
}
