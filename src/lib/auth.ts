import { decryptJson, deriveKey, fromB64, isVault, type VaultFile } from './crypto.ts'
import { idbDel, idbGet, idbSet } from './idb.ts'

export interface Session {
  key: CryptoKey
  token: string
  gistId: string
  file?: 'data-2.enc'
}

const SESSION = 'session'
const KEY = 'key'
const PREV = 'previous-key'

async function loadNamed(name: string): Promise<VaultFile | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${name}`, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as VaultFile
  } catch {
    return null
  }
}

export async function loadVault(): Promise<VaultFile> {
  return (await loadNamed('vault.json')) ?? { v: 0 }
}

async function openVault(password: string, vault: Extract<VaultFile, { v: 1 }>, file?: 'data-2.enc'): Promise<Session> {
  const key = await deriveKey(password, fromB64(vault.salt), vault.iter)
  const secret = await decryptJson<{ token?: string; gistId?: string }>(key, vault)
  if (!secret?.token || !secret.gistId) throw new Error('password')
  return file ? { key, token: secret.token, gistId: secret.gistId, file } : { key, token: secret.token, gistId: secret.gistId }
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false
  const session = value as Session
  if (session.file !== undefined && session.file !== 'data-2.enc') return false
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
  let session: Session | null = null
  try {
    session = await openVault(password, vault)
  } catch {
    session = null
  }
  if (!session) {
    const second = await loadNamed('vault-2.json')
    if (isVault(second)) {
      try {
        session = await openVault(password, second, 'data-2.enc')
      } catch {
        session = null
      }
    }
  }
  if (!session) throw new Error('password')
  if (prior) await stash(prior)
  await remember(session)
  return session
}

export async function resume(): Promise<Session | null> {
  try {
    const saved = await idbGet<Session>(SESSION)
    if (isSession(saved)) {
      if (saved.file === 'data-2.enc') {
        const second = await loadNamed('vault-2.json')
        if (!isVault(second)) return null
        try {
          await decryptJson(saved.key, second)
          return saved
        } catch {
          await stash(saved.key)
          return null
        }
      }
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
