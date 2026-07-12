import fetch from 'node-fetch'
import { parseStringPromise } from 'xml2js'
import { getBggCookies } from './bggAuth.js'

const BGG_BASE = 'https://boardgamegeek.com/xmlapi2'
const RETRY_DELAY_MS = 2000
const MAX_RETRIES = 5

async function bggFetch(url, { auth = false } = {}) {
  const headers = { 'User-Agent': 'Mozilla/5.0 BoardShelf/1.0' }
  if (process.env.BGG_API_KEY) headers['Authorization'] = `Bearer ${process.env.BGG_API_KEY}`
  const cookies = getBggCookies()
  if (auth && !cookies) throw new Error('BGG session required — connectez-vous via Paramètres > Compte BGG')
  if (cookies) headers['Cookie'] = cookies

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, { headers })
    if (res.status === 202) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
      continue
    }
    if (res.status === 401) {
      throw new Error('BGG session expirée ou requise — reconnectez-vous via l\'icône BGG dans la barre latérale')
    }
    if (!res.ok) throw new Error(`BGG HTTP ${res.status}`)
    const xml = await res.text()
    // BGG returns 200 with an <errors> element for invalid usernames
    if (xml.includes('<errors>')) {
      const errMatch = xml.match(/<message>([^<]+)<\/message>/)
      throw new Error(errMatch ? errMatch[1] : 'BGG error')
    }
    return parseStringPromise(xml, { explicitArray: true })
  }
  throw new Error('BGG request timed out after retries')
}

export async function bggSearch(query) {
  const url = `${BGG_BASE}/search?query=${encodeURIComponent(query)}&type=boardgame,boardgameexpansion`
  const data = await bggFetch(url)
  const items = data?.items?.item || []
  return items.map(i => ({
    bgg_id: i.$.id,
    title: i.name?.[0]?.$.value || '',
    year_published: i.yearpublished?.[0]?.$.value ? Number(i.yearpublished[0].$.value) : null,
    bgg_type: i.$.type === 'boardgameexpansion' ? 'boardgameexpansion' : 'boardgame',
  }))
}

// Fetches thumbnails for many ids in a single XML API2 request — used to illustrate search
// results without doing one internal-API request per result (see fetchGeekItem below).
export async function bggThumbnails(bggIds) {
  if (!bggIds.length) return {}
  const url = `${BGG_BASE}/thing?id=${bggIds.join(',')}`
  const data = await bggFetch(url)
  const items = data?.items?.item || []
  const map = {}
  for (const item of items) {
    map[item.$.id] = item.thumbnail?.[0]?.trim() || null
  }
  return map
}

// ── BGG internal JSON API — works without Bearer token, one request per game ──

function parseGeekItem(item) {
  const links = item.links || {}
  const pick = (type) => (links[type] || []).map(l => l.name)
  const parentLink = (links['expandsboardgame'] || [])[0]

  const rawDesc = item.description || null
  const description = rawDesc
    ? rawDesc
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#10;/g, '\n')
        .trim()
    : null

  return {
    bgg_id:        String(item.objectid),
    bgg_type:      item.subtype === 'boardgameexpansion' ? 'boardgameexpansion' : 'boardgame',
    title:         item.name || item.primaryname?.name || '',
    year_published: item.yearpublished ? Number(item.yearpublished) : null,
    thumbnail_url: item.images?.previewthumb || item.images?.thumb || item.imageurl || null,
    image_url:     item.images?.original || item.imageurl || null,
    min_players:   item.minplayers ? Number(item.minplayers) : null,
    max_players:   item.maxplayers ? Number(item.maxplayers) : null,
    min_playtime:  item.minplaytime ? Number(item.minplaytime) : null,
    max_playtime:  item.maxplaytime ? Number(item.maxplaytime) : null,
    playing_time:  item.maxplaytime ? Number(item.maxplaytime) : null,
    age:           item.minage ? Number(item.minage) : null,
    bgg_rating:    null,   // not in geekitems — preserved via COALESCE in SQL
    num_ratings:   null,
    weight:        null,
    bgg_rank:      null,
    categories:    JSON.stringify(pick('boardgamecategory')),
    mechanics:     JSON.stringify(pick('boardgamemechanic')),
    designers:     JSON.stringify(pick('boardgamedesigner')),
    publishers:    JSON.stringify(pick('boardgamepublisher')),
    artists:       JSON.stringify(pick('boardgameartist')),
    language_dep:  null,
    description,
    parent_bgg_id: parentLink ? String(parentLink.objectid) : null,
  }
}

async function fetchGeekItem(bggId) {
  const cookies = getBggCookies()
  const headers = { 'User-Agent': 'Mozilla/5.0 BoardShelf/1.0' }
  if (cookies) headers['Cookie'] = cookies

  const url = `https://boardgamegeek.com/api/geekitems?nosession=1&ajax=1&action=get&objecttype=thing&objectid=${bggId}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`BGG geekitems HTTP ${res.status} for game ${bggId}`)
  const data = await res.json()
  if (!data.item) throw new Error(`BGG game ${bggId} not found`)
  return parseGeekItem(data.item)
}

export async function bggThing(bggId) {
  return fetchGeekItem(bggId)
}

export async function bggThingBatch(bggIds) {
  const CONCURRENT = 5
  const results = []
  for (let i = 0; i < bggIds.length; i += CONCURRENT) {
    const chunk = bggIds.slice(i, i + CONCURRENT)
    const batch = await Promise.all(chunk.map(id => fetchGeekItem(String(id))))
    results.push(...batch)
    if (i + CONCURRENT < bggIds.length) {
      await new Promise(r => setTimeout(r, 250))
    }
  }
  return results
}

// Fetches a user's BGG collection. status: 'owned' | 'wishlist' | 'all'
export async function bggCollection(username, status = 'owned') {
  const params = new URLSearchParams({ username, stats: '1' })
  if (status === 'owned')    params.set('own', '1')
  if (status === 'wishlist') params.set('wishlist', '1')
  // 'all' fetches everything (own + wishlist + more) — filter client-side
  const url = `${BGG_BASE}/collection?${params}`
  // Try unauthenticated first (works for public collections), then with session
  let data
  try {
    data = await bggFetch(url, { auth: false })
  } catch (err) {
    if (!err.message.includes('401')) throw err
    data = await bggFetch(url, { auth: true })
  }
  const items = data?.items?.item || []

  return items
    .filter(i => {
      const s = i.status?.[0]?.$
      if (!s) return false
      if (status === 'owned')    return s.own === '1'
      if (status === 'wishlist') return s.wishlist === '1'
      return s.own === '1' || s.wishlist === '1'
    })
    .map(i => {
      const s = i.status?.[0]?.$
      const stats = i.stats?.[0]
      const rating = stats?.rating?.[0]?.average?.[0]?.$.value
      return {
        bgg_id:        String(i.$.objectid),
        collid:        i.$.collid || null,
        bgg_type:      i.$.subtype === 'boardgameexpansion' ? 'boardgameexpansion' : 'boardgame',
        title:         i.name?.[0]?._ || i.name?.[0] || '',
        year_published: i.yearpublished?.[0] ? Number(i.yearpublished[0]) : null,
        thumbnail_url: i.thumbnail?.[0]?.trim() || null,
        image_url:     i.image?.[0]?.trim() || null,
        min_players:   stats?.$.minplayers ? Number(stats.$.minplayers) : null,
        max_players:   stats?.$.maxplayers ? Number(stats.$.maxplayers) : null,
        playing_time:  stats?.$.playingtime ? Number(stats.$.playingtime) : null,
        bgg_rating:    rating && rating !== 'N/A' ? Number(rating) : null,
        status:        s?.own === '1' ? 'owned' : 'wishlist',
      }
    })
}

// Resolve a BGG video ID to a YouTube video ID via /api/videos/{id}
async function resolveVideoId(bggVideoId) {
  const headers = { 'User-Agent': 'Mozilla/5.0 BoardShelf/1.0' }
  const cookies = getBggCookies()
  if (cookies) headers['Cookie'] = cookies
  const r = await fetch(`https://boardgamegeek.com/api/videos/${bggVideoId}`, { headers })
  if (!r.ok) return null
  const data = await r.json()
  if (data?.video?.host === 'youtube' && data.video.id) return data.video.id
  return null
}

// Find a how-to-play YouTube video for a BGG game.
// Priority: howtoplay_videoid > instructional_videoid > gallery instructional listing
export async function bggHowToPlay(bggId) {
  const headers = { 'User-Agent': 'Mozilla/5.0 BoardShelf/1.0' }
  const cookies = getBggCookies()
  if (cookies) headers['Cookie'] = cookies

  // 1. Get featured video IDs from geekitems
  const itemUrl = `https://boardgamegeek.com/api/geekitems?nosession=1&ajax=1&action=get&objecttype=thing&objectid=${bggId}`
  const r = await fetch(itemUrl, { headers })
  if (!r.ok) throw new Error(`geekitems HTTP ${r.status}`)
  const data = await r.json()
  const item = data.item

  for (const field of ['howtoplay_videoid', 'instructional_videoid', 'summary_videoid']) {
    if (item[field]) {
      const ytId = await resolveVideoId(item[field])
      if (ytId) return ytId
    }
  }

  // 2. Fallback: first instructional video from the game's video gallery
  const galleryUrl = `https://boardgamegeek.com/api/videos?objectid=${bggId}&objecttype=thing&pageid=1&gallery=instructional`
  const r2 = await fetch(galleryUrl, { headers })
  if (r2.ok) {
    const gData = await r2.json()
    const videos = gData.videos || []
    for (const v of videos) {
      if (v.videohost === 'youtube' && v.extvideoid) return v.extvideoid
    }
  }

  return null
}

export async function bggCollectionRemove(collid) {
  const cookies = getBggCookies()
  if (!cookies) throw new Error('BGG session required')

  const body = new URLSearchParams({ action: 'delete', collid: String(collid), ajax: '1' })

  const res = await fetch('https://boardgamegeek.com/geekcollection.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 BoardShelf/1.0',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body.toString(),
  })

  if (res.status === 401) throw new Error('BGG session expirée — reconnectez-vous')
  if (!res.ok) throw new Error(`BGG HTTP ${res.status}`)

  const text = await res.text()
  if (text.includes('You must') && text.includes('login')) {
    throw new Error('BGG session expirée — reconnectez-vous')
  }
}

// Marks a game as owned in the logged-in user's BGG collection. Uses BGG's internal (undocumented)
// collection editor endpoint — same one the site's own "Own this" checkbox posts to.
export async function bggCollectionAdd(bggId) {
  const cookies = getBggCookies()
  if (!cookies) return null

  const body = new URLSearchParams({
    action: 'savedata',
    fieldname: 'status',
    objecttype: 'thing',
    objectid: String(bggId),
    collid: '',
    own: '1',
    ajax: '1',
  })

  const res = await fetch('https://boardgamegeek.com/geekcollection.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
      'User-Agent': 'Mozilla/5.0 BoardShelf/1.0',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body.toString(),
  })

  if (res.status === 401) throw new Error('BGG session expirée — reconnectez-vous')
  if (!res.ok) throw new Error(`BGG HTTP ${res.status}`)

  const text = await res.text()
  if (text.includes('You must') && text.includes('login')) {
    throw new Error('BGG session expirée — reconnectez-vous')
  }
  return text
}

export async function bggHot() {
  const url = `${BGG_BASE}/hot?type=boardgame`
  const data = await bggFetch(url)
  const items = data?.items?.item || []
  return items.slice(0, 50).map(i => ({
    bgg_id: i.$.id,
    rank: Number(i.$.rank),
    title: i.name?.[0]?.$.value || '',
    year_published: i.yearpublished?.[0]?.$.value ? Number(i.yearpublished[0].$.value) : null,
    thumbnail_url: i.thumbnail?.[0]?.$.value || null,
  }))
}
