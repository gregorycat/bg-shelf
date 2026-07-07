import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useBggStore } from '../stores/useBggStore.js'
import SyncBggModal from './SyncBggModal.jsx'
import styles from './Layout.module.css'

const nav = [
  { to: '/library', label: 'Bibliothèque', short: 'Biblio',    icon: '⊞' },
  { to: '/browse',  label: 'Parcourir',    short: 'Parcourir', icon: '◈' },
  { to: '/pick',    label: 'Choisir',      short: 'Choisir',   icon: '✦' },
  { to: '/plays',   label: 'Parties',      short: 'Parties',   icon: '⚄' },
  { to: '/loans',   label: 'Prêts',        short: 'Prêts',     icon: '⇄' },
  { to: '/friends', label: 'Amis',         short: 'Amis',      icon: '◉' },
]

export default function Layout() {
  const { loggedIn, username, loading, fetchSession } = useBggStore()
  const [showBgg, setShowBgg] = useState(false)

  useEffect(() => { fetchSession() }, [])

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>BoardShelf</div>
        <nav className={styles.nav}>
          {nav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        {!loading && (
          <div className={styles.sidebarFooter}>
            <button
              className={`${styles.bggStatus} ${loggedIn ? styles.bggConnected : ''}`}
              onClick={() => setShowBgg(true)}
              title={loggedIn ? `BGG : ${username}` : 'Se connecter à BGG'}
            >
              <span className={`${styles.dot} ${loggedIn ? styles.dotGreen : styles.dotGray}`} />
              <span className={styles.bggLabel}>{loggedIn ? username : 'Connexion BGG'}</span>
            </button>
          </div>
        )}
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>

      <nav className={styles.bottomNav}>
        {nav.map(({ to, short, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `${styles.bottomNavItem} ${isActive ? styles.bottomNavActive : ''}`}
          >
            <span className={styles.bottomNavIcon}>{icon}</span>
            <span className={styles.bottomNavLabel}>{short}</span>
          </NavLink>
        ))}
      </nav>
      {showBgg && (
        <SyncBggModal
          onClose={() => setShowBgg(false)}
          onDone={() => setShowBgg(false)}
        />
      )}
    </div>
  )
}
