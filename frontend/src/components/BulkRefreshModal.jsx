import { useEffect, useRef, useState } from 'react'
import { games as gamesApi } from '../services/api.js'
import styles from './BulkRefreshModal.module.css'

export default function BulkRefreshModal({ onClose, onDone }) {
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0, finished: false })
  const esRef = useRef(null)

  useEffect(() => {
    const es = gamesApi.refreshAll()
    esRef.current = es

    es.onmessage = (e) => {
      const data = JSON.parse(e.data)
      setProgress(data)
      if (data.finished) {
        es.close()
        onDone()
      }
    }

    es.onerror = () => {
      es.close()
      setProgress(p => ({ ...p, finished: true }))
    }

    return () => es.close()
  }, [])

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Synchronisation complète depuis BGG</h2>

        <p className={styles.hint}>
          Récupération de toutes les métadonnées : description, catégories, mécaniques,
          designers, éditeurs, complexité, âge…
        </p>

        <div className={styles.barWrap}>
          <div className={styles.bar} style={{ width: `${pct}%` }} />
        </div>

        <div className={styles.stats}>
          <span className={styles.count}>{progress.done} / {progress.total || '…'}</span>
          <span className={styles.pct}>{pct}%</span>
        </div>

        {progress.lastError && (
          <p className={styles.error}>Erreur : {progress.lastError}</p>
        )}
        {progress.errors > 0 && !progress.lastError && (
          <p className={styles.warn}>{progress.errors} jeu(x) n'ont pas pu être mis à jour</p>
        )}

        {!progress.finished ? (
          <p className={styles.running}>En cours…</p>
        ) : (
          <button className="btn btn-primary" onClick={onClose} style={{ marginTop: 8 }}>
            Fermer
          </button>
        )}
      </div>
    </div>
  )
}
