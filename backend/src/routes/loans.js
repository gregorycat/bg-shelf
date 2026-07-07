import { Router } from 'express'
import { getDb } from '../db.js'

const router = Router()

// Active loans
router.get('/', (_req, res) => {
  const loans = getDb().prepare(`
    SELECT l.*, g.title as game_title, g.thumbnail_url, f.name as friend_name
    FROM loans l
    JOIN games g ON g.id = l.game_id
    JOIN friends f ON f.id = l.friend_id
    WHERE l.returned_at IS NULL
    ORDER BY l.lent_at DESC
  `).all()
  res.json(loans)
})

// Full history
router.get('/history', (_req, res) => {
  const loans = getDb().prepare(`
    SELECT l.*, g.title as game_title, g.thumbnail_url, f.name as friend_name
    FROM loans l
    JOIN games g ON g.id = l.game_id
    JOIN friends f ON f.id = l.friend_id
    ORDER BY l.lent_at DESC
  `).all()
  res.json(loans)
})

router.post('/', (req, res) => {
  const db = getDb()
  const { game_id, friend_id, notes } = req.body
  if (!game_id || !friend_id) return res.status(400).json({ error: 'game_id and friend_id are required' })

  // Mark game as lent
  db.prepare("UPDATE games SET status = 'lent' WHERE id = ?").run(game_id)
  const result = db.prepare('INSERT INTO loans (game_id, friend_id, notes) VALUES (?,?,?)').run(game_id, friend_id, notes || null)
  res.status(201).json(db.prepare('SELECT * FROM loans WHERE rowid = ?').get(result.lastInsertRowid))
})

router.put('/:id/return', (req, res) => {
  const db = getDb()
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id)
  if (!loan) return res.status(404).json({ error: 'Not found' })
  if (loan.returned_at) return res.status(400).json({ error: 'Already returned' })

  db.prepare("UPDATE loans SET returned_at = datetime('now') WHERE id = ?").run(req.params.id)
  db.prepare("UPDATE games SET status = 'owned' WHERE id = ?").run(loan.game_id)
  res.json(db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id))
})

router.delete('/:id', (req, res) => {
  const result = getDb().prepare('DELETE FROM loans WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: 'Not found' })
  res.json({ ok: true })
})

export default router
