import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { games as gamesApi } from '../services/api.js'
import styles from './GamePickerPage.module.css'

const SUGGESTIONS = [
  'Un jeu rapide pour 2 joueurs ce soir',
  'Quelque chose de stratégique pour 4 joueurs, 1h max',
  'Un jeu famille accessible pour des enfants de 8 ans',
  'Un jeu coopératif pas trop complexe',
  'Un euro-game long et cérébral pour joueurs confirmés',
]

export default function GamePickerPage() {
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [excluded, setExcluded] = useState([])
  const textareaRef = useRef(null)

  async function handlePick(e, excludeList) {
    e?.preventDefault?.()
    const q = prompt.trim()
    if (!q) return
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const data = await gamesApi.pick(q, excludeList ?? excluded)
      setResult(data)
    } catch (err) {
      setError(err?.response?.data?.error || 'Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  function handleSuggestion(s) {
    setPrompt(s)
    setExcluded([])
    setResult(null)
    setError(null)
    textareaRef.current?.focus()
  }

  function handleAgain() {
    const newExcluded = result?.game ? [...excluded, result.game.id] : excluded
    setExcluded(newExcluded)
    handlePick(null, newExcluded)
  }

  const game = result?.game
  const reason = result?.reason

  const categories = game?.categories ? (() => { try { return JSON.parse(game.categories) } catch { return [] } })() : []
  const players = game?.min_players && game?.max_players
    ? game.min_players === game.max_players ? `${game.min_players} joueurs` : `${game.min_players}–${game.max_players} joueurs`
    : null
  const time = (() => {
    if (game?.min_playtime && game?.max_playtime && game.min_playtime !== game.max_playtime)
      return `${game.min_playtime}–${game.max_playtime} min`
    if (game?.playing_time) return `${game.playing_time} min`
    return null
  })()

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Quel jeu ce soir ?</h1>
        <p className={styles.subtitle}>Décrivez l'ambiance, le nombre de joueurs, la durée — l'IA choisit dans votre bibliothèque.</p>
      </div>

      <form className={styles.form} onSubmit={handlePick}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={prompt}
          onChange={e => { setPrompt(e.target.value); setExcluded([]) }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePick() } }}
          placeholder="Ex : un jeu stratégique pour 3 joueurs, environ 1h, pas trop complexe…"
          rows={3}
          disabled={loading}
          autoFocus
        />
        <div className={styles.formFooter}>
          <div className={styles.hints}>
            {SUGGESTIONS.map(s => (
              <button key={s} type="button" className={styles.hint} onClick={() => handleSuggestion(s)}>
                {s}
              </button>
            ))}
          </div>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading || !prompt.trim()}
          >
            {loading ? (
              <span className={styles.loadingDots}>
                <span>Analyse</span>
                <span className={styles.dot1}>.</span>
                <span className={styles.dot2}>.</span>
                <span className={styles.dot3}>.</span>
              </span>
            ) : (
              <>✦ Trouver un jeu</>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className={styles.errorBox}>
          <span className={styles.errorIcon}>⚠</span>
          {error}
        </div>
      )}

      {result && game && (
        <div className={styles.resultCard}>
          <div className={styles.resultLeft}>
            <div className={styles.thumb}>
              {game.thumbnail_url || game.image_url
                ? <img src={game.thumbnail_url || game.image_url} alt={game.title} />
                : <span className={styles.thumbPlaceholder}>{game.title.slice(0, 2).toUpperCase()}</span>
              }
            </div>
            <div className={styles.gameInfo}>
              <h2 className={styles.gameTitle}>{game.title}</h2>
              {game.year_published && <span className={styles.gameYear}>{game.year_published}</span>}
              <div className={styles.gameMeta}>
                {players && <span className={styles.metaChip}>👥 {players}</span>}
                {time   && <span className={styles.metaChip}>⏱ {time}</span>}
                {game.weight && <span className={styles.metaChip}>⚖ {game.weight.toFixed(1)}/5</span>}
              </div>
              {categories.length > 0 && (
                <div className={styles.gameTags}>
                  {categories.slice(0, 3).map(c => <span key={c} className={styles.tag}>{c}</span>)}
                </div>
              )}
            </div>
          </div>

          <div className={styles.resultRight}>
            <p className={styles.matchLabel}>Pourquoi ce jeu</p>
            <p className={styles.reasonText}>{reason}</p>
            <div className={styles.resultActions}>
              <button className="btn btn-primary" onClick={() => navigate(`/library/${game.id}`)}>
                Voir le jeu →
              </button>
              <button className="btn btn-ghost" onClick={handleAgain}>
                Autre suggestion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
