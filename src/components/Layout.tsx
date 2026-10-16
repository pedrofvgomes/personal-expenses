import { useState } from 'react'
import { NavLink, Outlet, useOutletContext } from 'react-router-dom'
import { ArrowLeftRight, ChartPie, Landmark, LayoutDashboard, Moon, PiggyBank, Plus, Repeat, Settings, Sun, Wallet } from 'lucide-react'
import { Modal } from './ui.tsx'
import { TxForm } from './TxForm.tsx'
import Recovery from '../pages/Recovery.tsx'
import { useTheme } from '../theme.tsx'
import { useStore, type Sync } from '../store.tsx'
import type { Transaction } from '../types.ts'

export type Shell = { openTx: (tx?: Transaction) => void }

const primary = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/movimentos', label: 'Movimentos', icon: ArrowLeftRight, end: false },
  { to: '/credito', label: 'Crédito', icon: Landmark, end: false },
]

const more = [
  { to: '/orcamentos', label: 'Orçamentos', icon: ChartPie },
  { to: '/recorrentes', label: 'Recorrentes', icon: Repeat },
  { to: '/contas', label: 'Contas', icon: Wallet },
  { to: '/poupanca', label: 'Poupança', icon: PiggyBank },
  { to: '/definicoes', label: 'Definições', icon: Settings },
]

const all = [
  ...primary.slice(0, 2),
  { to: '/orcamentos', label: 'Orçamentos', icon: ChartPie, end: false },
  { to: '/recorrentes', label: 'Recorrentes', icon: Repeat, end: false },
  { to: '/contas', label: 'Contas', icon: Wallet, end: false },
  { to: '/poupanca', label: 'Poupança', icon: PiggyBank, end: false },
  primary[2],
  { to: '/definicoes', label: 'Definições', icon: Settings, end: false },
]

const syncLabel: Record<Sync, string> = {
  loading: 'A abrir',
  saving: 'A guardar…',
  saved: 'Guardado',
  offline: 'Só neste dispositivo',
  error: 'Falha ao guardar',
  conflict: 'Conflito',
}

export function useShell() {
  return useOutletContext<Shell>()
}

export default function Layout() {
  const { sync, syncError, resolveConflict, fatal } = useStore()
  const { dark, toggle } = useTheme()
  const [editing, setEditing] = useState<Transaction | null | undefined>(undefined)
  const [moreOpen, setMoreOpen] = useState(false)
  const openTx = (tx?: Transaction) => setEditing(tx ?? null)
  if (fatal) return <Recovery />

  return (
    <div className="min-h-dvh md:pl-64">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-sidebar px-4 py-6 md:flex">
        <div className="px-2">
          <p className="font-serif text-3xl tracking-tight">Despesas</p>
          <p className="text-sm text-muted">Pessoal</p>
        </div>
        <nav className="mt-8 grid gap-1">
          {all.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${isActive ? 'bg-card font-medium text-accent' : 'text-ink/80 hover:bg-card/70'}`}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="btn btn-primary mt-auto w-full" onClick={() => openTx()}>
          <Plus size={18} /> Novo movimento
        </button>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line/80 bg-bg/80 px-4 py-3 backdrop-blur md:px-8">
        <p className="font-serif text-xl md:hidden">Despesas</p>
        <p className={`ml-auto text-sm ${sync === 'error' || sync === 'conflict' ? 'text-bad' : 'text-muted'}`}>{syncLabel[sync]}</p>
        <button type="button" className="icon-btn" onClick={toggle} aria-label={dark ? 'Tema claro' : 'Tema escuro'}>
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-28 md:px-8 md:pb-12">
        {syncError && sync !== 'conflict' && (
          <p className="mb-4 text-sm text-bad">{syncError}</p>
        )}
        {sync === 'conflict' && (
          <div className="mb-4 rounded-2xl border border-line bg-card p-4">
            <p className="font-medium text-bad">Há alterações mais recentes noutro dispositivo.</p>
            <p className="mt-1 text-sm text-muted">Guardar agora substitui essa versão.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={() => resolveConflict('remote')}>Usar a outra versão</button>
              <button type="button" className="btn" onClick={() => resolveConflict('local')}>Ficar com esta</button>
            </div>
          </div>
        )}
        <Outlet context={{ openTx } satisfies Shell} />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-5 items-end px-1 pt-1">
          {primary.slice(0, 2).map((item) => (
            <Tab key={item.to} to={item.to} label={item.label} icon={item.icon} end={item.end} />
          ))}
          <button type="button" className="mx-auto -mt-5 mb-1 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-ink shadow-lg" aria-label="Novo movimento" onClick={() => openTx()}>
            <Plus />
          </button>
          <Tab to="/credito" label="Crédito" icon={Landmark} />
          <button type="button" className="flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] text-muted" onClick={() => setMoreOpen(true)}>
            <Settings size={18} />
            Mais
          </button>
        </div>
      </nav>

      {moreOpen && (
        <Modal title="Mais" onClose={() => setMoreOpen(false)}>
          <div className="grid gap-2">
            {more.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => setMoreOpen(false)} className="flex items-center gap-3 rounded-2xl border border-line px-3 py-3">
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}
          </div>
        </Modal>
      )}

      {editing !== undefined && (
        <Modal title={editing ? 'Editar movimento' : 'Novo movimento'} onClose={() => setEditing(undefined)}>
          <TxForm initial={editing ?? undefined} onClose={() => setEditing(undefined)} />
        </Modal>
      )}
    </div>
  )
}

function Tab({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Landmark; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] ${isActive ? 'text-accent' : 'text-muted'}`}>
      <Icon size={18} />
      {label}
    </NavLink>
  )
}
