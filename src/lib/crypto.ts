export const VAULT_ITERATIONS = 600_000

export type DataEnvelope = { v: 1; iv: string; ct: string }

export type VaultFile = { v: 0 } | { v: 1; iter: number; salt: string; iv: string; ct: string }

export function toB64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(s)
}

export function fromB64(value: string): Uint8Array {
  const bin = atob(value)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export function isEnvelope(value: unknown): value is DataEnvelope {
  if (!value || typeof value !== 'object') return false
  const o = value as DataEnvelope
  return o.v === 1 && typeof o.iv === 'string' && typeof o.ct === 'string'
}

export function isVault(value: unknown): value is Extract<VaultFile, { v: 1 }> {
  if (!value || typeof value !== 'object') return false
  const o = value as Extract<VaultFile, { v: 1 }>
  return o.v === 1 && typeof o.iter === 'number' && typeof o.salt === 'string' && typeof o.iv === 'string' && typeof o.ct === 'string'
}

export async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', toArrayBuffer(new TextEncoder().encode(password)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encrypt(key: CryptoKey, value: unknown): Promise<DataEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  )
  return { v: 1, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) }
}

export async function decryptJson<T>(key: CryptoKey, payload: { iv: string; ct: string }): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(fromB64(payload.iv)) },
    key,
    toArrayBuffer(fromB64(payload.ct)),
  )
  return JSON.parse(new TextDecoder().decode(pt)) as T
}

export async function buildVault(password: string, secret: { token: string; gistId: string }): Promise<Extract<VaultFile, { v: 1 }>> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(password, salt, VAULT_ITERATIONS)
  const data = await encrypt(key, secret)
  return { v: 1, iter: VAULT_ITERATIONS, salt: toB64(salt), iv: data.iv, ct: data.ct }
}
