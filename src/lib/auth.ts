import { decryptJson, deriveKey, fromB64, isVault, type VaultFile } from './crypto.ts'
import { idbDel, idbGet, idbSet } from './idb.ts'

export interface Session {
  key: CryptoKey
  token: string
  gistId: string
}

const KEY = 'key'

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

export async function unlock(password: string): Promise<Session> {
  const vault = await loadVault()
  if (!isVault(vault)) throw new Error('unconfigured')
  let session: Session
  try {
    session = await openVault(password, vault)
  } catch (error) {
    if (error instanceof Error && error.message === 'password') throw error
    throw new Error('password')
  }
  try {
    await idbSet(KEY, session.key)
  } catch {
    // IndexedDB may be blocked; the session still works until the tab closes.
  }
  return session
}

export async function resume(): Promise<Session | null> {
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
    return { key, token: secret.token, gistId: secret.gistId }
  } catch {
    await clearSession()
    return null
  }
}

export async function clearSession(): Promise<void> {
  try {
    await idbDel(KEY)
  } catch {
    // ignore
  }
}
