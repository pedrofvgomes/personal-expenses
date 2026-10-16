import { useState } from 'react'
import { Empty, Field, Meter, Modal, PageHeader } from '../components/ui.tsx'
import { uid } from '../lib/id.ts'
import { formatEUR, formatNumber, parseAmount, round2 } from '../lib/money.ts'
import { useStore } from '../store.tsx'
import type { Goal } from '../types.ts'

export default function Goals() {
  const { data } = useStore()
  const [editing, setEditing] = useState<Goal | null | undefined>(undefined)
  const [adding, setAdding] = useState<Goal | null>(null)

  return (
    <div>
      <PageHeader title="Poupança" sub="Metas à parte dos movimentos do dia a dia." action={<button type="button" className="btn btn-primary" onClick={() => setEditing(null)}>Nova meta</button>} />
      {data.goals.length === 0 ? (
        <Empty title="Nenhuma meta" body="Fundo de emergência, férias, obras." action={<button type="button" className="btn btn-primary" onClick={() => setEditing(null)}>Criar</button>} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.goals.map((g) => (
            <li key={g.id} className="card p-4">
              <button type="button" className="w-full text-left" onClick={() => setEditing(g)}>
                <p className="text-2xl">{g.emoji}</p>
                <p className="mt-2 font-medium">{g.name}</p>
                <p className="amount mt-1 text-sm text-muted">{formatEUR(g.saved)} de {formatEUR(g.target)}</p>
              </button>
              <div className="mt-3"><Meter value={g.saved} max={g.target || 1} /></div>
              <button type="button" className="btn mt-3" onClick={() => setAdding(g)}>Juntar</button>
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined && (
        <Modal title={editing ? 'Editar meta' : 'Nova meta'} onClose={() => setEditing(undefined)}>
          <GoalForm initial={editing ?? undefined} onClose={() => setEditing(undefined)} />
        </Modal>
      )}
      {adding && (
        <Modal title={`Juntar a ${adding.name}`} onClose={() => setAdding(null)}>
          <Contribute goal={adding} onClose={() => setAdding(null)} />
        </Modal>
      )}
    </div>
  )
}

function GoalForm({ initial, onClose }: { initial?: Goal; onClose: () => void }) {
  const { mutate } = useStore()
  const [name, setName] = useState(initial?.name ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '🎯')
  const [target, setTarget] = useState(initial ? formatNumber(initial.target) : '')
  const [saved, setSaved] = useState(initial ? formatNumber(initial.saved) : '')
  const [error, setError] = useState('')

  function save() {
    const targetN = parseAmount(target)
    const savedN = parseAmount(saved || '0')
    if (!name.trim()) return setError('Dá um nome à meta.')
    if (!targetN) return setError('Indica o objetivo.')
    if (savedN === null) return setError('O valor juntado não é válido.')
    const goal: Goal = { id: initial?.id ?? uid(), name: name.trim(), emoji: emoji.trim() || '🎯', target: targetN, saved: savedN }
    mutate((d) => {
      const i = d.goals.findIndex((g) => g.id === goal.id)
      if (i >= 0) d.goals[i] = goal
      else d.goals.push(goal)
    })
    onClose()
  }

  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); save() }}>
      <div className="grid grid-cols-[5rem_1fr] gap-3">
        <Field label="Ícone"><input className="field text-center" value={emoji} onChange={(e) => setEmoji(e.target.value)} /></Field>
        <Field label="Nome"><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <Field label="Objetivo"><input className="field" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
      <Field label="Já juntado"><input className="field" inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} /></Field>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" type="submit">Guardar</button>
        {initial && (
          <button className="btn btn-danger" type="button" onClick={() => { mutate((d) => { d.goals = d.goals.filter((g) => g.id !== initial.id) }); onClose() }}>Apagar</button>
        )}
      </div>
    </form>
  )
}

function Contribute({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { mutate } = useStore()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  function add(sign: 1 | -1) {
    const parsed = parseAmount(amount)
    if (!parsed) return setError('Indica um valor.')
    mutate((d) => {
      const item = d.goals.find((g) => g.id === goal.id)
      if (!item) return
      item.saved = round2(Math.max(0, item.saved + sign * parsed))
    })
    onClose()
  }

  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); add(1) }}>
      <Field label="Valor"><input className="field font-serif text-3xl" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" type="submit">Juntar</button>
        <button className="btn" type="button" onClick={() => add(-1)}>Retirar</button>
      </div>
    </form>
  )
}
