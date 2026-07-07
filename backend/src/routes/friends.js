import { Router } from 'express'
import { getDb } from '../db.js'

const router = Router()

router.get('/', (_req, res) => {
  res.json(getDb().prepare('SELECT * FROM friends ORDER BY name ASC').all())
})

router.post('/', (req, res) => {
  const { name, contact } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  const db = getDb()
  const result = db.prepare('INSERT INTO friends (name, contact) VALUES (?, ?)').run(name, contact || null)
  res.status(201).json(db.prepare('SELECT * FROM friends WHERE rowid = ?').get(result.lastInsertRowid))
})

router.put('/:id', (req, res) => {
  const db = getDb()
  const friend = db.prepare('SELECT id FROM friends WHERE id = ?').get(req.params.id)
  if (!friend) return res.status(404).json({ error: 'Not found' })
  const { name, contact } = req.body
  db.prepare('UPDATE friends SET name = COALESCE(?, name), contact = COALESCE(?, contact) WHERE id = ?')
    .run(name || null, contact || null, req.params.id)
  res.json(db.prepare('SELECT * FROM friends WHERE id = ?').get(req.params.id))
})

router.delete('/:id', (req, res) => {
  const result = getDb().prepare('DELETE FROM friends WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: 'Not found' })
  res.json({ ok: true })
})

export default router
