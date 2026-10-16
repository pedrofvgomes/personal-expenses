import { useState } from 'react'
import { Empty, Field, Modal, PageHeader } from '../components/ui.tsx'
import { accountLabel } from '../lib/defaults.ts'
import { uid } from '../lib/id.ts'
import { formatEUR, formatNumber, parseAmount } from '../lib/money.ts'
import { accountBalance } from '../lib/selectors.ts'
import { useStore } from '../store.tsx'
import type { Account, AccountType } from '../types.ts'

export default function Accounts() {
  const { data } = useStore()
  const [editing, setEditing] = useState<Account | null | undefined>(undefined)
  const total = data.accounts.reduce((s, a) => s + accountBalance(data, a.id), 0)

  return (
    <div>
      <PageHeader title="Contas" sub={`Disponível ${formatEUR(total)}`} action={<button type="button" className="btn btn-primary" onClick={() => setEditing(null)}>Nova conta</button>} />
      {data.accounts.length === 0 ? (
        <Empty title="Sem contas" body="À ordem, poupança ou dinheiro." action={<button type="button" className="btn btn-primary" onClick={() => setEditing(null)}>Criar</button>} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.accounts.map((a) => (
            <li key={a.id}>
              <button type="button" className="card w-full p-4 text-left" onClick={() => setEditing(a)}>
                <p className="text-sm text-muted">{accountLabel(a.type)}</p>
                <p className="mt-1 font-medium">{a.name}</p>
                <p className="amount mt-2 font-serif text-3xl">{formatEUR(accountBalance(data, a.id))}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined && (
        <Modal title={editing ? 'Editar conta' : 'Nova conta'} onClose={() => setEditing(undefined)}>
          <AccountForm initial={editing ?? undefined} onClose={() => setEditing(undefined)} />
        </Modal>
      )}
    </div>
  )
}

function AccountForm({ initial, onClose }: { initial?: Account; onClose: () => void }) {
  const { data, mutate } = useStore()
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<AccountType>(initial?.type ?? 'checking')
  const [opening, setOpening] = useState(initial ? formatNumber(initial.openingBalance) : '')
  const [error, setError] = useState('')
  const used = initial ? data.transactions.some((t) => t.accountId === initial.id || t.toAccountId === initial.id) : false

  function save() {
    if (!name.trim()) return setError('Dá um nome à conta.')
    const openingBalance = parseAmount(opening || '0')
    if (openingBalance === null) return setError('O saldo inicial não é válido.')
    const account: Account = { id: initial?.id ?? uid(), name: name.trim(), type, openingBalance }
    mutate((d) => {
      const i = d.accounts.findIndex((a) => a.id === account.id)
      if (i >= 0) d.accounts[i] = account
      else d.accounts.push(account)
    })
    onClose()
  }

  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save() }}>
      <Field label="Nome"><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Tipo">
        <select className="field" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
          <option value="checking">Conta à ordem</option>
          <option value="savings">Poupança</option>
          <option value="cash">Dinheiro</option>
          <option value="other">Outra</option>
        </select>
      </Field>
      <Field label="Saldo inicial" hint="Antes do primeiro movimento registado.">
        <input className="field" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" type="submit">Guardar</button>
        {initial && (
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => {
              if (used) {
                setError('Esta conta tem movimentos. Apaga-os primeiro.')
                return
              }
              mutate((d) => { d.accounts = d.accounts.filter((a) => a.id !== initial.id) })
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
