import { create } from 'zustand'
import { games } from '../services/api.js'

export const useLibraryStore = create((set, get) => ({
  games: [],
  loading: false,
  error: null,
  filter: 'all',   // 'all' | 'owned' | 'lent' | 'wishlist' | 'extension'
  search: '',

  setFilter: (filter) => set({ filter }),
  setSearch: (search) => set({ search }),

  fetch: async () => {
    set({ loading: true, error: null })
    try {
      const data = await games.list()
      set({ games: data, loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  addGame: async (data) => {
    const game = await games.create(data)
    set(s => ({ games: [...s.games, game] }))
    return game
  },

  updateGame: async (id, data) => {
    const game = await games.update(id, data)
    set(s => ({ games: s.games.map(g => g.id === id ? game : g) }))
    return game
  },

  removeGame: async (id) => {
    await games.remove(id)
    set(s => ({ games: s.games.filter(g => g.id !== id) }))
  },

  refreshGame: async (id) => {
    const game = await games.refresh(id)
    set(s => ({ games: s.games.map(g => g.id === id ? game : g) }))
    return game
  },
}))
