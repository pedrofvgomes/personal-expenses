import type { Session } from './auth.ts'
import { decryptJson, encrypt, isEnvelope } from './crypto.ts'
import { defaultData, normalize } from './defaults.ts'
import type { AppData } from '../types.ts'

const CACHE = 'desp.cache'
const META = 'desp.meta'
const FILE = 'data.enc'

export interface Meta {
  remoteUpdatedAt: string | null
  syncedDataUpdatedAt: string | null
}

export interface LoadResult {
  data: AppData
  meta: Meta
  conflict: boolean
  remoteData: AppData | null
  remoteUpdatedAt: string | null
  offline: boolean
  dirty: boolean
  fatal: string | null
  hadLocal: boolean
}

type Remote =
  | { ok: true; updatedAt: string; data: AppData | null; unreadable: boolean }
  | { ok: false; offline: boolean; error: string }

function ghHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

export function readMeta(): Meta {
  try {
    const parsed = JSON.parse(localStorage.getItem(META) || 'null') as Partial<Meta> | null
    if (!parsed || typeof parsed !== 'object') return { remoteUpdatedAt: null, syncedDataUpdatedAt: null }
    return {
      remoteUpdatedAt: typeof parsed.remoteUpdatedAt === 'string' ? parsed.remoteUpdatedAt : null,
      syncedDataUpdatedAt: typeof parsed.syncedDataUpdatedAt === 'string' ? parsed.syncedDataUpdatedAt : null,
    }
  } catch {
    return { remoteUpdatedAt: null, syncedDataUpdatedAt: null }
  }
}

export function writeMeta(meta: Meta) {
  localStorage.setItem(META, JSON.stringify(meta))
}

export async function readCache(key: CryptoKey): Promise<AppData | null> {
  const raw = localStorage.getItem(CACHE)
  if (!raw) return null
  try {
    const env = JSON.parse(raw) as unknown
    if (!isEnvelope(env)) return null
    return normalize(await decryptJson<AppData>(key, env))
  } catch {
    return null
  }
}

export async function writeCache(key: CryptoKey, data: AppData): Promise<void> {
  const env = await encrypt(key, data)
  localStorage.setItem(CACHE, JSON.stringify(env))
}

async function fetchRemote(session: Session): Promise<Remote> {
  let res: Response
  try {
    res = await fetch(`https://api.github.com/gists/${session.gistId}`, { headers: ghHeaders(session.token) })
  } catch {
    return { ok: false, offline: true, error: 'Sem ligação. As alterações ficam neste dispositivo.' }
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, offline: false, error: 'O token do gist foi recusado. Cria outro e volta a publicar o site.' }
  }
  if (!res.ok) return { ok: false, offline: false, error: `O gist não respondeu (${res.status}).` }
  const body = (await res.json()) as {
    updated_at: string
    files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string } | null>
  }
  const file = body.files?.[FILE]
  let content = file?.content ?? ''
  if (file?.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url, { headers: ghHeaders(session.token) })
    if (raw.ok) content = await raw.text()
  }
  if (!content.trim() || content.trim() === '{}') return { ok: true, updatedAt: body.updated_at, data: null, unreadable: false }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { ok: true, updatedAt: body.updated_at, data: null, unreadable: false }
  }
  if (!isEnvelope(parsed)) return { ok: true, updatedAt: body.updated_at, data: null, unreadable: false }
  try {
    const data = normalize(await decryptJson<AppData>(session.key, parsed))
    return { ok: true, updatedAt: body.updated_at, data, unreadable: false }
  } catch {
    return { ok: true, updatedAt: body.updated_at, data: null, unreadable: true }
  }
}

export async function pullIfNewer(session: Session, meta: Meta, local: AppData): Promise<
  | { action: 'none' }
  | { action: 'take'; data: AppData; meta: Meta }
  | { action: 'conflict'; data: AppData; remoteUpdatedAt: string }
> {
  const remote = await fetchRemote(session)
  if (!remote.ok || remote.unreadable || !remote.data) return { action: 'none' }
  if (remote.data.updatedAt === local.updatedAt) {
    if (remote.updatedAt === meta.remoteUpdatedAt) return { action: 'none' }
    const next = { remoteUpdatedAt: remote.updatedAt, syncedDataUpdatedAt: local.updatedAt }
    writeMeta(next)
    return { action: 'take', data: remote.data, meta: next }
  }
  const localDirty = Boolean(meta.syncedDataUpdatedAt && local.updatedAt !== meta.syncedDataUpdatedAt)
  const remoteMoved = Boolean(meta.remoteUpdatedAt && remote.updatedAt !== meta.remoteUpdatedAt)
  if (localDirty && remoteMoved) return { action: 'conflict', data: remote.data, remoteUpdatedAt: remote.updatedAt }
  if (!localDirty && remote.data.updatedAt > local.updatedAt) {
    const next = { remoteUpdatedAt: remote.updatedAt, syncedDataUpdatedAt: remote.data.updatedAt }
    writeMeta(next)
    await writeCache(session.key, remote.data)
    return { action: 'take', data: remote.data, meta: next }
  }
  return { action: 'none' }
}

export async function loadState(session: Session): Promise<LoadResult> {
  const meta = readMeta()
  const cached = await readCache(session.key)
  const remote = await fetchRemote(session)
  const empty: LoadResult = {
    data: cached ?? defaultData(),
    meta,
    conflict: false,
    remoteData: null,
    remoteUpdatedAt: null,
    offline: false,
    dirty: false,
    fatal: null,
    hadLocal: Boolean(cached),
  }
  if (!remote.ok) return { ...empty, offline: remote.offline, fatal: remote.offline ? null : remote.error }
  if (remote.unreadable) {
    return {
      ...empty,
      data: cached ?? defaultData(),
      fatal: 'Não consegui ler os dados cifrados. Se mudaste a palavra-passe, repõe a anterior, usa a cópia deste dispositivo ou importa um backup.',
      remoteUpdatedAt: remote.updatedAt,
      hadLocal: Boolean(cached),
    }
  }
  if (!remote.data && !cached) return { ...empty, data: defaultData(), dirty: true, remoteUpdatedAt: remote.updatedAt }
  if (!remote.data && cached) return { ...empty, data: cached, dirty: true, remoteUpdatedAt: remote.updatedAt }
  if (remote.data && !cached) {
    const next = { remoteUpdatedAt: remote.updatedAt, syncedDataUpdatedAt: remote.data.updatedAt }
    writeMeta(next)
    await writeCache(session.key, remote.data)
    return { ...empty, data: remote.data, meta: next, remoteUpdatedAt: remote.updatedAt }
  }
  if (!remote.data || !cached) return empty
  const diverged = cached.updatedAt !== remote.data.updatedAt
  const gistMoved = Boolean(meta.remoteUpdatedAt && meta.remoteUpdatedAt !== remote.updatedAt)
  const localMoved = Boolean(meta.syncedDataUpdatedAt && cached.updatedAt !== meta.syncedDataUpdatedAt)
  if (diverged && (gistMoved && localMoved || (!meta.remoteUpdatedAt && cached.updatedAt > remote.data.updatedAt))) {
    return { ...empty, data: cached, conflict: true, remoteData: remote.data, remoteUpdatedAt: remote.updatedAt }
  }
  if (cached.updatedAt > remote.data.updatedAt) return { ...empty, data: cached, dirty: true, remoteUpdatedAt: remote.updatedAt }
  const next = { remoteUpdatedAt: remote.updatedAt, syncedDataUpdatedAt: remote.data.updatedAt }
  writeMeta(next)
  await writeCache(session.key, remote.data)
  return { ...empty, data: remote.data, meta: next, remoteUpdatedAt: remote.updatedAt }
}

export type PushResult =
  | { ok: true; remoteUpdatedAt: string }
  | { ok: false; conflict: true; remoteData: AppData | null; remoteUpdatedAt: string }
  | { ok: false; conflict: false; offline: boolean; error: string }

export async function pushRemote(session: Session, data: AppData, seenRemoteUpdatedAt: string | null, force: boolean): Promise<PushResult> {
  const remote = await fetchRemote(session)
  if (!remote.ok) return { ok: false, conflict: false, offline: remote.offline, error: remote.error }
  if (remote.unreadable && !force) {
    return { ok: false, conflict: false, offline: false, error: 'Os dados na nuvem não abrem com esta palavra-passe.' }
  }
  const moved = Boolean(seenRemoteUpdatedAt && remote.updatedAt !== seenRemoteUpdatedAt)
  const bothDiffer = Boolean(!seenRemoteUpdatedAt && remote.data && remote.data.updatedAt !== data.updatedAt)
  if (!force && (moved || bothDiffer)) {
    return { ok: false, conflict: true, remoteData: remote.data, remoteUpdatedAt: remote.updatedAt }
  }
  const envelope = await encrypt(session.key, data)
  let res: Response
  try {
    res = await fetch(`https://api.github.com/gists/${session.gistId}`, {
      method: 'PATCH',
      headers: { ...ghHeaders(session.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(envelope) } } }),
    })
  } catch {
    return { ok: false, conflict: false, offline: true, error: 'Sem ligação. As alterações ficam neste dispositivo.' }
  }
  if (!res.ok) return { ok: false, conflict: false, offline: false, error: `Não guardei na nuvem (${res.status}).` }
  const body = (await res.json()) as { updated_at: string }
  return { ok: true, remoteUpdatedAt: body.updated_at }
}
