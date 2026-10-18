import { matchingBook, type Session } from './auth.ts'
import { invitedId } from './books.ts'
import { buildVault, isVault, randomDataKey, type VaultFile } from './crypto.ts'

const GIST_ID = /^[A-Za-z0-9]{8,64}$/
const USER_ID = /^[a-f0-9]{8}$/
const LOCAL = 'desp.roster'
const POINTER = 'roster.json'
const DOC = 'vaults.json'

export type RosterUser = { id: string; vault: Extract<VaultFile, { v: 1 }> }

type GistFile = { content?: string; truncated?: boolean; raw_url?: string } | null

function gh(token?: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function validGistId(value: unknown): string | null {
  return typeof value === 'string' && GIST_ID.test(value) ? value : null
}

export function rosterUsers(value: unknown): RosterUser[] | null {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { users?: unknown }).users)) return null
  const users: RosterUser[] = []
  for (const item of (value as { users: unknown[] }).users) {
    if (!item || typeof item !== 'object') continue
    const id = (item as { id?: unknown }).id
    const vault = (item as { vault?: unknown }).vault
    if (typeof id !== 'string' || !USER_ID.test(id) || !isVault(vault)) continue
    users.push({ id, vault })
  }
  return users
}

function remember(id: string) {
  try {
    localStorage.setItem(LOCAL, id)
  } catch {
    // Private mode can refuse the pointer. This browser then waits for the next publish.
  }
}

function remembered(): string | null {
  try {
    return validGistId(localStorage.getItem(LOCAL))
  } catch {
    return null
  }
}

async function siteRosterId(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}roster.json`, { cache: 'no-store' })
    if (!res.ok) return null
    const body = (await res.json()) as { id?: unknown }
    const id = validGistId(body.id)
    if (id) remember(id)
    return id
  } catch {
    return null
  }
}

async function publicRosterId(): Promise<string | null> {
  return (await siteRosterId()) ?? remembered()
}

async function fileText(file: GistFile, token?: string): Promise<string> {
  if (!file) return ''
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url, { cache: 'no-store', headers: token ? gh(token) : { Accept: 'application/vnd.github+json' } })
    if (!raw.ok) throw new Error('gist')
    return raw.text()
  }
  return file.content ?? ''
}

async function privatePointer(session: Session): Promise<string | null> {
  const res = await fetch(`https://api.github.com/gists/${session.gistId}`, { cache: 'no-store', headers: gh(session.token) })
  if (!res.ok) throw new Error('gist')
  const body = (await res.json()) as { files?: Record<string, GistFile> }
  const text = await fileText(body.files?.[POINTER] ?? null, session.token)
  if (!text.trim()) return null
  try {
    return validGistId((JSON.parse(text) as { id?: unknown }).id)
  } catch {
    return null
  }
}

async function knownRosterId(session: Session): Promise<string | null> {
  const known = await publicRosterId()
  if (known) return known
  const fromGist = await privatePointer(session)
  if (fromGist) remember(fromGist)
  return fromGist
}

async function readPublic(id: string): Promise<RosterUser[] | null> {
  try {
    const res = await fetch(`https://api.github.com/gists/${id}`, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { files?: Record<string, GistFile> }
    const text = await fileText(body.files?.[DOC] ?? null)
    if (!text.trim()) return null
    return rosterUsers(JSON.parse(text))
  } catch {
    return null
  }
}

export async function loadRosterUsers(): Promise<RosterUser[]> {
  const id = await publicRosterId()
  if (!id) return []
  return (await readPublic(id)) ?? []
}

async function writePointer(session: Session, id: string) {
  const res = await fetch(`https://api.github.com/gists/${session.gistId}`, {
    method: 'PATCH',
    headers: { ...gh(session.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { [POINTER]: { content: `${JSON.stringify({ id })}\n` } } }),
  })
  if (!res.ok) throw new Error('gist')
}

async function writePublic(token: string, id: string, users: RosterUser[]) {
  const res = await fetch(`https://api.github.com/gists/${id}`, {
    method: 'PATCH',
    headers: { ...gh(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { [DOC]: { content: `${JSON.stringify({ users })}\n` } } }),
  })
  if (!res.ok) throw new Error('gist')
}

function freshId(users: RosterUser[]): string {
  for (let i = 0; i < 5; i++) {
    const id = [...crypto.getRandomValues(new Uint8Array(4))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    if (!users.some((user) => user.id === id)) return id
  }
  throw new Error('gist')
}

// The roster is a public gist of ciphertexts. Login can read it before it has a token, and a password change can replace one entry without a new site build.
export async function createRosterUser(session: Session, password: string): Promise<void> {
  if (session.file) throw new Error('owner')
  const typed = password.trim()
  if (!typed) throw new Error('password')
  let rosterId = await knownRosterId(session)
  if (rosterId) remember(rosterId)
  if (await matchingBook(typed)) throw new Error('taken')
  const secret = { token: session.token, gistId: session.gistId, dataKey: randomDataKey() }
  if (!rosterId) {
    const vault = await buildVault(typed, secret)
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: { ...gh(session.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'Despesas',
        public: true,
        files: { [DOC]: { content: `${JSON.stringify({ users: [{ id: freshId([]), vault }] })}\n` } },
      }),
    })
    if (!res.ok) throw new Error('gist')
    const created = validGistId(((await res.json()) as { id?: unknown }).id)
    if (!created) throw new Error('gist')
    remember(created)
    await writePointer(session, created)
    return
  }
  const users = await readPublic(rosterId)
  if (!users) throw new Error('gist')
  const vault = await buildVault(typed, secret)
  users.push({ id: freshId(users), vault })
  await writePublic(session.token, rosterId, users)
  remember(rosterId)
  await writePointer(session, rosterId)
}

export async function publishRosterVault(session: Session, vault: Extract<VaultFile, { v: 1 }>): Promise<void> {
  const id = session.file ? invitedId(session.file) : null
  if (!id) throw new Error('owner')
  const rosterId = await knownRosterId(session)
  if (!rosterId) throw new Error('roster')
  const users = await readPublic(rosterId)
  if (!users) throw new Error('gist')
  const index = users.findIndex((user) => user.id === id)
  if (index < 0) throw new Error('roster')
  const next = users.slice()
  next[index] = { id, vault }
  await writePublic(session.token, rosterId, next)
}
