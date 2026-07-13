import { Router } from 'express'
import { getDb } from '../db.js'

const router = Router()

function groupPlayersByPlay(db, plays) {
  if (!plays.length) return {}
  const rows = db.prepare(`
    SELECT * FROM play_players WHERE play_id IN (${plays.map(() => '?').join(',')})
  `).all(...plays.map(p => p.id))
  const byPlay = {}
  for (const r of rows) {
    if (!byPlay[r.play_id]) byPlay[r.play_id] = []
    byPlay[r.play_id].push(r)
  }
  return byPlay
}

function groupExpansionsByPlay(db, plays) {
  if (!plays.length) return {}
  const rows = db.prepare(`
    SELECT pe.play_id, g.id, g.title, g.thumbnail_url
    FROM play_expansions pe
    JOIN games g ON g.id = pe.expansion_id
    WHERE pe.play_id IN (${plays.map(() => '?').join(',')})
  `).all(...plays.map(p => p.id))
  const byPlay = {}
  for (const r of rows) {
    if (!byPlay[r.play_id]) byPlay[r.play_id] = []
    byPlay[r.play_id].push({ id: r.id, title: r.title, thumbnail_url: r.thumbnail_url })
  }
  return byPlay
}

router.get('/', (req, res) => {
  const db = getDb()
  const { game_id } = req.query
  let sql = `
    SELECT p.*, g.title AS game_title, g.thumbnail_url AS game_thumbnail
    FROM plays p
    JOIN games g ON g.id = p.game_id
  `
  const params = []
  if (game_id) { sql += ' WHERE p.game_id = ?'; params.push(game_id) }
  sql += ' ORDER BY p.played_at DESC, p.created_at DESC'
  const plays = db.prepare(sql).all(...params)
  const playersByPlay = groupPlayersByPlay(db, plays)
  const expansionsByPlay = groupExpansionsByPlay(db, plays)
  res.json(plays.map(p => ({ ...p, players: playersByPlay[p.id] || [], expansions: expansionsByPlay[p.id] || [] })))
})

router.get('/recent', (req, res) => {
  const db = getDb()
  const limit = Math.min(Number(req.query.limit) || 30, 100)
  const plays = db.prepare(`
    SELECT p.*, g.title AS game_title, g.thumbnail_url AS game_thumbnail
    FROM plays p
    JOIN games g ON g.id = p.game_id
    ORDER BY p.played_at DESC, p.created_at DESC
    LIMIT ?
  `).all(limit)
  if (!plays.length) return res.json([])
  const playersByPlay = groupPlayersByPlay(db, plays)
  const expansionsByPlay = groupExpansionsByPlay(db, plays)
  res.json(plays.map(p => ({ ...p, players: playersByPlay[p.id] || [], expansions: expansionsByPlay[p.id] || [] })))
})

router.post('/', (req, res) => {
  const db = getDb()
  const { game_id, played_at, duration_min, notes, players = [], expansion_ids = [] } = req.body
  if (!game_id || !played_at) return res.status(400).json({ error: 'game_id and played_at are required' })
  if (!db.prepare('SELECT id FROM games WHERE id = ?').get(game_id)) {
    return res.status(404).json({ error: 'Game not found' })
  }

  const result = db.prepare(`
    INSERT INTO plays (game_id, played_at, duration_min, notes) VALUES (?,?,?,?)
  `).run(game_id, played_at, duration_min || null, notes || null)

  const play = db.prepare('SELECT rowid, * FROM plays WHERE rowid = ?').get(result.lastInsertRowid)

  const insertPlayer = db.prepare(`
    INSERT INTO play_players (play_id, player_name, score, winner, score_data) VALUES (?,?,?,?,?)
  `)
  const insertExpansion = db.prepare(`
    INSERT INTO play_expansions (play_id, expansion_id) VALUES (?,?)
  `)
  db.transaction(() => {
    for (const p of players) {
      insertPlayer.run(play.id, p.player_name, p.score ?? null, p.winner ? 1 : 0, p.score_data || null)
    }
    for (const expansionId of expansion_ids) {
      insertExpansion.run(play.id, expansionId)
    }
  })()

  const playerRows = db.prepare('SELECT * FROM play_players WHERE play_id = ?').all(play.id)
  const expansions = groupExpansionsByPlay(db, [play])[play.id] || []
  res.status(201).json({ ...play, players: playerRows, expansions })
})

router.put('/:id', (req, res) => {
  const db = getDb()
  const { id } = req.params
  if (!db.prepare('SELECT id FROM plays WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Play not found' })
  }

  const { played_at, duration_min, notes, players = [], expansion_ids = [] } = req.body
  if (!played_at) return res.status(400).json({ error: 'played_at is required' })

  const insertPlayer = db.prepare(`
    INSERT INTO play_players (play_id, player_name, score, winner, score_data) VALUES (?,?,?,?,?)
  `)
  const insertExpansion = db.prepare(`
    INSERT INTO play_expansions (play_id, expansion_id) VALUES (?,?)
  `)
  db.transaction(() => {
    db.prepare('UPDATE plays SET played_at = ?, duration_min = ?, notes = ? WHERE id = ?')
      .run(played_at, duration_min || null, notes || null, id)
    db.prepare('DELETE FROM play_players WHERE play_id = ?').run(id)
    db.prepare('DELETE FROM play_expansions WHERE play_id = ?').run(id)
    for (const p of players) {
      insertPlayer.run(id, p.player_name, p.score ?? null, p.winner ? 1 : 0, p.score_data || null)
    }
    for (const expansionId of expansion_ids) {
      insertExpansion.run(id, expansionId)
    }
  })()

  const play = db.prepare('SELECT * FROM plays WHERE id = ?').get(id)
  const playerRows = db.prepare('SELECT * FROM play_players WHERE play_id = ?').all(id)
  const expansions = groupExpansionsByPlay(db, [play])[play.id] || []
  res.json({ ...play, players: playerRows, expansions })
})

router.delete('/:id', (req, res) => {
  const result = getDb().prepare('DELETE FROM plays WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: 'Not found' })
  res.json({ ok: true })
})

export default router
