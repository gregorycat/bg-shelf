# BoardShelf

A personal board game library manager: track your collection, sync with BoardGameGeek, log plays, manage loans to friends, and get recommendations.

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- npm (bundled with Node)

## Setup

1. Clone the repo and install dependencies for both apps:
   ```bash
   git clone <your-repo-url> bg-lib
   cd bg-lib
   cd backend && npm install
   cd ../frontend && npm install
   cd ..
   ```

2. Create a `.env` file at the **repo root** (next to this README) with your API keys. Copy the
   example and fill in what you have — all values are optional, but features are disabled without
   the corresponding key:
   ```bash
   cp .env.example .env
   ```
   ```
   # Backend port for native dev — only needed if 3001 is already used by another app on
   # your machine. Update frontend/vite.config.js's proxy target to match if you change this.
   PORT=

   # Barcode → product name lookup (100 req/day free without a key)
   UPCITEMDB_KEY=

   # Enables the recommendations feature
   MISTRAL_API_KEY=

   # Auto-login on startup for BGG collection sync
   BGG_USERNAME=
   BGG_PASSWORD=
   ```

## Running locally

Run the backend and frontend in two separate terminals.

**Backend** (from `backend/`):
```bash
npm run dev
```
Starts on `http://localhost:3001` by default (or `PORT` from `.env` if set), using `--watch` for
auto-restart on changes. Reads `.env` from the repo root and creates its SQLite database at
`backend/data/boardshelf.db` by default.

**Frontend** (from `frontend/`):
```bash
npm run dev
```
Starts the Vite dev server on `http://localhost:5173`. Requests to `/api/*` are proxied to the
backend (see the `server.proxy` target in `frontend/vite.config.js` — keep it in sync with the
backend's `PORT`), so open `http://localhost:5173` in your browser — not the backend port.

> If the app seems stuck on stale code after editing and restarting both processes, check
> whether something else on your machine is already listening on the backend's port
> (`lsof -i :3001` / `ss -ltnp | grep 3001`) — if so, your frontend may be silently talking to
> that other process instead of your backend. Pick a free port via `PORT` in `.env` and update
> the Vite proxy target to match.

## Running with Docker instead

If you'd rather not install Node locally, `docker-compose.yml` builds and runs both services
together:
```bash
docker compose up -d --build
```
The app is then available at `http://localhost` (port 80). This uses production builds (no
hot-reload), so it's better suited for testing a full build than for day-to-day development.

## Project structure

- `backend/` — Express API + SQLite (`better-sqlite3`), BGG integration, recommendations
- `frontend/` — React + Vite SPA, built and served via nginx in Docker
