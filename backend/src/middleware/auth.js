import { OAuth2Client } from 'google-auth-library'

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

const allowedEmails = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

export async function requireGoogleAuth(req, res, next) {
  const header = req.headers.authorization || ''
  // EventSource (used for SSE progress streams) can't set custom headers, so it passes
  // the token as a query param instead.
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || null)
  if (!token) return res.status(401).json({ error: 'Authentification requise' })

  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID })
    const payload = ticket.getPayload()
    const email = (payload.email || '').toLowerCase()

    if (!payload.email_verified || !allowedEmails.includes(email)) {
      return res.status(403).json({ error: 'Accès non autorisé pour ce compte' })
    }

    req.user = { email, name: payload.name, picture: payload.picture }
    next()
  } catch {
    return res.status(401).json({ error: 'Session invalide — reconnectez-vous' })
  }
}
