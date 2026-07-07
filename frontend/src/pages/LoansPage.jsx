import { useEffect, useState } from 'react'
import { loans as loansApi } from '../services/api.js'
import { useLibraryStore } from '../stores/useLibraryStore.js'
import styles from './LoansPage.module.css'

function daysAgo(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000)
}

export default function LoansPage() {
  const [activeLoans, setActiveLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const updateGame = useLibraryStore(s => s.updateGame)

  async function reload() {
    setLoading(true)
    setActiveLoans(await loansApi.list())
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  async function handleReturn(loan) {
    await loansApi.return(loan.id)
    await updateGame(loan.game_id, { status: 'owned' })
    reload()
  }

  const overdue = activeLoans.filter(l => daysAgo(l.lent_at) > 30)

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Prêts en cours</h1>

      {overdue.length > 0 && (
        <div className={styles.banner}>
          {overdue.length} prêt{overdue.length > 1 ? 's' : ''} en retard (&gt; 30 jours) — pensez à relancer !
        </div>
      )}

      {loading && <p className={styles.state}>Chargement…</p>}

      {!loading && activeLoans.length === 0 && (
        <p className={styles.state}>Aucun prêt en cours. Bonne nouvelle !</p>
      )}

      <div className={styles.list}>
        {activeLoans.map(loan => {
          const days = daysAgo(loan.lent_at)
          const late = days > 30
          return (
            <div key={loan.id} className={`${styles.card} ${late ? styles.late : ''}`}>
              {loan.thumbnail_url && (
                <img src={loan.thumbnail_url} alt={loan.game_title} className={styles.thumb} loading="lazy" />
              )}
              <div className={styles.info}>
                <div className={styles.gameTitle}>{loan.game_title}</div>
                <div className={styles.friendName}>{loan.friend_name}</div>
                <div className={styles.date}>
                  Depuis le {new Date(loan.lent_at).toLocaleDateString('fr-FR')}
                  {' '}· {days} jour{days > 1 ? 's' : ''}
                  {late && <span className={styles.lateTag}> · En retard</span>}
                </div>
              </div>
              <button className="btn btn-ghost" onClick={() => handleReturn(loan)}>
                Marquer rendu
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
