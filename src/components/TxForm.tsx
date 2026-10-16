import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Field, Segmented } from './ui.tsx'
import { uid } from '../lib/id.ts'
import { todayISO } from '../lib/dates.ts'
import { formatNumber, parseAmount } from '../lib/money.ts'
import { useStore } from '../store.tsx'
import type { Transaction, TxType } from '../types.ts'

export function TxForm({ initial, onClose }: { initial?: Transaction; onClose: () => void }) {
  const { data, mutate } = useStore()
  const [type, setType] = useState<TxType>(initial?.type ?? 'expense')
  const [amount, setAmount] = useState(initial ? formatNumber(initial.amount) : '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [accountId, setAccountId] = useState(initial?.accountId ?? data.accounts[0]?.id ?? '')
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? '')
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [note, setNote] = useState(initial?.note ?? '')
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '')
  const [error, setError] = useState('')
  const [armDelete, setArmDelete] = useState(false)

  const cats = data.categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'))
  const selectedCat = categoryId || cats[0]?.id || ''

  function save() {
    const parsed = parseAmount(amount)
    if (!parsed || parsed <= 0) {
      setError('Indica um valor maior que zero.')
      return
    }
    if (!accountId) {
      setError('Escolhe uma conta.')
      return
    }
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) {
      setError('Escolhe uma conta de destino diferente.')
      return
    }
    const cat = type === 'transfer' ? null : selectedCat || null
    if (type !== 'transfer' && !cat) {
      setError('Cria uma categoria primeiro.')
      return
    }
    const tx: Transaction = {
      id: initial?.id ?? uid(),
      amount: parsed,
      type,
      categoryId: cat,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      date,
      note: note.trim(),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      recurringId: initial?.recurringId,
      loanPaymentId: initial?.loanPaymentId,
    }
    mutate((d) => {
      const i = d.transactions.findIndex((t) => t.id === tx.id)
      if (i >= 0) d.transactions[i] = tx
      else d.transactions.push(tx)
    })
    onClose()
  }

  function remove() {
    if (!initial) return
    if (!armDelete) {
      setArmDelete(true)
      return
    }
    mutate((d) => {
      d.transactions = d.transactions.filter((t) => t.id !== initial.id)
      if (initial.loanPaymentId) {
        for (const loan of d.loans) loan.payments = loan.payments.filter((p) => p.id !== initial.loanPaymentId && p.transactionId !== initial.id)
      }
    })
    onClose()
  }

  if (data.accounts.length === 0) {
    return (
      <p className="text-sm text-muted">
        Cria uma conta antes de registar movimentos. <Link to="/contas" onClick={onClose} className="text-accent">Ir para contas</Link>
      </p>
    )
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
        value={type}
        onChange={(next) => {
          setType(next)
          setCategoryId('')
        }}
        options={[
          { id: 'expense', label: 'Despesa' },
          { id: 'income', label: 'Receita' },
          { id: 'transfer', label: 'Transferência' },
        ]}
      />
      <Field label="Valor">
        <input className="field font-serif text-3xl" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
      </Field>
      {type !== 'transfer' && (
        <div className="min-w-0">
          <span className="label">Categoria</span>
          <div className="scroll-x flex gap-2 pb-1">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${selectedCat === c.id ? 'border-accent bg-accent text-accent-ink' : 'border-line'}`}
                onClick={() => setCategoryId(c.id)}
              >
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={type === 'transfer' ? 'De' : 'Conta'}>
          <select className="field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
        {type === 'transfer' ? (
          <Field label="Para">
            <select className="field" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Escolher</option>
              {data.accounts.filter((a) => a.id !== accountId).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Data">
            <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
        )}
      </div>
      {type === 'transfer' && (
        <Field label="Data">
          <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      )}
      <Field label="Nota">
        <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
      </Field>
      <Field label="Etiquetas" hint="Separadas por vírgulas">
        <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="casa, obras" />
      </Field>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" type="submit">{initial ? 'Guardar' : 'Adicionar'}</button>
        {initial && (
          <button className="btn btn-danger" type="button" onClick={remove}>{armDelete ? 'Confirmar' : 'Apagar'}</button>
        )}
      </div>
    </form>
  )
}
