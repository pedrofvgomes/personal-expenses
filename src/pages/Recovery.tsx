import { useState } from 'react'
import { isAppData, normalize } from '../lib/defaults.ts'
import { useStore } from '../store.tsx'

export default function Recovery() {
  const { fatal, hadLocal, keepLocal, startOver, logout, replace } = useStore()
  const [error, setError] = useState('')
  const [arm, setArm] = useState(false)

  async function onFile(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isAppData(parsed)) {
        setError('Este ficheiro não é um backup desta app.')
        return
      }
      replace(normalize(parsed), true)
    } catch {
      setError('Não consegui ler o ficheiro.')
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="card w-full max-w-lg p-6">
        <p className="font-serif text-3xl">Não abri os dados</p>
        <p className="mt-3 text-sm leading-6 text-muted">{fatal}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {hadLocal && (
            <button type="button" className="btn btn-primary" onClick={keepLocal}>Usar a cópia deste dispositivo</button>
          )}
          <label className="btn cursor-pointer">
            Importar backup
            <input
              className="sr-only"
              type="file"
              accept="application/json"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onFile(file)
              }}
            />
          </label>
          <button type="button" className="btn btn-danger" onClick={() => (arm ? startOver() : setArm(true))}>
            {arm ? 'Confirmar e começar de novo' : 'Começar de novo'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={logout}>Sair</button>
        </div>
        {arm && <p className="mt-3 text-sm text-bad">Isto substitui o que está no gist por um livro vazio.</p>}
        {error && <p className="mt-3 text-sm text-bad" role="alert">{error}</p>}
      </div>
    </div>
  )
}
