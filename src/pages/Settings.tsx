import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { Field, PageHeader } from '../components/ui.tsx'
import { downloadText } from '../lib/csv.ts'
import { isAppData, normalize } from '../lib/defaults.ts'
import { uid } from '../lib/id.ts'
import { todayISO } from '../lib/dates.ts'
import { useStore } from '../store.tsx'
import { useTheme } from '../theme.tsx'
import type { Category, CategoryKind } from '../types.ts'

export default function Settings() {
  const { data, replace, logout } = useStore()
  const { dark, toggle } = useTheme()
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<Category | null>(null)

  async function onImport(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isAppData(parsed)) {
        setNotice('Ficheiro inválido.')
        return
      }
      if (!confirm('Isto substitui todos os dados neste dispositivo e na nuvem.')) return
      replace(normalize(parsed))
      setNotice('Backup importado.')
    } catch {
      setNotice('Não consegui ler o ficheiro.')
    }
  }

  return (
    <div>
      <PageHeader title="Definições" />
      <section className="card p-4">
        <h2 className="font-medium">Tema</h2>
        <button type="button" className="btn mt-3" onClick={toggle}>{dark ? 'Usar tema claro' : 'Usar tema escuro'}</button>
      </section>

      <section className="card mt-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium">Categorias</h2>
          <button type="button" className="btn" onClick={() => setEditing({ id: '', name: '', emoji: '🏷️', color: '#0f6e6b', kind: 'expense' })}>Nova</button>
        </div>
        <ul className="mt-3 divide-y divide-line">
          {data.categories.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2">
              <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
              <button type="button" className="flex-1 text-left" onClick={() => setEditing(c)}>{c.emoji} {c.name}</button>
              <span className="text-xs text-muted">{c.kind === 'expense' ? 'despesa' : 'receita'}</span>
            </li>
          ))}
        </ul>
        {editing && <CategoryForm category={editing} onClose={() => setEditing(null)} />}
      </section>

      <section className="card mt-4 p-4">
        <h2 className="font-medium">Cópia de segurança</h2>
        <p className="mt-1 text-sm text-muted">Um ficheiro JSON com tudo, incluindo os créditos. Guarda-o antes de mudares a palavra-passe.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => downloadText(`despesas-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json')}>
            <Download size={16} /> Exportar
          </button>
          <label className="btn cursor-pointer">
            <Upload size={16} /> Importar
            <input className="sr-only" type="file" accept="application/json" onChange={(e) => { const file = e.target.files?.[0]; if (file) void onImport(file); e.target.value = '' }} />
          </label>
        </div>
        {notice && <p className="mt-3 text-sm text-muted">{notice}</p>}
      </section>

      <section className="card mt-4 p-4">
        <h2 className="font-medium">Sessão</h2>
        <p className="mt-1 text-sm text-muted">Sair esquece a chave neste dispositivo. Os dados cifrados mantêm-se.</p>
        <button type="button" className="btn mt-3" onClick={logout}>Sair</button>
      </section>
    </div>
  )
}

function CategoryForm({ category, onClose }: { category: Category; onClose: () => void }) {
  const { data, mutate } = useStore()
  const creating = !category.id
  const [name, setName] = useState(category.name)
  const [emoji, setEmoji] = useState(category.emoji)
  const [color, setColor] = useState(category.color)
  const [kind, setKind] = useState<CategoryKind>(category.kind)
  const [error, setError] = useState('')
  const used = !creating && data.transactions.some((t) => t.categoryId === category.id)

  function save() {
    if (!name.trim()) return setError('Dá um nome à categoria.')
    const next: Category = { id: category.id || uid(), name: name.trim(), emoji: emoji.trim() || '🏷️', color, kind }
    mutate((d) => {
      const i = d.categories.findIndex((c) => c.id === next.id)
      if (i >= 0) d.categories[i] = next
      else d.categories.push(next)
    })
    onClose()
  }

  return (
    <form className="mt-4 grid gap-3 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); save() }}>
      <div className="grid grid-cols-[4.5rem_1fr_4.5rem] gap-2">
        <Field label="Ícone"><input className="field text-center" value={emoji} onChange={(e) => setEmoji(e.target.value)} /></Field>
        <Field label="Nome"><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Cor"><input className="field h-11 p-1" type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
      </div>
      <Field label="Tipo">
        <select className="field" value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)}>
          <option value="expense">Despesa</option>
          <option value="income">Receita</option>
        </select>
      </Field>
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" type="submit">Guardar</button>
        <button className="btn btn-ghost" type="button" onClick={onClose}>Fechar</button>
        {!creating && (
          <button
            className="btn btn-danger"
            type="button"
            onClick={() => {
              if (used) {
                setError('Esta categoria tem movimentos.')
                return
              }
              mutate((d) => {
                d.categories = d.categories.filter((c) => c.id !== category.id)
                d.budgets = d.budgets.filter((b) => b.categoryId !== category.id)
              })
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
