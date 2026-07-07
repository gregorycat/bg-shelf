import { useEffect, useState } from 'react'
import { friends as friendsApi } from '../services/api.js'
import styles from './FriendsPage.module.css'

export default function FriendsPage() {
  const [friendsList, setFriendsList] = useState([])
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [loading, setLoading] = useState(false)

  async function reload() {
    setFriendsList(await friendsApi.list())
  }

  useEffect(() => { reload() }, [])

  async function handleAdd(e) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    await friendsApi.create({ name, contact })
    setName(''); setContact('')
    await reload()
    setLoading(false)
  }

  async function handleDelete(id) {
    await friendsApi.remove(id)
    reload()
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Amis</h1>

      <form onSubmit={handleAdd} className={styles.form}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom" />
        <input value={contact} onChange={e => setContact(e.target.value)} placeholder="Contact (optionnel)" />
        <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
          Ajouter
        </button>
      </form>

      <ul className={styles.list}>
        {friendsList.map(f => (
          <li key={f.id} className={styles.item}>
            <div>
              <span className={styles.name}>{f.name}</span>
              {f.contact && <span className={styles.contact}>{f.contact}</span>}
            </div>
            <button className="btn btn-ghost" onClick={() => handleDelete(f.id)}>Supprimer</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
