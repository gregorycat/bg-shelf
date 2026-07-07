import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLibraryStore } from '../stores/useLibraryStore.js'
import styles from './BrowsePage.module.css'

const parseArr = s => { try { return JSON.parse(s) } catch { return [] } }

function strHash(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return h >>> 0
}

function gameHue(title) {
  return strHash(title) % 360
}

function abbr(title) {
  const words = title.split(/[\s:–\-]+/).filter(w => w.length > 1)
  if (words.length <= 1) return title.slice(0, 2).toUpperCase()
  return words.slice(0, 3).map(w => w[0].toUpperCase()).join('').slice(0, 3)
}

function buildCategories(games) {
  const main    = games.filter(g => g.bgg_type === 'boardgame')
  const owned   = main.filter(g => g.status !== 'wishlist')

  const hasMech = (g, term) => parseArr(g.mechanics).some(m => m.toLowerCase().includes(term))
  const hasCat  = (g, term) => parseArr(g.categories).some(c => c.toLowerCase().includes(term))

  return [
    {
      label: 'Mes coups de cœur',
      games: [...owned].sort((a, b) => (b.bgg_rating ?? 0) - (a.bgg_rating ?? 0)).slice(0, 14),
    },
    {
      label: 'Coopératifs',
      games: owned.filter(g => hasMech(g, 'cooperative') || hasCat(g, 'cooperative')),
    },
    {
      label: 'Rapides · moins de 30 min',
      games: owned
        .filter(g => g.playing_time > 0 && g.playing_time <= 30)
        .sort((a, b) => a.playing_time - b.playing_time),
    },
    {
      label: 'Jeux complexes',
      games: owned
        .filter(g => (g.weight && g.weight >= 3.5) || (g.playing_time && g.playing_time >= 120))
        .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)),
    },
    {
      label: 'Jeux de cartes',
      games: owned.filter(g =>
        hasCat(g, 'card game') ||
        hasMech(g, 'hand management') ||
        hasMech(g, 'card drafting')
      ),
    },
    {
      label: 'Pour jouer en famille',
      games: owned.filter(g =>
        g.max_players >= 4 && (!g.playing_time || g.playing_time <= 90)
      ),
    },
    {
      label: 'Prêtés en ce moment',
      games: main.filter(g => g.status === 'lent'),
    },
    {
      label: 'Liste de souhaits',
      games: main.filter(g => g.status === 'wishlist'),
    },
  ].filter(cat => cat.games.length >= 2)
}

function StarIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function playerRange(g) {
  if (!g.min_players) return null
  return g.min_players === g.max_players ? `${g.min_players}` : `${g.min_players}–${g.max_players}`
}

function BrowseCard({ game, onClick }) {
  const hue = gameHue(game.title)
  const hasThumbnail = !!(game.image_url || game.thumbnail_url)
  const players = playerRange(game)

  return (
    <div className={styles.gc} onClick={onClick}>
      <div className={styles.gcInner}>
        <div
          className={styles.gcCover}
          style={hasThumbnail ? {} : {
            background: `linear-gradient(150deg, hsl(${hue},45%,26%), hsl(${hue},42%,13%))`,
          }}
        >
          {hasThumbnail
            ? <img src={game.image_url || game.thumbnail_url} alt={game.title} className={styles.gcImg} loading="lazy" />
            : (
              <>
                <div className={styles.gcSheen} />
                <span className={styles.gcAbbr}>{abbr(game.title)}</span>
              </>
            )
          }
          {game.status === 'lent'     && <span className={`${styles.gcBadge} ${styles.bl}`}>Prêté</span>}
          {game.status === 'wishlist' && <span className={`${styles.gcBadge} ${styles.bw}`}>Souhaité</span>}
          <div className={styles.gcOv}>
            {game.bgg_rating != null && (
              <div className={styles.gcOvRating}>
                <StarIcon /> {game.bgg_rating.toFixed(1)}
              </div>
            )}
            <div className={styles.gcOvMeta}>
              {players && `${players} joueurs`}{players && game.playing_time ? ' · ' : ''}{game.playing_time ? `${game.playing_time} min` : ''}
            </div>
            <button className={styles.gcOvBtn}>Voir la fiche</button>
          </div>
        </div>
        <div className={styles.gcFoot}>
          <div className={styles.gcTitle}>{game.title}</div>
          {game.year_published && <div className={styles.gcYear}>{game.year_published}</div>}
        </div>
      </div>
    </div>
  )
}

export default function BrowsePage() {
  const { fetch, games, loading } = useLibraryStore()
  const navigate = useNavigate()

  useEffect(() => { if (games.length === 0) fetch() }, [])

  const mainGames = games.filter(g => g.bgg_type === 'boardgame')
  const categories = buildCategories(games)

  const hero = [...mainGames]
    .filter(g => g.status !== 'wishlist')
    .sort((a, b) => (b.bgg_rating ?? 0) - (a.bgg_rating ?? 0))[0]

  const heroTags = hero ? parseArr(hero.categories).slice(0, 3) : []
  const heroHue  = hero ? gameHue(hero.title) : 150
  const players  = hero ? playerRange(hero) : null

  const heroDesc = hero?.description
    ? hero.description.replace(/<[^>]+>/g, '').trim().slice(0, 230)
    : null

  return (
    <div className={styles.page}>
      {/* ── Hero ─────────────────────────────────────── */}
      {hero && (
        <section
          className={styles.hero}
          style={{
            backgroundImage: hero.image_url
              ? `url(${JSON.stringify(hero.image_url)})`
              : `radial-gradient(ellipse at 68% 38%, hsl(${heroHue},40%,20%) 0%, hsl(${heroHue},35%,7%) 70%)`,
          }}
        >
          <div className={styles.heroAtmos} />
          <div className={styles.heroVeil} />
          <div className={styles.heroFade} />
          <div className={styles.heroContent}>
            {heroTags.length > 0 && (
              <div className={styles.heroEyebrow}>
                {heroTags.map(t => <span key={t} className={styles.heroTag}>{t}</span>)}
              </div>
            )}
            <h1 className={styles.heroTitle}>{hero.title}</h1>
            <div className={styles.heroStats}>
              {hero.bgg_rating != null && (
                <span className={styles.heroRating}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  {hero.bgg_rating.toFixed(1)} sur BGG
                </span>
              )}
              {hero.year_published && <><span className={styles.heroSep}>·</span><span className={styles.heroStat}>{hero.year_published}</span></>}
              {players && <><span className={styles.heroSep}>·</span><span className={styles.heroStat}>{players} joueurs</span></>}
              {hero.playing_time && <><span className={styles.heroSep}>·</span><span className={styles.heroStat}>{hero.playing_time} min</span></>}
            </div>
            {heroDesc && <p className={styles.heroDesc}>{heroDesc}{hero.description.length > 230 ? '…' : ''}</p>}
            <div className={styles.heroBtns}>
              <button className={styles.hbtnP} onClick={() => navigate(`/library/${hero.id}`)}>
                Voir la fiche
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Category rows ─────────────────────────── */}
      <div className={styles.browse}>
        {loading && games.length === 0 && (
          <p className={styles.state}>Chargement…</p>
        )}
        {!loading && games.length === 0 && (
          <p className={styles.state}>Aucun jeu dans la bibliothèque.</p>
        )}
        {categories.map(cat => (
          <div key={cat.label} className={styles.cat}>
            <div className={styles.catLabel}>{cat.label}</div>
            <div className={styles.row}>
              {cat.games.map(g => (
                <BrowseCard
                  key={g.id}
                  game={g}
                  onClick={() => navigate(`/library/${g.id}`)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
