import fetch from 'node-fetch'
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const SESSION_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'bgg-session.json')

let sessionCookies = null
let loggedInAs = null

// Restore session from disk on startup (data/ dir may not exist yet — handled by catch)
try {
  const saved = JSON.parse(readFileSync(SESSION_FILE, 'utf8'))
  if (saved.cookies && saved.username) {
    sessionCookies = saved.cookies
    loggedInAs = saved.username
    console.log(`BGG session restored for ${loggedInAs}`)
  }
} catch { /* no saved session or data dir not yet created */ }

function persistSession() {
  try { writeFileSync(SESSION_FILE, JSON.stringify({ cookies: sessionCookies, username: loggedInAs })) }
  catch { /* ignore write errors */ }
}

function clearPersistedSession() {
  try { unlinkSync(SESSION_FILE) } catch { /* already gone */ }
}

export function getBggCookies() {
  if (!sessionCookies) return null
  // Deduplicate by first occurrence (guards against legacy stored sessions with 'deleted' overrides)
  const seen = new Set()
  return sessionCookies.split('; ').filter(c => {
    const name = c.split('=')[0]
    if (seen.has(name)) return false
    seen.add(name)
    return c.split('=').slice(1).join('=') !== 'deleted'
  }).join('; ')
}

export function getBggLoginStatus() {
  return loggedInAs ? { loggedIn: true, username: loggedInAs } : { loggedIn: false }
}

export async function bggLogin(username, password) {
  const res = await fetch('https://boardgamegeek.com/login/api/v1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0 BoardShelf/1.0',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ credentials: { username, password } }),
    redirect: 'manual',
  })

  const bodyText = await res.text().catch(() => '')

  if (!res.ok) {
    let msg = `BGG login failed (HTTP ${res.status})`
    try {
      const json = JSON.parse(bodyText)
      msg = json.errors?.message || json.message || msg
    } catch { /* keep default msg */ }
    throw new Error(msg)
  }

  const setCookies = res.headers.raw()['set-cookie'] || []
  if (!setCookies.length) {
    throw new Error('BGG login: aucun cookie de session reçu — identifiants peut-être invalides')
  }

  // Parse properly: filter deleted/expired cookies, deduplicate (last writer wins)
  const cookieMap = new Map()
  for (const header of setCookies) {
    const [nameValue, ...attrs] = header.split(/;\s*/)
    const eqIdx = nameValue.indexOf('=')
    if (eqIdx === -1) continue
    const name = nameValue.slice(0, eqIdx)
    const value = nameValue.slice(eqIdx + 1)
    const isClearing = value === 'deleted' || attrs.some(a => /^max-age\s*=\s*0$/i.test(a))
    if (isClearing) cookieMap.delete(name)
    else cookieMap.set(name, nameValue)
  }
  sessionCookies = [...cookieMap.values()].join('; ')
  loggedInAs = username
  persistSession()
  console.log(`BGG session started for ${username} — cookies: ${sessionCookies.slice(0, 60)}…`)
  return { ok: true, username }
}

export function bggLogout() {
  sessionCookies = null
  loggedInAs = null
  clearPersistedSession()
}

export async function autoLogin() {
  const u = process.env.BGG_USERNAME
  const p = process.env.BGG_PASSWORD
  if (u && p) {
    try {
      await bggLogin(u, p)
    } catch (err) {
      console.warn(`BGG auto-login failed: ${err.message}`)
    }
  }
}
