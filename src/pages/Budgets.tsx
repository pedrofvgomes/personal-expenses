import { useState } from 'react'
import { Meter, MonthSwitch, PageHeader } from '../components/ui.tsx'
import { thisMonth } from '../lib/dates.ts'
import { uid } from '../lib/id.ts'
import { categorySpent } from '../lib/selectors.ts'
import { formatEUR, formatNumber, parseAmount } from '../lib/money.ts'
import { useStore } from '../store.tsx'
import type { Category } from '../types.ts'

export default function Budgets() {
  const { data, mutate } = useStore()
  const [month, setMonth] = useState(thisMonth())
  const cats = data.categories.filter((c) => c.kind === 'expense')

  function save(category: Category, text: string) {
    const parsed = text.trim() === '' ? 0 : parseAmount(text)
    if (parsed === null) return
    mutate((d) => {
      d.budgets = d.budgets.filter((b) => b.categoryId !== category.id)
      if (parsed > 0) d.budgets.push({ id: uid(), categoryId: category.id, limit: parsed })
    })
  }

  return (
    <div>
      <PageHeader title="Orçamentos" sub="Um limite mensal por categoria." action={<MonthSwitch value={month} onChange={setMonth} />} />
      <ul className="grid gap-3">
        {cats.map((c) => {
          const limit = data.budgets.find((b) => b.categoryId === c.id)?.limit ?? 0
          const spent = categorySpent(data, c.id, month)
          return <BudgetRow key={c.id} emoji={c.emoji} name={c.name} spent={spent} limit={limit} onSave={(text) => save(c, text)} />
        })}
      </ul>
    </div>
  )
}

function BudgetRow({ emoji, name, spent, limit, onSave }: { emoji: string; name: string; spent: number; limit: number; onSave: (text: string) => void }) {
  const [text, setText] = useState(limit ? formatNumber(limit) : '')
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{emoji} {name}</p>
          <p className={`mt-1 text-sm ${limit && spent > limit ? 'text-bad' : 'text-muted'}`}>
            {formatEUR(spent)}{limit ? ` de ${formatEUR(limit)}` : ' sem limite'}
          </p>
        </div>
        <label className="w-36">
          <span className="sr-only">Limite de {name}</span>
          <input
            className="field"
            inputMode="decimal"
            placeholder="Limite"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              const parsed = text.trim() === '' ? 0 : parseAmount(text)
              if (parsed === null) {
                setText(limit ? formatNumber(limit) : '')
                return
              }
              onSave(text.trim() === '' ? '' : text)
              setText(parsed ? formatNumber(parsed) : '')
            }}
          />
        </label>
      </div>
      {limit > 0 && <div className="mt-3"><Meter value={spent} max={limit} /></div>}
    </li>
  )
}
