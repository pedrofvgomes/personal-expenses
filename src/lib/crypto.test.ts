import { describe, expect, it } from 'vitest'
import { buildVault, decryptJson, deriveKey, encrypt, fromB64, toB64 } from './crypto.ts'

describe('crypto', () => {
  it('round-trips json and rejects a tampered payload', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await deriveKey('segredo', salt, 1_000)
    const env = await encrypt(key, { saldo: 12.5, nota: 'café' })
    await expect(decryptJson(key, env)).resolves.toEqual({ saldo: 12.5, nota: 'café' })
    const wrong = await deriveKey('outra', salt, 1_000)
    await expect(decryptJson(wrong, env)).rejects.toBeTruthy()
    await expect(decryptJson(key, { ...env, iv: toB64(crypto.getRandomValues(new Uint8Array(12))) })).rejects.toBeTruthy()
  })

  it('opens a vault only with the password it was built with', async () => {
    const vault = await buildVault('correct horse', { token: 'gist-token', gistId: 'abc' })
    const key = await deriveKey('correct horse', fromB64(vault.salt), vault.iter)
    await expect(decryptJson(key, vault)).resolves.toEqual({ token: 'gist-token', gistId: 'abc' })
    const wrong = await deriveKey('nope', fromB64(vault.salt), vault.iter)
    await expect(decryptJson(wrong, vault)).rejects.toBeTruthy()
  }, 30_000)
})
