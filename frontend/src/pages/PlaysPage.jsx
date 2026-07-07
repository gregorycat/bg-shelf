import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { plays as playsApi } from '../services/api.js'
import styles from './PlaysPage.module.css'

function groupByDate(plays) {
  const groups = {}
  for (const play of plays) {
    const key = play.played_at.slice(0, 10)
    if (!groups[key]) groups[key] = []
    groups[key].push(play)
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
}

export default function PlaysPage() {
  const navigate = useNavigate()
  const [plays, setPlays] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    playsApi.recent(100)
      .then(setPlays)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ color: 'var(--muted)', padding: 40 }}>Chargement…</p>

  const groups = groupByDate(plays)

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Parties jouées</h1>

      {plays.length === 0 && (
        <p className={styles.empty}>Aucune partie enregistrée. Ajoutez-en depuis la fiche d'un jeu.</p>
      )}

      {groups.map(([date, dayPlays]) => (
        <div key={date} className={styles.group}>
          <div className={styles.dateLabel}>
            {new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <div className={styles.cards}>
            {dayPlays.map(play => (
              <div
                key={play.id}
                className={styles.card}
                onClick={() => navigate(`/library/${play.game_id}`)}
              >
                <div className={styles.cover}>
                  {play.game_thumbnail
                    ? <img src={play.game_thumbnail} alt={play.game_title} loading="lazy" />
                    : <span className={styles.coverInit}>{(play.game_title || '?').slice(0, 2).toUpperCase()}</span>
                  }
                </div>
                <div className={styles.info}>
                  <div className={styles.gameTitle}>{play.game_title}</div>
                  {play.duration_min && (
                    <div className={styles.meta}>{play.duration_min} min</div>
                  )}
                  {play.players.length > 0 && (
                    <div className={styles.players}>
                      {play.players.map(p => (
                        <span key={p.id} className={`${styles.player} ${p.winner ? styles.winner : ''}`}>
                          {p.winner ? '🏆 ' : ''}{p.player_name}{p.score != null ? ` ${p.score}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  {play.expansions?.length > 0 && (
                    <div className={styles.expansions}>
                      {play.expansions.map(e => (
                        <span key={e.id} className={styles.expansion}>{e.title}</span>
                      ))}
                    </div>
                  )}
                  {play.notes && <div className={styles.notes}>{play.notes}</div>}
                </div>
                <button
                  className={styles.editPlay}
                  onClick={e => {
                    e.stopPropagation()
                    navigate(`/library/${play.game_id}?editPlay=${play.id}`)
                  }}
                >
                  ✎
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
