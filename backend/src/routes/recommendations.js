import { Router } from 'express'
import { getDb } from '../db.js'
import { bggHot } from '../bggFetch.js'

const router = Router()

const CACHE_TTL_HOURS = 24

router.get('/', async (_req, res) => {
  if (!process.env.MISTRAL_API_KEY) {
    return res.json({ enabled: false })
  }

  const db = getDb()

  // Return cached result if fresh
  const cached = db.prepare(`
    SELECT payload, cached_at FROM recommendation_cache
    WHERE (julianday('now') - julianday(cached_at)) * 24 < ?
    ORDER BY cached_at DESC LIMIT 1
  `).get(CACHE_TTL_HOURS)
  if (cached) return res.json({ enabled: true, recommendations: JSON.parse(cached.payload) })

  try {
    const library = db.prepare(`
      SELECT title, year_published, categories, mechanics, bgg_rating
      FROM games WHERE bgg_type = 'boardgame' ORDER BY title
    `).all()

    const hot = await bggHot()

    const libraryText = library.map(g =>
      `- ${g.title} (${g.year_published || '?'}) — catégories: ${g.categories || 'N/A'}`
    ).join('\n')

    const hotText = hot.slice(0, 20).map(g =>
      `- ${g.title} (${g.year_published || '?'}) [BGG ID: ${g.bgg_id}]`
    ).join('\n')

    const { Mistral } = await import('@mistralai/mistralai')
    const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY })

    const completion = await client.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content: `Tu es un conseiller expert en jeux de société.
Analyse la bibliothèque du joueur et propose les jeux récents qu'il devrait acheter en priorité.
Pour chaque recommandation, explique en 2–3 phrases pourquoi ce jeu correspond à ses goûts en citant des titres qu'il possède déjà.
Réponds uniquement en français. Sois précis et enthousiaste.
Réponds UNIQUEMENT avec un tableau JSON valide, sans markdown ni texte autour.
Format: [{"bgg_id": 342942, "title": "Ark Nova", "year": 2021, "rank": 1, "reason": "..."}]`,
        },
        {
          role: 'user',
          content: `Ma bibliothèque :\n${libraryText}\n\nJeux populaires en ce moment :\n${hotText}\n\nPropose 5 recommandations.`,
        },
      ],
      responseFormat: { type: 'json_object' },
    })

    let recommendations = []
    try {
      const raw = completion.choices[0].message.content
      recommendations = JSON.parse(raw)
      if (!Array.isArray(recommendations)) recommendations = recommendations.recommendations || []
    } catch {
      return res.status(502).json({ error: 'Réponse Mistral invalide' })
    }

    db.prepare('DELETE FROM recommendation_cache').run()
    db.prepare('INSERT INTO recommendation_cache (payload) VALUES (?)').run(JSON.stringify(recommendations))

    res.json({ enabled: true, recommendations })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

export default router
