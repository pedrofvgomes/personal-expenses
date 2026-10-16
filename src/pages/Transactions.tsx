import { useMemo, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { useShell } from '../components/Layout.tsx'
import { Empty, MonthSwitch, PageHeader } from '../components/ui.tsx'
import { downloadText, importCsv, transactionsToCsv } from '../lib/csv.ts'
import { formatDayHeading, thisMonth } from '../lib/dates.ts'
import { formatEUR } from '../lib/money.ts'
import { useStore } from '../store.tsx'
import type { Transaction } from '../types.ts'

export default function Transactions() {
  const { data, mutate } = useStore()
  const { openTx } = useShell()
  const [month, setMonth] = useState(thisMonth())
  const [all, setAll] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.transactions
      .filter((tx) => {
        if (!all && !tx.date.startsWith(month)) return false
        if (categoryId && tx.categoryId !== categoryId) return false
        if (accountId && tx.accountId !== accountId && tx.toAccountId !== accountId) return false
        if (!q) return true
        const cat = data.categories.find((c) => c.id === tx.categoryId)?.name ?? ''
        const acc = data.accounts.find((a) => a.id === tx.accountId)?.name ?? ''
        return `${tx.note} ${tx.amount} ${cat} ${acc} ${tx.tags.join(' ')}`.toLowerCase().includes(q)
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  }, [accountId, all, categoryId, data, month, query])

  const groups = new Map<string, Transaction[]>()
  for (const tx of filtered) {
    const list = groups.get(tx.date) ?? []
    list.push(tx)
    groups.set(tx.date, list)
  }

  async function onImport(file: File) {
    const result = importCsv(await file.text(), data)
    if (result.transactions.length === 0) {
      setNotice(result.skipped ? 'Nenhuma linha nova. Confirma o cabeçalho: data;tipo;valor;categoria;conta;conta_destino;nota;etiquetas.' : 'O ficheiro não tem movimentos.')
      return
    }
    mutate((d) => {
      d.categories.push(...result.categories)
      d.transactions.push(...result.transactions)
    })
    setNotice(`Importei ${result.transactions.length} movimentos${result.skipped ? ` e saltei ${result.skipped}` : ''}.`)
  }

  return (
    <div>
      <PageHeader
        title="Movimentos"
        sub={all ? `${filtered.length} movimentos` : `${filtered.length} neste mês`}
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => downloadText(`movimentos-${month}.csv`, transactionsToCsv(data), 'text/csv;charset=utf-8')}>
              <Download size={16} /> CSV
            </button>
            <label className="btn cursor-pointer">
              <Upload size={16} /> Importar
              <input className="sr-only" type="file" accept=".csv,text/csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) void onImport(file); e.target.value = '' }} />
            </label>
            <button type="button" className="btn btn-primary hidden md:inline-flex" onClick={() => openTx()}>Novo</button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!all && <MonthSwitch value={month} onChange={setMonth} />}
        <button type="button" className="btn" onClick={() => setAll((v) => !v)} aria-pressed={all}>{all ? 'Filtrar por mês' : 'Todo o período'}</button>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar" aria-label="Pesquisar" />
        <select className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {data.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </select>
        <select className="field" value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Conta">
          <option value="">Todas as contas</option>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      {notice && <p className="mb-3 text-sm text-muted">{notice}</p>}
      {filtered.length === 0 ? (
        <Empty title="Nada por aqui" body="Muda o mês ou regista um movimento." />
      ) : (
        <div className="grid gap-4">
          {[...groups.entries()].map(([date, txs]) => (
            <section key={date}>
              <h2 className="mb-1 text-sm font-medium text-muted">{formatDayHeading(date)}</h2>
              <div className="card divide-y divide-line px-3">
                {txs.map((tx) => {
                  const cat = data.categories.find((c) => c.id === tx.categoryId)
                  const acc = data.accounts.find((a) => a.id === tx.accountId)
                  const dest = data.accounts.find((a) => a.id === tx.toAccountId)
                  const sign = tx.type === 'expense' ? '−' : tx.type === 'income' ? '+' : ''
                  return (
                    <button key={tx.id} type="button" onClick={() => openTx(tx)} className="flex w-full items-center gap-3 py-3 text-left">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-lg" style={{ background: `${cat?.color ?? '#a8a29e'}22` }}>{cat?.emoji ?? '↔'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{tx.note || cat?.name || 'Transferência'}</span>
                        <span className="block truncate text-sm text-muted">
                          {tx.type === 'transfer' ? `${acc?.name ?? ''} → ${dest?.name ?? ''}` : `${cat?.name ?? 'Sem categoria'} · ${acc?.name ?? ''}`}
                          {tx.loanPaymentId ? ' · crédito' : ''}
                        </span>
                      </span>
                      <span className={`amount shrink-0 font-medium ${tx.type === 'expense' ? 'text-bad' : tx.type === 'income' ? 'text-good' : ''}`}>{sign}{formatEUR(tx.amount)}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
