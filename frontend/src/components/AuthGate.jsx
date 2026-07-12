import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/useAuthStore.js'
import styles from './AuthGate.module.css'

export default function AuthGate({ children }) {
  const { user, login } = useAuthStore()
  const buttonRef = useRef(null)

  useEffect(() => {
    if (user) return

    // The GSI script loads async and may not be ready yet on first mount.
    const interval = setInterval(() => {
      if (!window.google?.accounts?.id || !buttonRef.current) return
      clearInterval(interval)

      window.google.accounts.id.initialize({
        client_id: import.meta.env.GOOGLE_CLIENT_ID,
        callback: (response) => login(response.credential),
      })
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
      })
    }, 100)

    return () => clearInterval(interval)
  }, [user, login])

  if (user) return children

  return (
    <div className={styles.gate}>
      <div className={styles.card}>
        <div className={styles.logo}>BoardShelf</div>
        <p className={styles.hint}>Connectez-vous avec Google pour accéder à votre bibliothèque.</p>
        <div ref={buttonRef} />
      </div>
    </div>
  )
}
