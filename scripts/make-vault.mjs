import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { buildVault } from '../src/lib/crypto.ts'

function loadDotEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      if (!process.env[key]) process.env[key] = value
    }
  }
}

loadDotEnv()

const password = process.env.APP_PASSWORD?.trim()
const token = process.env.GIST_TOKEN?.trim()
const gistId = process.env.GIST_ID?.trim()

if (!password || !token || !gistId) {
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.error('Faltam os secrets APP_PASSWORD, GIST_TOKEN e GIST_ID.')
    process.exit(1)
  }
  writeFileSync('public/vault.json', `${JSON.stringify({ v: 0 })}\n`)
  console.warn('Sem secrets: public/vault.json ficou por configurar.')
  process.exit(0)
}

const vault = await buildVault(password, { token, gistId })
writeFileSync('public/vault.json', `${JSON.stringify(vault)}\n`)
console.log('Cofre escrito em public/vault.json')
