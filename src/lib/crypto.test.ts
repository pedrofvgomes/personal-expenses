import { describe, expect, it } from 'vitest'
import { buildVault, decryptJson, deriveKey, importAesKey, randomDataKey } from './crypto.ts'
import { rosterUsers } from './roster.ts'

describe('vault secret', () => {
  it('keeps the original secret to the token and the gist', async () => {
    const salt = new Uint8Array(16).fill(3)
    const vault = await buildVault('pw', { token: 't', gistId: 'g' }, salt, 1)
    const key = await deriveKey('pw', salt, 1)
    expect(await decryptJson(key, vault)).toEqual({ token: 't', gistId: 'g' })
  })

  it('wraps an invited book key without changing the book', async () => {
    const salt = new Uint8Array(16).fill(4)
    const dataKey = randomDataKey()
    const vault = await buildVault('pw', { token: 't', gistId: 'g', dataKey }, salt, 1)
    const key = await deriveKey('pw', salt, 1)
    const secret = await decryptJson<{ dataKey: string }>(key, vault)
    const bookKey = await importAesKey(secret.dataKey)
    expect(secret.dataKey).toBe(dataKey)
    expect(bookKey.type).toBe('secret')
  })
})

describe('roster', () => {
  const vault = { v: 1 as const, iter: 1, salt: 'aa', iv: 'bb', ct: 'cc' }

  it('keeps only invited users with a real id', () => {
    expect(rosterUsers({ users: [{ id: '0123abcd', vault }, { id: '../data.enc', vault }, { id: 'short', vault }] })).toEqual([
      { id: '0123abcd', vault },
    ])
    expect(rosterUsers({ nope: true })).toBeNull()
    expect(rosterUsers(null)).toBeNull()
  })
})
