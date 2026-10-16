import { decryptJson, deriveKey, fromB64, isVault, type VaultFile } from './crypto.ts'
import { idbDel, idbGet, idbSet } from './idb.ts'

export interface Session {
  key: CryptoKey
  token: string
  gistId: string
}

const SESSION = 'session'
const KEY = 'key'
const PREV = 'previous-key'

export async function loadVault(): Promise<VaultFile> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}vault.json`, { cache: 'no-store' })
    if (!res.ok) return { v: 0 }
    return (await res.json()) as VaultFile
  } catch {
    return { v: 0 }
  }
}

async function openVault(password: string, vault: Extract<VaultFile, { v: 1 }>): Promise<Session> {
  const key = await deriveKey(password, fromB64(vault.salt), vault.iter)
  const secret = await decryptJson<{ token?: string; gistId?: string }>(key, vault)
  if (!secret?.token || !secret.gistId) throw new Error('password')
  return { key, token: secret.token, gistId: secret.gistId }
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false
  const session = value as Session
  return Boolean(session.key) && typeof session.token === 'string' && session.token.length > 0 && typeof session.gistId === 'string' && session.gistId.length > 0
}

async function remember(session: Session) {
  try {
    await idbSet(SESSION, session)
    await idbSet(KEY, session.key)
  } catch {
    // IndexedDB may be blocked; the session still works until the tab closes.
  }
}

async function stash(key: CryptoKey) {
  try {
    if (await idbGet<CryptoKey>(PREV)) return
    await idbSet(PREV, key)
  } catch {
    // ignore
  }
}

export async function previousKey(): Promise<CryptoKey | null> {
  try {
    return await idbGet<CryptoKey>(PREV)
  } catch {
    return null
  }
}

export async function unlock(password: string): Promise<Session> {
  const vault = await loadVault()
  if (!isVault(vault)) throw new Error('unconfigured')
  const prior = await idbGet<CryptoKey>(KEY).catch(() => null)
  let session: Session
  try {
    session = await openVault(password, vault)
  } catch (error) {
    if (error instanceof Error && error.message === 'password') throw error
    throw new Error('password')
  }
  if (prior) await stash(prior)
  await remember(session)
  return session
}

export async function resume(): Promise<Session | null> {
  try {
    const saved = await idbGet<Session>(SESSION)
    if (isSession(saved)) {
      const vault = await loadVault()
      if (!isVault(vault)) return saved
      try {
        await decryptJson(saved.key, vault)
        return saved
      } catch {
        await stash(saved.key)
        return null
      }
    }
  } catch {
    // Fall through to the legacy key.
  }
  let key: CryptoKey | null = null
  try {
    key = await idbGet<CryptoKey>(KEY)
  } catch {
    return null
  }
  if (!key) return null
  const vault = await loadVault()
  if (!isVault(vault)) return null
  try {
    const secret = await decryptJson<{ token?: string; gistId?: string }>(key, vault)
    if (!secret?.token || !secret.gistId) throw new Error('password')
    const session = { key, token: secret.token, gistId: secret.gistId }
    await remember(session)
    return session
  } catch {
    // The new vault salt cannot open this key. It may still open the gist.
    await stash(key)
    return null
  }
}

export async function clearSession(): Promise<void> {
  try {
    await idbDel(SESSION)
    await idbDel(KEY)
  } catch {
    // ignore
  }
}
