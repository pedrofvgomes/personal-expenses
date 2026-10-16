import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { isVault } from '../lib/crypto.ts'
import { loadVault, unlock, type Session } from '../lib/auth.ts'

export default function Login({ onUnlock }: { onUnlock: (session: Session) => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    loadVault().then((vault) => setConfigured(isVault(vault)))
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const typed = new FormData(event.currentTarget).get('password')
    const value = (typeof typed === 'string' ? typed : password).trim()
    setBusy(true)
    setError('')
    try {
      onUnlock(await unlock(value))
    } catch (err) {
      setError(err instanceof Error && err.message === 'unconfigured' ? 'O cofre ainda não está configurado.' : 'Palavra-passe incorreta. Usa exatamente o valor de APP_PASSWORD.')
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <p className="font-serif text-5xl tracking-tight">Despesas</p>
        <p className="mt-2 text-muted">A casa, o dia a dia, o crédito.</p>
        {configured === false ? (
          <div className="card mt-8 p-5 text-sm leading-6">
            <p className="font-medium">Ainda não há cofre.</p>
            <p className="mt-2 text-muted">Cria um <code>.env.local</code> com <code>APP_PASSWORD</code>, <code>GIST_TOKEN</code> e <code>GIST_ID</code>, e reinicia o <code>npm run dev</code>. No GitHub, os mesmos valores são secrets da Action.</p>
          </div>
        ) : (
          <form className="card mt-8 grid gap-4 p-5" onSubmit={submit}>
            <label>
              <span className="label">Palavra-passe</span>
              <input
                className="field"
                type="password"
                name="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <p className="text-xs text-muted">Os dados ficam cifrados. Sem esta palavra-passe não há acesso.</p>
            {error && <p className="text-sm text-bad" role="alert">{error}</p>}
            <button className="btn btn-primary" type="submit" disabled={busy || configured === null}>
              {busy ? 'A verificar…' : 'Entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
