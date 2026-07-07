import { create } from 'zustand'
import { bgg } from '../services/api.js'

export const useBggStore = create((set) => ({
  loggedIn: false,
  username: null,
  loading: true,

  fetchSession: async () => {
    try {
      const data = await bgg.getSession()
      set({ loggedIn: data.loggedIn, username: data.username || null, loading: false })
    } catch {
      set({ loggedIn: false, username: null, loading: false })
    }
  },

  setSession: (loggedIn, username = null) => set({ loggedIn, username }),
}))
