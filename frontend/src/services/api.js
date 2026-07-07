import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const games = {
  list: (params) => api.get('/games', { params }).then(r => r.data),
  get: (id) => api.get(`/games/${id}`).then(r => r.data),
  create: (data) => api.post('/games', data).then(r => r.data),
  update: (id, data) => api.put(`/games/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/games/${id}`).then(r => r.data),
  refresh: (id) => api.post(`/games/${id}/refresh`).then(r => r.data),
  howtoplay: (id) => api.get(`/games/${id}/howtoplay`).then(r => r.data),
  generateScoringGuide: (id, rulesInput) => api.post(`/games/${id}/scoring-guide/generate`, { rulesInput }).then(r => r.data),
  generateStrategyGuide: (id) => api.post(`/games/${id}/strategy-guide/generate`).then(r => r.data),
  pick: (prompt, exclude = []) => api.post('/games/pick', { prompt, exclude }).then(r => r.data),
  // Returns an EventSource — caller must close it
  refreshAll: () => new EventSource('/api/games/refresh-all'),
}

export const friends = {
  list: () => api.get('/friends').then(r => r.data),
  create: (data) => api.post('/friends', data).then(r => r.data),
  update: (id, data) => api.put(`/friends/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/friends/${id}`).then(r => r.data),
}

export const loans = {
  list: () => api.get('/loans').then(r => r.data),
  history: () => api.get('/loans/history').then(r => r.data),
  create: (data) => api.post('/loans', data).then(r => r.data),
  return: (id) => api.put(`/loans/${id}/return`).then(r => r.data),
}

export const bgg = {
  search: (q) => api.get('/bgg/search', { params: { q } }).then(r => r.data),
  game: (bggId) => api.get(`/bgg/game/${bggId}`).then(r => r.data),
  barcode: (upc) => api.post('/bgg/barcode', { upc }).then(r => r.data),
  syncStream: (username, mode) => new EventSource(`/api/bgg/sync?${new URLSearchParams({ username, mode })}`),
  removeFromCollection: (bggId) => api.delete(`/bgg/collection/${bggId}`).then(r => r.data),
  getSession: () => api.get('/bgg/session').then(r => r.data),
  login: (username, password) => api.post('/bgg/session', { username, password }).then(r => r.data),
  logout: () => api.delete('/bgg/session').then(r => r.data),
}

export const plays = {
  list: (gameId) => api.get('/plays', { params: { game_id: gameId } }).then(r => r.data),
  recent: (limit = 30) => api.get('/plays/recent', { params: { limit } }).then(r => r.data),
  create: (data) => api.post('/plays', data).then(r => r.data),
  update: (id, data) => api.put(`/plays/${id}`, data).then(r => r.data),
  remove: (id) => api.delete(`/plays/${id}`).then(r => r.data),
}

export const recommendations = {
  get: () => api.get('/recommendations').then(r => r.data),
}
