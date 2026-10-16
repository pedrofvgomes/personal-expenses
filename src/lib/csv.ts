import { uid } from './id.ts'
import { parseAmount } from './money.ts'
import type { AppData, Category, Transaction } from '../types.ts'

function cell(value: string): string {
  if (/[;"\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function transactionsToCsv(data: AppData): string {
  const lines = [['data', 'tipo', 'valor', 'categoria', 'conta', 'conta_destino', 'nota', 'etiquetas'].join(';')]
  const sorted = [...data.transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  for (const tx of sorted) {
    const tipo = tx.type === 'expense' ? 'despesa' : tx.type === 'income' ? 'receita' : 'transferencia'
    lines.push(
      [
        tx.date,
        tipo,
        tx.amount.toFixed(2).replace('.', ','),
        data.categories.find((c) => c.id === tx.categoryId)?.name ?? '',
        data.accounts.find((a) => a.id === tx.accountId)?.name ?? '',
        data.accounts.find((a) => a.id === tx.toAccountId)?.name ?? '',
        tx.note,
        tx.tags.join(' '),
      ]
        .map(cell)
        .join(';'),
    )
  }
  return `\uFEFF${lines.join('\n')}\n`
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function parseDate(value: string): string | null {
  const t = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const match = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (!match) return null
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

function tipoOf(value: string): Transaction['type'] | null {
  const t = value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  if (t === 'despesa' || t === 'expense') return 'expense'
  if (t === 'receita' || t === 'income') return 'income'
  if (t === 'transferencia' || t === 'transfer') return 'transfer'
  return null
}

export function importCsv(text: string, data: AppData): { transactions: Transaction[]; categories: Category[]; skipped: number } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { transactions: [], categories: [], skipped: 0 }
  const sep = lines[0].includes(';') ? ';' : ','
  const header = splitLine(lines[0], sep).map((h) => h.trim().toLowerCase())
  const idx = (name: string) => header.indexOf(name)
  const transactions: Transaction[] = []
  const categories: Category[] = []
  const known = new Set(data.transactions.map((t) => `${t.date}|${t.type}|${t.amount}|${t.note}|${t.accountId}`))
  let skipped = 0
  for (const line of lines.slice(1)) {
    const cols = splitLine(line, sep)
    const get = (name: string) => (idx(name) >= 0 ? cols[idx(name)] ?? '' : '').trim()
    const date = parseDate(get('data'))
    const type = tipoOf(get('tipo'))
    const amount = parseAmount(get('valor'))
    if (!date || !type || amount === null || amount <= 0) {
      skipped++
      continue
    }
    const accountName = get('conta')
    const account = data.accounts.find((a) => a.name.toLowerCase() === accountName.toLowerCase()) ?? data.accounts[0]
    if (!account) {
      skipped++
      continue
    }
    const destName = get('conta_destino')
    const dest = data.accounts.find((a) => a.name.toLowerCase() === destName.toLowerCase())
    let categoryId: string | null = null
    const categoryName = get('categoria')
    if (type !== 'transfer' && categoryName) {
      const kind = type === 'income' ? 'income' : 'expense'
      const existing = [...data.categories, ...categories].find((c) => c.kind === kind && c.name.toLowerCase() === categoryName.toLowerCase())
      if (existing) categoryId = existing.id
      else {
        const created: Category = { id: uid(), name: categoryName, emoji: kind === 'income' ? '💰' : '📦', color: '#57534e', kind }
        categories.push(created)
        categoryId = created.id
      }
    }
    const note = get('nota')
    const key = `${date}|${type}|${amount}|${note}|${account.id}`
    if (known.has(key)) {
      skipped++
      continue
    }
    known.add(key)
    transactions.push({
      id: uid(),
      date,
      type,
      amount,
      categoryId,
      accountId: account.id,
      toAccountId: type === 'transfer' ? dest?.id : undefined,
      note,
      tags: get('etiquetas').split(/\s+/).filter(Boolean),
    })
  }
  return { transactions, categories, skipped }
}

export function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
