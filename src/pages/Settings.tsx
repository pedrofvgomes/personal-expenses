import { useState } from 'react'
import type { FormEvent } from 'react'
import { Download, Upload } from 'lucide-react'
import { Field, PageHeader } from '../components/ui.tsx'
import { downloadText } from '../lib/csv.ts'
import { isAppData, normalize } from '../lib/defaults.ts'
import { uid } from '../lib/id.ts'
import { todayISO } from '../lib/dates.ts'
import { PALETTES } from '../lib/palette.ts'
import { useStore } from '../store.tsx'
import { useTheme } from '../theme.tsx'
import type { Category, CategoryKind } from '../types.ts'

export default function Settings() {
  const { data, mutate, replace, logout, canInvite, canChangePassword, createUser, changePassword } = useStore()
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
        <h3 className="mt-5 text-sm font-medium">Paleta</h3>
        <p className="mt-1 text-sm text-muted">Só neste livro. A outra palavra-passe não a vê.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PALETTES.map((palette) => {
            const on = data.palette === palette.id
            return (
              <button
                key={palette.id}
                type="button"
                aria-pressed={on}
                className={`rounded-2xl border px-3 py-2 text-left text-sm ${on ? 'border-accent' : 'border-line'}`}
                onClick={() => {
                  if (on) return
                  mutate((draft) => {
                    draft.palette = palette.id
                  })
                }}
              >
                <span className="flex gap-1">
                  {palette.swatches.map((color) => (
                    <span key={color} className="h-4 w-4 rounded-full border border-line" style={{ background: color }} />
                  ))}
                </span>
                <span className="mt-1 block">{palette.name}</span>
              </button>
            )
          })}
        </div>
      </section>

      {canInvite && (
        <PasswordForm
          title="Novo utilizador"
          copy="Só tu podes criar. Defines a palavra-passe inicial; a pessoa muda-a depois, em Definições. O livro dela é novo, por isso os dados que já existem ficam como estão. Depois da primeira pessoa, publica o site uma vez para ela entrar noutro dispositivo."
          submitLabel="Criar utilizador"
          doneText="Utilizador criado. Neste dispositivo já pode entrar. Noutro, só depois de publicares o site uma vez."
          onSubmit={createUser}
        />
      )}
      {canChangePassword && (
        <PasswordForm
          title="Palavra-passe"
          copy="A nova palavra-passe passa a abrir o teu livro. Onde já entraste, a sessão continua até saíres."
          submitLabel="Mudar palavra-passe"
          doneText="Palavra-passe mudada."
          onSubmit={changePassword}
        />
      )}

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

function passwordMessage(err: unknown): string {
  const code = err instanceof Error ? err.message : ''
  if (code === 'taken') return 'Essa palavra-passe já abre outro livro. Escolhe outra.'
  if (code === 'busy') return 'Espera que os dados fiquem guardados.'
  if (code === 'password') return 'Escreve uma palavra-passe.'
  return 'Não consegui guardar. Tenta outra vez.'
}

function PasswordForm({ title, copy, submitLabel, doneText, onSubmit }: {
  title: string
  copy: string
  submitLabel: string
  doneText: string
  onSubmit: (password: string) => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const typed = password.trim()
    if (!typed || typed !== again.trim()) {
      setDone('')
      setError(typed ? 'As duas palavras-passe não coincidem.' : 'Escreve uma palavra-passe.')
      return
    }
    setBusy(true)
    setError('')
    setDone('')
    try {
      await onSubmit(typed)
      setPassword('')
      setAgain('')
      setDone(doneText)
    } catch (err) {
      setError(passwordMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card mt-4 p-4">
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1 text-sm text-muted">{copy}</p>
      <form className="mt-3 grid gap-3" onSubmit={(event) => void submit(event)}>
        <Field label="Palavra-passe">
          <input className="field" type="password" autoComplete="new-password" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={password} onChange={(event) => setPassword(event.target.value)} />
        </Field>
        <Field label="Repetir">
          <input className="field" type="password" autoComplete="new-password" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={again} onChange={(event) => setAgain(event.target.value)} />
        </Field>
        {error && <p className="text-sm text-bad">{error}</p>}
        {done && <p className="text-sm text-muted">{done}</p>}
        <button className="btn btn-primary w-fit" type="submit" disabled={busy}>{busy ? 'A guardar…' : submitLabel}</button>
      </form>
    </section>
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
