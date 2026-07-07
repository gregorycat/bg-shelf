import { useState, useEffect } from 'react'
import { bgg } from '../services/api.js'
import { useBggStore } from '../stores/useBggStore.js'
import styles from './SyncBggModal.module.css'

const MODES = [
  { value: 'owned',    label: 'Possédés uniquement' },
  { value: 'wishlist', label: 'Liste de souhaits uniquement' },
  { value: 'all',      label: 'Tout (possédés + souhaits)' },
]

export default function SyncBggModal({ onClose, onDone }) {
  const setStoreSession = useBggStore(state => state.setSession)

  // session state
  const [session, setSession] = useState(null)   // null = loading, {loggedIn, username}
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)

  // sync state
  const [bggUsername, setBggUsername] = useState('')
  const [mode, setMode] = useState('owned')
  const [syncState, setSyncState] = useState('idle')  // idle | loading | done | error
  const [result, setResult] = useState(null)
  const [syncError, setSyncError] = useState(null)
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    bgg.getSession().then(s => {
      setSession(s)
      if (s.loggedIn) setBggUsername(s.username)
    })
  }, [])

  async function handleLogin(e) {
    e.preventDefault()
    setLoginLoading(true); setLoginError(null)
    try {
      const s = await bgg.login(loginUser, loginPass)
      setSession({ loggedIn: true, username: s.username })
      setStoreSession(true, s.username)
      setBggUsername(s.username)
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Identifiants invalides.')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleLogout() {
    await bgg.logout()
    setSession({ loggedIn: false })
    setStoreSession(false, null)
    setBggUsername('')
  }

  function handleSync(e) {
    e.preventDefault()
    if (!bggUsername.trim()) return
    setSyncState('loading'); setSyncError(null); setProgress(null)

    const es = bgg.syncStream(bggUsername.trim(), mode)

    es.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.error) {
        setSyncError(data.error)
        setSyncState('idle')
        es.close()
        return
      }
      if (data.finished) {
        setResult({ added: data.added, skipped: data.skipped, enriched: data.enriched, total: data.total })
        setSyncState('done')
        onDone()
        es.close()
        return
      }
      setProgress(data)
    }

    es.onerror = () => {
      setSyncError('Erreur de connexion lors de la synchronisation.')
      setSyncState('idle')
      es.close()
    }
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.head}>
          <h2>Synchroniser depuis BGG</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        {/* ── Session block ── */}
        {session === null && <p className={styles.hint}>Vérification de la session…</p>}

        {session && !session.loggedIn && (
          <div className={styles.loginBlock}>
            <p className={styles.hint}>
              L'accès à votre collection BGG nécessite une connexion à votre compte BoardGameGeek.
            </p>
            <form onSubmit={handleLogin} className={styles.form}>
              <div className={styles.field}>
                <label>Identifiant BGG</label>
                <input value={loginUser} onChange={e => setLoginUser(e.target.value)}
                  placeholder="Votre pseudo BGG" autoFocus disabled={loginLoading} />
              </div>
              <div className={styles.field}>
                <label>Mot de passe</label>
                <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                  placeholder="••••••••" disabled={loginLoading} />
              </div>
              {loginError && <p className={styles.error}>{loginError}</p>}
              <div className={styles.actions}>
                <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loginLoading}>Annuler</button>
                <button type="submit" className="btn btn-primary"
                  disabled={!loginUser.trim() || !loginPass || loginLoading}>
                  {loginLoading ? 'Connexion…' : 'Se connecter'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Sync block (shown when logged in) ── */}
        {session?.loggedIn && syncState !== 'done' && (
          <>
            <div className={styles.sessionBadge}>
              <span className={styles.sessionDot} />
              Connecté en tant que <strong>{session.username}</strong>
              <button className={styles.logoutBtn} onClick={handleLogout}>Déconnecter</button>
            </div>

            <form onSubmit={handleSync} className={styles.form}>
              <div className={styles.field}>
                <label>Nom d'utilisateur BGG à importer</label>
                <input value={bggUsername} onChange={e => setBggUsername(e.target.value)}
                  placeholder="Votre pseudo BGG" disabled={syncState === 'loading'} />
              </div>
              <div className={styles.field}>
                <label>Importer</label>
                <div className={styles.modes}>
                  {MODES.map(m => (
                    <label key={m.value} className={styles.modeOption}>
                      <input type="radio" name="mode" value={m.value}
                        checked={mode === m.value} onChange={() => setMode(m.value)}
                        disabled={syncState === 'loading'} />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>

              {syncError && <p className={styles.error}>{syncError}</p>}

              {syncState === 'loading' && progress && (
                <div className={styles.progress}>
                  {progress.phase === 'collection' && (
                    <p className={styles.progressLabel}>
                      {progress.status === 'fetching'
                        ? 'Récupération de la collection BGG…'
                        : `Collection récupérée — ${progress.added} nouveau${progress.added !== 1 ? 'x' : ''}, ${progress.skipped} déjà présent${progress.skipped !== 1 ? 's' : ''}`
                      }
                    </p>
                  )}
                  {progress.phase === 'enrich' && (
                    <>
                      <p className={styles.progressLabel}>
                        Enrichissement des métadonnées… ({progress.done}/{progress.total})
                      </p>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className={styles.actions}>
                <button type="button" className="btn btn-ghost" onClick={onClose}
                  disabled={syncState === 'loading'}>Annuler</button>
                <button type="submit" className="btn btn-primary"
                  disabled={!bggUsername.trim() || syncState === 'loading'}>
                  {syncState === 'loading' ? 'Synchronisation…' : 'Synchroniser'}
                </button>
              </div>
            </form>
          </>
        )}

        {/* ── Success ── */}
        {syncState === 'done' && result && (
          <div className={styles.result}>
            <div className={styles.resultIcon}>✓</div>
            <p className={styles.resultTitle}>Synchronisation terminée</p>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{result.added}</span>
                <span className={styles.statLabel}>jeux ajoutés</span>
              </div>
              <div className={styles.statDivider} />
              {result.enriched > 0 && (
                <>
                  <div className={styles.stat}>
                    <span className={styles.statValue}>{result.enriched}</span>
                    <span className={styles.statLabel}>enrichis</span>
                  </div>
                  <div className={styles.statDivider} />
                </>
              )}
              <div className={styles.stat}>
                <span className={styles.statValue}>{result.skipped}</span>
                <span className={styles.statLabel}>déjà présents</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <span className={styles.statValue}>{result.total}</span>
                <span className={styles.statLabel}>dans BGG</span>
              </div>
            </div>
            <button className="btn btn-primary" onClick={onClose} style={{ marginTop: 8 }}>
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
