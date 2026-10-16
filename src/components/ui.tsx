import { useEffect, useId } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { formatMonth } from '../lib/dates.ts'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0 bg-[#1c1917]/45" aria-label="Fechar" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[92dvh] w-full min-w-0 max-w-lg overflow-x-hidden overflow-y-auto rounded-t-3xl border border-line bg-card p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-serif text-2xl">
            {title}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (id: T) => void }) {
  return (
    <div className="grid w-full min-w-0 gap-1 rounded-2xl bg-bg p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={cx('min-w-0 truncate rounded-xl px-2 py-2 text-sm', value === option.id ? 'bg-card font-medium shadow-sm' : 'text-muted')}
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Meter({ value, max }: { value: number; max: number }) {
  const over = max > 0 && value > max
  const pct = max <= 0 ? 0 : Math.min(100, (value / max) * 100)
  return (
    <div className="h-2 overflow-hidden rounded-full bg-line" role="meter" aria-valuenow={Math.round(value)} aria-valuemax={Math.round(max)}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? 'var(--bad)' : 'var(--accent)' }} />
    </div>
  )
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card border-dashed px-5 py-10 text-center">
      <p className="font-serif text-2xl">{title}</p>
      {body && <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function MonthSwitch({ value, onChange }: { value: string; onChange: (ym: string) => void }) {
  const [y, m] = value.split('-').map(Number)
  function shift(delta: number) {
    const d = new Date(y, m - 1 + delta, 1)
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-1 py-1">
      <button type="button" className="icon-btn" aria-label="Mês anterior" onClick={() => shift(-1)}>
        ‹
      </button>
      <span className="min-w-44 text-center text-sm font-medium">{formatMonth(value)}</span>
      <button type="button" className="icon-btn" aria-label="Mês seguinte" onClick={() => shift(1)}>
        ›
      </button>
    </div>
  )
}
