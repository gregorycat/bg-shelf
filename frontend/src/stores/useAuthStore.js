import { create } from 'zustand'

const STORAGE_KEY = 'boardshelf_id_token'

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

function userFromToken(token) {
  const payload = decodeJwt(token)
  if (!payload || payload.exp * 1000 < Date.now()) return null
  return { email: payload.email, name: payload.name, picture: payload.picture }
}

const initialToken = localStorage.getItem(STORAGE_KEY)
const initialUser = initialToken ? userFromToken(initialToken) : null

export const useAuthStore = create((set) => ({
  idToken: initialUser ? initialToken : null,
  user: initialUser,

  login: (idToken) => {
    const user = userFromToken(idToken)
    if (!user) return
    localStorage.setItem(STORAGE_KEY, idToken)
    set({ idToken, user })
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ idToken: null, user: null })
  },
}))
