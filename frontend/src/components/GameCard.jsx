import { Link } from 'react-router-dom'
import styles from './GameCard.module.css'

const STATUS_LABEL = { owned: null, lent: 'Prêté', wishlist: 'Souhaité' }
const STATUS_CLASS = { lent: styles.badgeLent, wishlist: styles.badgeWishlist }

export default function GameCard({ game }) {
  const isExt = game.bgg_type === 'boardgameexpansion'
  const statusLabel = STATUS_LABEL[game.status]

  return (
    <Link to={`/library/${game.id}`} className={styles.card}>
      <div className={styles.cover}>
        {(game.image_url || game.thumbnail_url)
          ? <img src={game.image_url || game.thumbnail_url} alt={game.title} loading="lazy" />
          : <span className={styles.placeholder}>{game.title.slice(0, 2).toUpperCase()}</span>
        }
        {isExt && <span className={`${styles.badge} ${styles.badgeExt}`}>Ext.</span>}
        {!isExt && statusLabel && (
          <span className={`${styles.badge} ${STATUS_CLASS[game.status]}`}>{statusLabel}</span>
        )}
      </div>
      <div className={styles.info}>
        <div className={styles.title}>{game.title}</div>
        <div className={styles.meta}>
          {game.year_published && <span>{game.year_published}</span>}
          {game.min_players && game.max_players && (
            <span>{game.min_players}–{game.max_players} j.</span>
          )}
        </div>
      </div>
    </Link>
  )
}
