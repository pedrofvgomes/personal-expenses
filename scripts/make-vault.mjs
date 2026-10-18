import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildVault, decryptJson, deriveKey, fromB64, isVault, toB64, VAULT_ITERATIONS } from '../src/lib/crypto.ts'

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
  if (existsSync('public/vault-2.json')) unlinkSync('public/vault-2.json')
  console.warn('Sem secrets: public/vault.json ficou por configurar.')
  process.exit(0)
}

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
}

function savedSalt(content) {
  try {
    const parsed = JSON.parse(content)
    if (parsed?.v === 1 && typeof parsed.salt === 'string' && typeof parsed.iter === 'number') {
      return { salt: fromB64(parsed.salt), iter: parsed.iter }
    }
  } catch {
    // crypto.json ainda não existe ou não é json.
  }
  return null
}

function looksLocked(content) {
  const trimmed = content.trim()
  if (!trimmed || trimmed === '{}') return false
  try {
    const parsed = JSON.parse(trimmed)
    return parsed?.v === 1 && typeof parsed.iv === 'string' && typeof parsed.ct === 'string'
  } catch {
    return false
  }
}

async function opens(key, content) {
  if (!looksLocked(content)) return 'empty'
  try {
    await decryptJson(key, JSON.parse(content))
    return 'open'
  } catch {
    return 'locked'
  }
}

async function fileText(file) {
  if (!file) return ''
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url, { headers })
    if (!raw.ok) throw new Error(`raw ${raw.status}`)
    return raw.text()
  }
  return file.content ?? ''
}

async function localSalt() {
  if (!existsSync('public/vault.json')) return null
  try {
    const parsed = JSON.parse(readFileSync('public/vault.json', 'utf8'))
    if (!isVault(parsed)) return null
    const salt = fromB64(parsed.salt)
    const key = await deriveKey(password, salt, parsed.iter)
    await decryptJson(key, parsed)
    return { salt, iter: parsed.iter, key }
  } catch {
    return null
  }
}

function findFiles(dir, name) {
  const out = execFileSync('find', [dir, '-name', name, '-type', 'f'], { encoding: 'utf8' })
  return out.split('\n').map((line) => line.trim()).filter(Boolean)
}

function materialFromDir(dir) {
  const path = findFiles(dir, 'vault.json')[0]
  if (!path) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    if (!isVault(parsed)) return null
    return { salt: fromB64(parsed.salt), iter: parsed.iter }
  } catch {
    return null
  }
}

function materialFromZip(bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'vault-'))
  try {
    const zip = join(dir, 'artifact.zip')
    writeFileSync(zip, bytes)
    execFileSync('unzip', ['-o', '-q', zip, '-d', dir])
    const direct = materialFromDir(dir)
    if (direct) return direct
    const tar = [...findFiles(dir, '*.tar'), ...findFiles(dir, '*.tar.gz'), ...findFiles(dir, '*.tgz')][0]
    if (!tar) return null
    execFileSync('tar', ['-xf', tar, '-C', dir])
    return materialFromDir(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function downloadArtifact(url, auth) {
  const res = await fetch(url, { headers: auth, redirect: 'manual' })
  if (res.status >= 300 && res.status < 400) {
    const next = res.headers.get('location')
    if (!next) throw new Error('redirect')
    const file = await fetch(next)
    if (!file.ok) throw new Error(String(file.status))
    return Buffer.from(await file.arrayBuffer())
  }
  if (!res.ok) throw new Error(String(res.status))
  return Buffer.from(await res.arrayBuffer())
}

async function saltsFromPublishes() {
  const ghToken = process.env.GITHUB_TOKEN?.trim()
  const repo = process.env.GITHUB_REPOSITORY?.trim()
  if (!ghToken || !repo) return []
  const auth = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${ghToken}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'despesas-vault',
  }
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/artifacts?per_page=30`, { headers: auth })
  if (!res.ok) {
    console.warn(`Não li as publicações anteriores (${res.status}).`)
    return []
  }
  const body = await res.json()
  const artifacts = (body.artifacts ?? [])
    .filter((item) => item.name === 'github-pages' && !item.expired)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  const found = []
  const seen = new Set()
  for (const artifact of artifacts) {
    try {
      const material = materialFromZip(await downloadArtifact(artifact.archive_download_url, auth))
      if (!material) continue
      const id = `${material.iter}:${toB64(material.salt)}`
      if (seen.has(id)) continue
      seen.add(id)
      found.push(material)
    } catch (error) {
      console.warn(`Não li uma publicação anterior (${error instanceof Error ? error.message : 'erro'}).`)
    }
  }
  return found
}

let gist = null
try {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers })
  if (!res.ok) throw new Error(String(res.status))
  gist = await res.json()
} catch (error) {
  const message = `Não li o gist (${error instanceof Error ? error.message : 'erro'}).`
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.error(`${message} Não vou gerar um salt novo.`)
    process.exit(1)
  }
  console.warn(message)
}

let dataText = ''
let saved = null
if (gist) {
  try {
    dataText = await fileText(gist.files?.['data.enc'])
    saved = savedSalt(await fileText(gist.files?.['crypto.json']))
  } catch (error) {
    const message = `Não li o data.enc completo (${error instanceof Error ? error.message : 'erro'}).`
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.error(`${message} Não vou gerar um salt novo.`)
      process.exit(1)
    }
    console.warn(message)
    gist = null
  }
}
async function accepts(material) {
  if (!gist) return true
  const key = material.key ?? (await deriveKey(password, material.salt, material.iter))
  return (await opens(key, dataText)) !== 'locked'
}

const local = await localSalt()
let chosen = null
let recoverable = false
for (const material of [saved, local].filter(Boolean)) {
  if (await accepts(material)) {
    chosen = material
    recoverable = true
    break
  }
}
// Old Pages artifacts still hold the salt that encrypted data.enc.
if (!chosen && gist && looksLocked(dataText)) {
  for (const material of await saltsFromPublishes()) {
    if (await accepts(material)) {
      chosen = material
      recoverable = true
      console.log('Salt recuperado de uma publicação anterior.')
      break
    }
  }
}
if (!chosen) {
  const locked = Boolean(gist && looksLocked(dataText))
  if (locked) {
    const message = 'Nenhuma publicação anterior abre o data.enc. Não vou publicar uma chave nova.'
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.error(message)
      process.exit(1)
    }
    console.warn(message)
  }
  chosen = local ?? { salt: crypto.getRandomValues(new Uint8Array(16)), iter: VAULT_ITERATIONS }
  recoverable = !locked
}
const same = Boolean(saved && toB64(saved.salt) === toB64(chosen.salt) && saved.iter === chosen.iter)
const write = Boolean(gist && recoverable && !same)

if (write) {
  const content = JSON.stringify({ v: 1, iter: chosen.iter, salt: toB64(chosen.salt) })
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { 'crypto.json': { content } } }),
  })
  if (!res.ok) console.error(`Não gravei crypto.json (${res.status}). A publicação segue com este salt.`)
  else console.log('Salt gravado no gist (crypto.json).')
}

const vault = await buildVault(password, { token, gistId }, chosen.salt, chosen.iter)
writeFileSync('public/vault.json', `${JSON.stringify(vault)}\n`)
console.log('Cofre escrito em public/vault.json')

const secondPassword = process.env.APP_PASSWORD_2?.trim()
const secondPath = 'public/vault-2.json'
if (secondPassword && secondPassword !== password) {
  const second = await buildVault(secondPassword, { token, gistId }, chosen.salt, chosen.iter)
  writeFileSync(secondPath, `${JSON.stringify(second)}\n`)
  console.log('Cofre escrito em public/vault-2.json')
} else {
  if (secondPassword) console.warn('APP_PASSWORD_2 é igual a APP_PASSWORD. O segundo cofre fica de fora.')
  if (existsSync(secondPath)) unlinkSync(secondPath)
}
