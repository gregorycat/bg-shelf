import { Router } from 'express'
import { getDb } from '../db.js'
import { bggThing, bggThingBatch, bggHowToPlay } from '../bggFetch.js'

const router = Router()

const UPDATABLE_FIELDS = [
  'title','year_published','thumbnail_url','image_url',
  'min_players','max_players','min_playtime','max_playtime','playing_time',
  'bgg_rating','num_ratings','weight','bgg_rank','age',
  'categories','mechanics','designers','publishers','artists',
  'language_dep','description','notes','status','bgg_type','parent_game_id','ean','scoring_guide','score_sheet_template','strategy_guide',
]

function applyMeta(stmt, meta, parentGameId, localId) {
  stmt.run(
    meta.title, meta.year_published, meta.thumbnail_url, meta.image_url,
    meta.min_players, meta.max_players, meta.min_playtime, meta.max_playtime, meta.playing_time,
    meta.bgg_rating, meta.num_ratings, meta.weight, meta.bgg_rank, meta.age,
    meta.categories, meta.mechanics, meta.designers, meta.publishers, meta.artists,
    meta.language_dep, meta.description, meta.bgg_type,
    parentGameId, localId,
  )
}

router.get('/', (req, res) => {
  const db = getDb()
  const { status, type } = req.query
  let sql = 'SELECT * FROM games WHERE 1=1'
  const params = []
  if (status) { sql += ' AND status = ?'; params.push(status) }
  if (type)   { sql += ' AND bgg_type = ?'; params.push(type) }
  sql += ' ORDER BY title ASC'
  res.json(db.prepare(sql).all(...params))
})

// Must be before /:id to avoid being captured as a dynamic segment
router.get('/refresh-all', async (req, res) => {
  const db = getDb()
  const allGames = db.prepare(
    'SELECT id, bgg_id FROM games WHERE bgg_id IS NOT NULL ORDER BY title ASC'
  ).all()

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  const BATCH = 20
  const stmt = db.prepare(`
    UPDATE games SET
      title=?, year_published=?, thumbnail_url=?, image_url=?,
      min_players=?, max_players=?, min_playtime=?, max_playtime=?, playing_time=?,
      bgg_rating=COALESCE(?,bgg_rating), num_ratings=COALESCE(?,num_ratings),
      weight=COALESCE(?,weight), bgg_rank=COALESCE(?,bgg_rank), age=?,
      categories=?, mechanics=?, designers=?, publishers=?, artists=?,
      language_dep=COALESCE(?,language_dep), description=?, bgg_type=?,
      parent_game_id=?, metadata_refreshed_at=datetime('now')
    WHERE id=?
  `)

  let done = 0, errors = 0
  const total = allGames.length

  for (let i = 0; i < allGames.length; i += BATCH) {
    const batch = allGames.slice(i, i + BATCH)
    try {
      const metas = await bggThingBatch(batch.map(g => g.bgg_id))

      db.transaction(() => {
        for (const meta of metas) {
          const localGame = batch.find(g => g.bgg_id === meta.bgg_id)
          if (!localGame) continue
          let parentGameId = null
          if (meta.parent_bgg_id) {
            const parent = db.prepare('SELECT id FROM games WHERE bgg_id = ?').get(meta.parent_bgg_id)
            if (parent) parentGameId = parent.id
          }
          applyMeta(stmt, meta, parentGameId, localGame.id)
        }
      })()

      done += metas.length
      send({ done, total, errors })
    } catch (err) {
      console.error(`Batch refresh failed (offset ${i}):`, err.message)
      errors += batch.length
      done += batch.length
      send({ done, total, errors, lastError: err.message })
      // Stop entirely on the first batch failure — likely a BGG-wide issue
      break
    }

    await new Promise(r => setTimeout(r, 500))
  }

  send({ done, total, errors, finished: true })
  res.end()
})

router.get('/:id', (req, res) => {
  const game = getDb().prepare('SELECT * FROM games WHERE id = ?').get(req.params.id)
  if (!game) return res.status(404).json({ error: 'Not found' })
  res.json(game)
})

router.post('/', (req, res) => {
  const db = getDb()
  const { bgg_id, title, status, bgg_type, parent_game_id, notes, ean, ...rest } = req.body
  if (!title) return res.status(400).json({ error: 'title is required' })

  const result = db.prepare(`
    INSERT INTO games
      (bgg_id, title, year_published, thumbnail_url, image_url,
       min_players, max_players, playing_time, bgg_rating,
       categories, mechanics, description, notes, status, bgg_type, parent_game_id, ean)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    bgg_id || null, title,
    rest.year_published || null, rest.thumbnail_url || null, rest.image_url || null,
    rest.min_players || null, rest.max_players || null, rest.playing_time || null,
    rest.bgg_rating || null,
    rest.categories ? (Array.isArray(rest.categories) ? JSON.stringify(rest.categories) : rest.categories) : null,
    rest.mechanics  ? (Array.isArray(rest.mechanics)  ? JSON.stringify(rest.mechanics)  : rest.mechanics)  : null,
    rest.description || null, notes || null,
    status || 'owned', bgg_type || 'boardgame', parent_game_id || null, ean || null,
  )
  res.status(201).json(db.prepare('SELECT * FROM games WHERE rowid = ?').get(result.lastInsertRowid))
})

router.put('/:id', (req, res) => {
  const db = getDb()
  if (!db.prepare('SELECT id FROM games WHERE id = ?').get(req.params.id)) {
    return res.status(404).json({ error: 'Not found' })
  }
  const updates = [], params = []
  for (const f of UPDATABLE_FIELDS) {
    if (f in req.body) {
      updates.push(`${f} = ?`)
      params.push(['categories','mechanics','designers','publishers','artists'].includes(f) && Array.isArray(req.body[f])
        ? JSON.stringify(req.body[f]) : req.body[f])
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' })
  params.push(req.params.id)
  db.prepare(`UPDATE games SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  res.json(db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id))
})

router.delete('/:id', (req, res) => {
  const result = getDb().prepare('DELETE FROM games WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: 'Not found' })
  res.json({ ok: true })
})

// Get (and cache) a how-to-play video for a game
router.get('/:id/howtoplay', async (req, res) => {
  const db = getDb()
  const game = db.prepare('SELECT id, bgg_id, howtoplay_video FROM games WHERE id = ?').get(req.params.id)
  if (!game) return res.status(404).json({ error: 'Not found' })

  if (game.howtoplay_video) return res.json({ youtube_id: game.howtoplay_video })
  if (!game.bgg_id) return res.json({ youtube_id: null })

  try {
    const ytId = await bggHowToPlay(game.bgg_id)
    db.prepare('UPDATE games SET howtoplay_video = ? WHERE id = ?').run(ytId || '', game.id)
    res.json({ youtube_id: ytId || null })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// Generate a scoring guide via Mistral AI
router.post('/:id/scoring-guide/generate', async (req, res) => {
  if (!process.env.MISTRAL_API_KEY) {
    return res.status(503).json({ error: 'Clé API Mistral non configurée.' })
  }
  const game = getDb().prepare(
    'SELECT title, min_players, max_players, categories, mechanics, description, score_sheet_template FROM games WHERE id = ?'
  ).get(req.params.id)
  if (!game) return res.status(404).json({ error: 'Not found' })

  const cats = (() => { try { return JSON.parse(game.categories || '[]') } catch { return [] } })()
  const mechs = (() => { try { return JSON.parse(game.mechanics || '[]') } catch { return [] } })()

  const players = game.min_players && game.max_players
    ? `${game.min_players}–${game.max_players} joueurs`
    : null

  const desc = game.description ? game.description.slice(0, 600).replace(/\n+/g, ' ') : null

  const context = [
    players,
    cats.length  ? `Catégories : ${cats.join(', ')}` : null,
    mechs.length ? `Mécaniques : ${mechs.join(', ')}` : null,
    desc         ? `Description : ${desc}` : null,
  ].filter(Boolean).join('\n')

  // Format score sheet template as a readable structure for the prompt
  const sheetContext = (() => {
    if (!game.score_sheet_template) return null
    try {
      const tmpl = JSON.parse(game.score_sheet_template)
      if (!tmpl.sections?.length) return null
      const lines = []
      for (const sec of tmpl.sections) {
        if (sec.label) lines.push(`Section « ${sec.label} » :`)
        for (const f of sec.fields) {
          if (!f.label) continue
          if (f.type === 'number') {
            const mult = (f.multiplier || 1) !== 1
              ? ` — chaque unité vaut ${f.multiplier} pt(s)`
              : ''
            lines.push(`  • ${f.label} (valeur numérique${mult})`)
          } else if (f.type === 'checkbox') {
            lines.push(`  • ${f.label} (case à cocher — vaut ${f.points || 0} pt(s) si cochée)`)
          }
        }
      }
      return lines.length ? lines.join('\n') : null
    } catch { return null }
  })()

  try {
    const { Mistral } = await import('@mistralai/mistralai')
    const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY })

    const { rulesInput } = req.body

    const sheetInstruction = sheetContext
      ? `\n\nFEUILLE DE SCORE configurée pour ce jeu :\n${sheetContext}\n\nTon guide doit expliquer comment scorer chacun de ces champs en particulier.`
      : ''

    const messages = rulesInput?.trim()
      ? [
          {
            role: 'system',
            content: `Tu es un expert en mise en forme de règles de jeux de société.
Reformate le texte de règles fourni en un guide de calcul des scores clair, structuré en markdown.

RÈGLES ABSOLUES :
- N'ajoute AUCUNE information absente du texte fourni.
- Ne modifie pas les valeurs de points, conditions ou mécanismes du texte original.
- Si le texte est incomplet sur un point, laisse-le tel quel — n'invente pas le reste.

STRUCTURE :
- ## par grande catégorie ou étape de décompte (utilise les noms de la feuille de score si elle est fournie)
- Listes à puces pour les détails
- **Gras** pour les valeurs et noms de catégories clés
- Section finale ## Total avec les étapes de sommation

En français. Uniquement le guide reformaté, sans introduction ni conclusion.${sheetInstruction}`,
          },
          {
            role: 'user',
            content: `Jeu : ${game.title}\n\nRègles de score à reformater :\n${rulesInput.trim()}`,
          },
        ]
      : [
          {
            role: 'system',
            content: `Tu es un expert en jeux de société. Génère un guide de calcul des scores en markdown pour aider les joueurs à compter leurs points en fin de partie.

RÈGLES ABSOLUES — ne pas déroger :
1. Chaque valeur numérique que tu écris doit être une règle réelle et certaine de CE jeu. Si tu as le moindre doute sur une valeur, écris « (voir la carte) » à la place du chiffre.
2. Si le jeu utilise des effets de cartes individuels (variable d'une carte à l'autre), décris uniquement le PROCESSUS : comment identifier quelles cartes scorer, dans quel ordre, et comment les additionner.
3. N'invente aucune catégorie de bonus, pénalité ou mécanisme qui n'existe pas dans le jeu.
4. En cas d'incertitude sur une règle entière, omets-la plutôt que de l'inventer.

STRUCTURE :
- ## pour chaque grande étape ou catégorie du décompte final (utilise les noms de la feuille de score si elle est fournie)
- Listes à puces pour les sous-étapes ou précisions
- **Gras** pour les noms de catégories et les valeurs certaines
- Section finale ## Total avec les étapes de sommation

En français. Moins de 400 mots. Uniquement le guide.${sheetInstruction}`,
          },
          {
            role: 'user',
            content: `Jeu : ${game.title}\n${context}`,
          },
        ]

    const completion = await client.chat.complete({
      model: 'mistral-large-latest',
      messages,
    })

    let text = completion.choices[0].message.content?.trim() || ''
    // Strip wrapping ```markdown ... ``` or ``` ... ``` fences if present
    text = text.replace(/^```(?:markdown)?\n?/i, '').replace(/\n?```\s*$/, '').trim()
    res.json({ text })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// Generate a strategy guide via Mistral AI
router.post('/:id/strategy-guide/generate', async (req, res) => {
  if (!process.env.MISTRAL_API_KEY) {
    return res.status(503).json({ error: 'Clé API Mistral non configurée.' })
  }
  const game = getDb().prepare(
    'SELECT title, min_players, max_players, weight, categories, mechanics, description, scoring_guide FROM games WHERE id = ?'
  ).get(req.params.id)
  if (!game) return res.status(404).json({ error: 'Not found' })

  const cats = (() => { try { return JSON.parse(game.categories || '[]') } catch { return [] } })()
  const mechs = (() => { try { return JSON.parse(game.mechanics || '[]') } catch { return [] } })()

  const players = game.min_players && game.max_players
    ? `${game.min_players}–${game.max_players} joueurs`
    : null

  const desc = game.description ? game.description.slice(0, 600).replace(/\n+/g, ' ') : null

  const context = [
    players,
    game.weight ? `Complexité BGG : ${game.weight}/5` : null,
    cats.length  ? `Catégories : ${cats.join(', ')}` : null,
    mechs.length ? `Mécaniques : ${mechs.join(', ')}` : null,
    desc         ? `Description : ${desc}` : null,
  ].filter(Boolean).join('\n')

  const scoringInstruction = game.scoring_guide
    ? `\n\nGUIDE DE CALCUL DES SCORES existant pour ce jeu (base tes conseils dessus, notamment pour repérer les sources de points les plus rentables) :\n${game.scoring_guide}`
    : ''

  try {
    const { Mistral } = await import('@mistralai/mistralai')
    const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY })

    const messages = [
      {
        role: 'system',
        content: `Tu es un expert en stratégie de jeux de société. Génère un guide de stratégie en markdown pour aider un joueur à gagner à ce jeu ou à optimiser ses points de victoire.

RÈGLES ABSOLUES — ne pas déroger :
1. Ne répète pas les règles de base ni le calcul des scores : concentre-toi uniquement sur des conseils stratégiques concrets et actionnables.
2. Adapte tes conseils aux mécaniques et catégories réelles de CE jeu — n'invente aucune mécanique ou règle qui n'existe pas.
3. Si tu as un doute sur un détail précis du jeu, reste général plutôt que d'inventer un chiffre ou une règle.
4. Mentionne si pertinent : le timing (début/milieu/fin de partie), les pièges courants à éviter, et comment prioriser les sources de points de victoire.

STRUCTURE :
- ## pour chaque grand axe stratégique (ex. Début de partie, Optimisation des points, Interaction avec les autres joueurs, Pièges à éviter)
- Listes à puces pour les conseils concrets
- **Gras** pour les points clés

En français. Moins de 400 mots. Uniquement le guide, sans introduction ni conclusion.${scoringInstruction}`,
      },
      {
        role: 'user',
        content: `Jeu : ${game.title}\n${context}`,
      },
    ]

    const completion = await client.chat.complete({
      model: 'mistral-large-latest',
      messages,
    })

    let text = completion.choices[0].message.content?.trim() || ''
    text = text.replace(/^```(?:markdown)?\n?/i, '').replace(/\n?```\s*$/, '').trim()
    res.json({ text })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// Pick a game from the library based on a natural-language prompt
router.post('/pick', async (req, res) => {
  if (!process.env.MISTRAL_API_KEY) {
    return res.status(503).json({ error: 'Clé API Mistral non configurée.' })
  }
  const { prompt, exclude = [] } = req.body
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' })

  const db = getDb()
  const excludeSet = new Set(Array.isArray(exclude) ? exclude : [])
  const allGames = db.prepare(
    `SELECT id, title, min_players, max_players, playing_time, min_playtime, max_playtime,
            weight, categories, mechanics, status, bgg_type
     FROM games
     WHERE status IN ('owned','lent') AND bgg_type = 'boardgame'
     ORDER BY title ASC`
  ).all().filter(g => !excludeSet.has(g.id))

  if (!allGames.length) return res.status(404).json({ error: 'Aucun jeu dans la bibliothèque.' })

  // Build a compact game list for the prompt
  const gameList = allGames.map(g => {
    const players = g.min_players && g.max_players
      ? g.min_players === g.max_players ? `${g.min_players}j` : `${g.min_players}-${g.max_players}j`
      : ''
    const time = (() => {
      if (g.min_playtime && g.max_playtime && g.min_playtime !== g.max_playtime)
        return `${g.min_playtime}-${g.max_playtime}min`
      if (g.playing_time) return `${g.playing_time}min`
      return ''
    })()
    const weight = g.weight ? `★${g.weight.toFixed(1)}` : ''
    const cats = (() => { try { return JSON.parse(g.categories || '[]').slice(0, 3).join('/') } catch { return '' } })()
    const mechs = (() => { try { return JSON.parse(g.mechanics || '[]').slice(0, 3).join('/') } catch { return '' } })()
    const attrs = [players, time, weight, cats, mechs].filter(Boolean).join(', ')
    return `[${g.id}] ${g.title}${attrs ? ' — ' + attrs : ''}`
  }).join('\n')

  try {
    const { Mistral } = await import('@mistralai/mistralai')
    const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY })

    const completion = await client.chat.complete({
      model: 'mistral-large-latest',
      messages: [
        {
          role: 'system',
          content: `Tu es un expert en jeux de société qui aide un joueur à choisir un jeu dans sa collection.
Analyse la bibliothèque et la demande du joueur, puis choisis le jeu qui correspond le mieux.

RÈGLES ABSOLUES :
- Tu dois choisir un jeu PRÉSENT dans la liste fournie — n'invente aucun titre.
- Réponds UNIQUEMENT en JSON valide, sans texte avant ou après, sans bloc markdown.
- Format exact : {"game_id":"...","title":"...","reason":"..."}
- La raison : 2-3 phrases en français, convaincantes, qui expliquent pourquoi ce jeu correspond à la demande.`,
        },
        {
          role: 'user',
          content: `Demande : ${prompt.trim()}\n\nBibliothèque disponible :\n${gameList}`,
        },
      ],
    })

    let raw = completion.choices[0].message.content?.trim() || ''
    // Strip possible markdown fences
    raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```\s*$/, '').trim()

    let pick
    try { pick = JSON.parse(raw) } catch {
      return res.status(502).json({ error: 'Réponse invalide du modèle.', raw })
    }

    // Verify the picked game actually exists
    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(pick.game_id)
    if (!game) {
      // Try matching by title as fallback
      const byTitle = db.prepare('SELECT * FROM games WHERE lower(title) = lower(?)').get(pick.title || '')
      if (!byTitle) return res.status(502).json({ error: 'Le modèle a choisi un jeu introuvable.', pick })
      return res.json({ game: byTitle, reason: pick.reason })
    }

    res.json({ game, reason: pick.reason })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// Refresh one game's metadata from BGG
router.post('/:id/refresh', async (req, res) => {
  const db = getDb()
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id)
  if (!game) return res.status(404).json({ error: 'Not found' })
  if (!game.bgg_id) return res.status(400).json({ error: 'No BGG ID linked' })

  try {
    const meta = await bggThing(game.bgg_id)
    let parentGameId = game.parent_game_id
    if (meta.parent_bgg_id) {
      const parent = db.prepare('SELECT id FROM games WHERE bgg_id = ?').get(meta.parent_bgg_id)
      if (parent) parentGameId = parent.id
    }

    const stmt = db.prepare(`
      UPDATE games SET
        title=?, year_published=?, thumbnail_url=?, image_url=?,
        min_players=?, max_players=?, min_playtime=?, max_playtime=?, playing_time=?,
        bgg_rating=COALESCE(?,bgg_rating), num_ratings=COALESCE(?,num_ratings),
        weight=COALESCE(?,weight), bgg_rank=COALESCE(?,bgg_rank), age=?,
        categories=?, mechanics=?, designers=?, publishers=?, artists=?,
        language_dep=COALESCE(?,language_dep), description=?, bgg_type=?,
        parent_game_id=?, metadata_refreshed_at=datetime('now')
      WHERE id=?
    `)
    applyMeta(stmt, meta, parentGameId, req.params.id)
    res.json(db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id))
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

export default router
