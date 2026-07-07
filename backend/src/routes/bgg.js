import { Router } from 'express'
import fetch from 'node-fetch'
import { getDb } from '../db.js'
import { bggSearch, bggThing, bggThingBatch, bggCollection, bggCollectionRemove } from '../bggFetch.js'
import { bggLogin, bggLogout, getBggLoginStatus } from '../bggAuth.js'

const router = Router()

function localSearch(q) {
  const db = getDb()
  const term = `%${q.replace(/[%_]/g, '\\$&')}%`
  return db.prepare(`
    SELECT bgg_id, title, year_published, bgg_type
    FROM games
    WHERE title LIKE ? ESCAPE '\\'
    ORDER BY
      CASE WHEN lower(title) = lower(?) THEN 0
           WHEN lower(title) LIKE lower(?) ESCAPE '\\' THEN 1
           ELSE 2 END,
      title ASC
    LIMIT 10
  `).all(term, q, `${q.replace(/[%_]/g, '\\$&')}%`)
}

// Extract BGG ID from a URL like https://boardgamegeek.com/boardgame/162886/spirit-island
function extractBggId(q) {
  const urlMatch = q.match(/boardgamegeek\.com\/(?:boardgame|boardgameexpansion)\/(\d+)/i)
  if (urlMatch) return urlMatch[1]
  if (/^\d{3,7}$/.test(q.trim())) return q.trim()
  return null
}

router.get('/search', async (req, res) => {
  const { q } = req.query
  if (!q) return res.status(400).json({ error: 'q is required' })

  // If the query looks like a BGG URL or numeric ID, do a direct lookup
  const directId = extractBggId(q)
  if (directId) {
    try {
      const game = await bggThing(directId)
      return res.json([game])
    } catch (err) {
      return res.status(502).json({ error: err.message })
    }
  }

  try {
    res.json(await bggSearch(q))
  } catch (err) {
    if (err.message.includes('401') || err.message.includes('session') || err.message.includes('HTTP 4')) {
      const results = localSearch(q)
      return res.json({ results, source: 'local' })
    }
    res.status(502).json({ error: err.message })
  }
})

router.get('/game/:bggId', async (req, res) => {
  try {
    res.json(await bggThing(req.params.bggId))
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// Barcode → BGG candidates via gameupc.com (board-game-specific UPC database)
async function gameUpcLookup(upc) {
  const apiKey = process.env.GAMEUPC_API_KEY || 'test_test_test_test_test'
  const r = await fetch(`https://api.gameupc.com/test/upc/${upc}?search_mode=quality`, {
    headers: { 'x-api-key': apiKey, 'User-Agent': 'BoardShelf/1.0' },
  })
  if (!r.ok) throw new Error(`GameUPC HTTP ${r.status}`)
  return r.json()
}

router.post('/barcode', async (req, res) => {
  const { upc } = req.body
  if (!upc) return res.status(400).json({ error: 'upc is required' })

  // 1. Check local EAN cache — fastest path, works offline
  const localGame = getDb().prepare('SELECT id, title, bgg_id FROM games WHERE ean = ?').get(upc)
  if (localGame) {
    return res.json({
      product_name: localGame.title,
      candidates: [{ bgg_id: localGame.bgg_id, title: localGame.title, local_id: localGame.id }],
      source: 'local',
    })
  }

  // 2. GameUPC lookup — returns BGG IDs directly, no second search needed
  try {
    const data = await gameUpcLookup(upc)

    if (!data.bgg_info?.length) {
      return res.json({ product_name: null, candidates: [], source: 'not_found' })
    }

    // Use max(game confidence, best version confidence) for sorting
    const candidates = data.bgg_info.map(g => {
      const versionMax = (g.versions || []).reduce((m, v) => Math.max(m, v.confidence || 0), 0)
      return {
        bgg_id:        String(g.id),
        title:         g.name,
        year_published: g.published ? Number(g.published) : null,
        bgg_type:      'boardgame',
        thumbnail_url: g.thumbnail_url || null,
        confidence:    Math.max(g.confidence || 0, versionMax),
      }
    }).sort((a, b) => b.confidence - a.confidence)

    res.json({
      product_name: candidates[0].title,
      candidates,
      source: data.bgg_info_status === 'verified' ? 'gameupc_verified' : 'gameupc',
    })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// BGG account session management
router.get('/session', (_req, res) => {
  res.json(getBggLoginStatus())
})

router.post('/session', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' })
  try {
    const result = await bggLogin(username, password)
    res.json(result)
  } catch (err) {
    res.status(401).json({ error: err.message })
  }
})

router.delete('/session', (_req, res) => {
  bggLogout()
  res.json({ ok: true })
})

// Sync a BGG user's collection into the local library (SSE — GET for EventSource compatibility)
router.get('/sync', async (req, res) => {
  const { username, mode = 'owned' } = req.query
  if (!username) return res.status(400).json({ error: 'username is required' })
  if (!['owned', 'wishlist', 'all'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be owned | wishlist | all' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    send({ phase: 'collection', status: 'fetching' })
    const items = await bggCollection(username, mode)

    if (!items.length) {
      send({ finished: true, added: 0, skipped: 0, enriched: 0, total: 0 })
      return res.end()
    }

    const db = getDb()
    const upsert = db.prepare(`
      INSERT INTO games
        (bgg_id, title, year_published, thumbnail_url, image_url,
         min_players, max_players, playing_time, bgg_rating, status, bgg_type, bgg_collid)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(bgg_id) DO UPDATE SET bgg_collid = excluded.bgg_collid
    `)

    let added = 0, skipped = 0
    const newBggIds = []

    db.transaction(() => {
      for (const g of items) {
        const before = db.prepare('SELECT id FROM games WHERE bgg_id = ?').get(g.bgg_id)
        upsert.run(
          g.bgg_id, g.title, g.year_published, g.thumbnail_url, g.image_url,
          g.min_players, g.max_players, g.playing_time, g.bgg_rating,
          g.status, g.bgg_type, g.collid || null,
        )
        if (!before) { added++; newBggIds.push(g.bgg_id) }
        else skipped++
      }
    })()

    send({ phase: 'collection', added, skipped, total: items.length })

    if (newBggIds.length === 0) {
      send({ finished: true, added, skipped, enriched: 0, total: items.length })
      return res.end()
    }

    // Phase 2: enrich new games with full metadata (categories, mechanics, description, etc.)
    send({ phase: 'enrich', done: 0, total: newBggIds.length })

    const updateStmt = db.prepare(`
      UPDATE games SET
        title=?, year_published=?, thumbnail_url=?, image_url=?,
        min_players=?, max_players=?, min_playtime=?, max_playtime=?, playing_time=?,
        age=?, categories=?, mechanics=?, designers=?, publishers=?, artists=?,
        description=?, bgg_type=?, parent_game_id=?,
        metadata_refreshed_at=datetime('now')
      WHERE bgg_id=?
    `)
    const getParent = db.prepare('SELECT id FROM games WHERE bgg_id = ?')

    const BATCH = 5
    let enriched = 0

    for (let i = 0; i < newBggIds.length; i += BATCH) {
      const chunk = newBggIds.slice(i, i + BATCH)
      try {
        const metas = await bggThingBatch(chunk)
        db.transaction(() => {
          for (const meta of metas) {
            const parent = meta.parent_bgg_id ? getParent.get(meta.parent_bgg_id) : null
            updateStmt.run(
              meta.title, meta.year_published, meta.thumbnail_url, meta.image_url,
              meta.min_players, meta.max_players, meta.min_playtime, meta.max_playtime, meta.playing_time,
              meta.age, meta.categories, meta.mechanics, meta.designers, meta.publishers, meta.artists,
              meta.description, meta.bgg_type, parent?.id || null,
              meta.bgg_id,
            )
            enriched++
          }
        })()
      } catch (err) {
        console.error(`Enrich batch error (offset ${i}):`, err.message)
        enriched += chunk.length
      }
      send({ phase: 'enrich', done: enriched, total: newBggIds.length })
      if (i + BATCH < newBggIds.length) await new Promise(r => setTimeout(r, 250))
    }

    send({ finished: true, added, skipped, enriched, total: items.length })
    res.end()
  } catch (err) {
    send({ error: err.message })
    res.end()
  }
})

router.delete('/collection/:bggId', async (req, res) => {
  const game = getDb().prepare('SELECT bgg_collid FROM games WHERE bgg_id = ?').get(req.params.bggId)
  if (!game?.bgg_collid) {
    return res.status(400).json({ error: 'Identifiant de collection BGG manquant — relancez une synchronisation.' })
  }
  try {
    await bggCollectionRemove(game.bgg_collid)
    res.json({ ok: true })
  } catch (err) {
    if (err.message.includes('required') || err.message.includes('expirée')) {
      return res.status(401).json({ error: err.message })
    }
    res.status(502).json({ error: err.message })
  }
})

export default router
