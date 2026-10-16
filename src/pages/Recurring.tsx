import { useState } from 'react'
import { Empty, Field, Modal, PageHeader, Segmented } from '../components/ui.tsx'
import { dateInMonth, formatMonth } from '../lib/dates.ts'
import { uid } from '../lib/id.ts'
import { formatEUR, formatNumber, parseAmount } from '../lib/money.ts'
import { dueMonths } from '../lib/selectors.ts'
import { useStore } from '../store.tsx'
import type { Recurring } from '../types.ts'

export default function RecurringPage() {
  const { data, mutate } = useStore()
  const [editing, setEditing] = useState<Recurring | null | undefined>(undefined)

  function generate(rec: Recurring) {
    mutate((d) => {
      const item = d.recurring.find((r) => r.id === rec.id)
      if (!item) return
      const months = dueMonths(item, d)
      for (const ym of months) {
        if (d.transactions.some((t) => t.recurringId === item.id && t.date.startsWith(ym))) continue
        d.transactions.push({
          id: uid(),
          type: item.type,
          amount: item.amount,
          categoryId: item.categoryId,
          accountId: item.accountId,
          date: dateInMonth(ym, item.day),
          note: item.note,
          tags: ['recorrente'],
          recurringId: item.id,
        })
      }
      if (months.length) item.lastGenerated = months[months.length - 1]
    })
  }

  return (
    <div>
      <PageHeader title="Recorrentes" sub="Contas fixas, confirmadas com um toque." action={<button type="button" className="btn btn-primary" onClick={() => setEditing(null)}>Nova</button>} />
      {data.recurring.length === 0 ? (
        <Empty title="Nada se repete ainda" body="Renda, eletricidade, ginásio, subscrições." action={<button type="button" className="btn btn-primary" onClick={() => setEditing(null)}>Adicionar</button>} />
      ) : (
        <ul className="grid gap-3">
          {data.recurring.map((r) => {
            const cat = data.categories.find((c) => c.id === r.categoryId)
            const due = dueMonths(r, data)
            return (
              <li key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(r)}>
                  <p className="font-medium">{cat?.emoji} {r.note || cat?.name}</p>
                  <p className="text-sm text-muted">Dia {r.day} · {formatEUR(r.amount)} · {r.active ? 'ativa' : 'pausada'}</p>
                </button>
                {due.length > 0 && (
                  <button type="button" className="btn btn-primary" onClick={() => generate(r)}>
                    Gerar {due.length > 1 ? `${due.length} meses` : formatMonth(due[0])}
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
  const [day, setDay] = useState(String(initial?.day ?? 1))
  const [note, setNote] = useState(initial?.note ?? '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [error, setError] = useState('')
  const cats = data.categories.filter((c) => c.kind === type)

  function save() {
    const parsed = parseAmount(amount)
    const dayN = Number(day)
    if (!parsed) return setError('Indica o valor.')
    if (!Number.isInteger(dayN) || dayN < 1 || dayN > 31) return setError('O dia fica entre 1 e 31.')
    const cat = categoryId || cats[0]?.id
    if (!cat || !accountId) return setError('Falta a categoria ou a conta.')
    const item: Recurring = {
      id: initial?.id ?? uid(),
      amount: parsed,
      type,
      categoryId: cat,
      accountId,
      note: note.trim(),
      day: dayN,
      active,
      lastGenerated: initial?.lastGenerated ?? null,
    }
    mutate((d) => {
      const i = d.recurring.findIndex((r) => r.id === item.id)
      if (i >= 0) d.recurring[i] = item
      else d.recurring.push(item)
    })
    onClose()
  }

  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save() }}>
      <Segmented value={type} onChange={(next) => { setType(next); setCategoryId('') }} options={[{ id: 'expense', label: 'Despesa' }, { id: 'income', label: 'Receita' }]} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Valor"><input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Dia do mês"><input className="field" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
      </div>
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
