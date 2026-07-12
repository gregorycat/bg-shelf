import express from 'express'
import { fileURLToPath } from 'url'
import path from 'path'
import { existsSync } from 'fs'
import { initDb } from './db.js'
import { autoLogin } from './bggAuth.js'
import { requireGoogleAuth } from './middleware/auth.js'
import gamesRouter from './routes/games.js'
import friendsRouter from './routes/friends.js'
import loansRouter from './routes/loans.js'
import bggRouter from './routes/bgg.js'
import recommendationsRouter from './routes/recommendations.js'
import playsRouter from './routes/plays.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json())

// CORS for local dev
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

initDb()
autoLogin()

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.use('/api', requireGoogleAuth)

app.use('/api/games', gamesRouter)
app.use('/api/friends', friendsRouter)
app.use('/api/loans', loansRouter)
app.use('/api/bgg', bggRouter)
app.use('/api/recommendations', recommendationsRouter)
app.use('/api/plays', playsRouter)

// Serve built frontend (production / mobile access)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, '../../frontend/dist')
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

// Listen on all interfaces so the app is reachable on the local network
app.listen(PORT, '0.0.0.0', () => console.log(`BoardShelf backend listening on :${PORT}`))
