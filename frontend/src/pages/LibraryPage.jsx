import { useEffect, useState, useMemo } from 'react'
import { useLibraryStore } from '../stores/useLibraryStore.js'
import GameCard from '../components/GameCard.jsx'
import AddGameModal from '../components/AddGameModal.jsx'
import SyncBggModal from '../components/SyncBggModal.jsx'
import BulkRefreshModal from '../components/BulkRefreshModal.jsx'
import styles from './LibraryPage.module.css'

const STATUS_FILTERS = [
  { key: 'all',       label: 'Tous' },
  { key: 'owned',     label: 'Possédés' },
  { key: 'lent',      label: 'Prêtés' },
  { key: 'wishlist',  label: 'Souhaités' },
  { key: 'extension', label: 'Extensions' },
]

const PLAYER_OPTS = [
  { value: 1, label: 'Solo' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
  { value: 6, label: '6+' },
]

const DURATION_OPTS = [
  { value: 'short',  label: '≤ 30 min' },
  { value: 'medium', label: '30–90 min' },
  { value: 'long',   label: '> 90 min' },
]

const SORT_OPTS = [
  { value: 'title',   label: 'A → Z' },
  { value: 'rating',  label: 'Mieux notés' },
  { value: 'added',   label: 'Ajoutés récemment' },
  { value: 'playtime', label: 'Durée croissante' },
]

function parseJson(str) {
  try { return JSON.parse(str || '[]') } catch { return [] }
}

export default function LibraryPage() {
  const { fetch, games, loading, error, filter, setFilter, search, setSearch } = useLibraryStore()
  const [showAdd, setShowAdd] = useState(false)
  const [showSync, setShowSync] = useState(false)
  const [showBulk, setShowBulk] = useState(false)

  // Advanced filters
  const [players, setPlayers]   = useState(null)
  const [duration, setDuration] = useState(null)
  const [category, setCategory] = useState('')
  const [sort, setSort]         = useState('title')

  useEffect(() => { if (games.length === 0) fetch() }, [])

  const allCategories = useMemo(() => {
    const set = new Set()
    games.forEach(g => parseJson(g.categories).forEach(c => set.add(c)))
    return [...set].sort()
  }, [games])

  const counts = {
    all:       games.filter(g => g.bgg_type === 'boardgame').length,
    owned:     games.filter(g => g.status === 'owned' && g.bgg_type === 'boardgame').length,
    lent:      games.filter(g => g.status === 'lent').length,
    wishlist:  games.filter(g => g.status === 'wishlist').length,
    extension: games.filter(g => g.bgg_type === 'boardgameexpansion').length,
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
  let visible = games

  if (filter === 'extension') {
    visible = visible.filter(g => g.bgg_type === 'boardgameexpansion')
  } else if (filter !== 'all') {
    visible = visible.filter(g => g.status === filter && g.bgg_type === 'boardgame')
  } else {
    visible = visible.filter(g => g.bgg_type === 'boardgame')
  }

  if (search) {
    const q = search.toLowerCase()
    visible = visible.filter(g => g.title.toLowerCase().includes(q))
  }

  if (players !== null) {
    if (players === 6) {
      visible = visible.filter(g => g.max_players != null && g.max_players >= 6)
    } else {
      visible = visible.filter(g =>
        g.min_players != null && g.max_players != null &&
        g.min_players <= players && g.max_players >= players
      )
    }
  }

  if (duration) {
    visible = visible.filter(g => {
      const t = g.playing_time || g.max_playtime || 0
      if (!t) return false
      if (duration === 'short')  return t <= 30
      if (duration === 'medium') return t > 30 && t <= 90
      if (duration === 'long')   return t > 90
      return true
    })
  }

  if (category) {
    visible = visible.filter(g => parseJson(g.categories).includes(category))
  }

  // ── Sorting ────────────────────────────────────────────────────────────────
  visible = [...visible].sort((a, b) => {
    if (sort === 'rating')   return (b.bgg_rating || 0) - (a.bgg_rating || 0)
    if (sort === 'added')    return (b.added_at || '').localeCompare(a.added_at || '')
    if (sort === 'playtime') {
      const ta = a.playing_time || a.max_playtime || 0
      const tb = b.playing_time || b.max_playtime || 0
      return ta - tb
    }
    return a.title.localeCompare(b.title)
  })

  const advActive = players !== null || duration !== null || category !== ''

  function clearAdv() {
    setPlayers(null)
    setDuration(null)
    setCategory('')
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Ma bibliothèque</h1>
        <div className={styles.headerActions}>
          <button className="btn btn-ghost" onClick={() => setShowBulk(true)}>↻ Tout rafraîchir</button>
          <button className="btn btn-ghost" onClick={() => setShowSync(true)}>↓ Sync BGG</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Ajouter un jeu</button>
        </div>
      </div>

      <div className={styles.toolbar}>
        {/* Search + sort */}
        <div className={styles.topRow}>
          <input
            className={styles.search}
            placeholder="Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={e => setSort(e.target.value)}
          >
            {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Status pills */}
        <div className={styles.pills}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              className={`${styles.pill} ${filter === f.key ? styles.pillActive : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label} <span className={styles.count}>{counts[f.key]}</span>
            </button>
          ))}
        </div>

        {/* Advanced filters */}
        <div className={styles.advFilters}>
          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Joueurs</span>
            <div className={styles.pills}>
              {PLAYER_OPTS.map(o => (
                <button
                  key={o.value}
                  className={`${styles.pill} ${styles.pillSm} ${players === o.value ? styles.pillActive : ''}`}
                  onClick={() => setPlayers(players === o.value ? null : o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Durée</span>
            <div className={styles.pills}>
              {DURATION_OPTS.map(o => (
                <button
                  key={o.value}
                  className={`${styles.pill} ${styles.pillSm} ${duration === o.value ? styles.pillActive : ''}`}
                  onClick={() => setDuration(duration === o.value ? null : o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Catégorie</span>
            <select
              className={styles.filterSelect}
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              <option value="">Toutes</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {advActive && (
              <button className={styles.clearBtn} onClick={clearAdv}>
                ✕ Effacer les filtres
              </button>
            )}
          </div>
        </div>
      </div>

      {loading && <p className={styles.state}>Chargement…</p>}
      {error && <p className={styles.state} style={{ color: 'var(--red)' }}>{error}</p>}

      {!loading && visible.length === 0 && (
        <p className={styles.state}>Aucun jeu trouvé.</p>
      )}

      <div className={styles.grid}>
        {visible.map(g => <GameCard key={g.id} game={g} />)}
      </div>

      {showAdd && <AddGameModal onClose={() => { setShowAdd(false); fetch() }} />}
      {showBulk && (
        <BulkRefreshModal
          onClose={() => setShowBulk(false)}
          onDone={() => fetch()}
        />
      )}
      {showSync && (
        <SyncBggModal
          onClose={() => setShowSync(false)}
          onDone={() => fetch()}
        />
      )}
    </div>
  )
}
