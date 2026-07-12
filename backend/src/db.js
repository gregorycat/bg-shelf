import Database from 'better-sqlite3'
import path from 'path'
import { mkdirSync } from 'fs'

const DB_PATH = process.env.DB_PATH || path.resolve('./data/boardshelf.db')

let db

export function getDb() {
  return db
}

export function initDb() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true })
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      bgg_id               TEXT UNIQUE,
      title                TEXT NOT NULL,
      year_published       INTEGER,
      thumbnail_url        TEXT,
      image_url            TEXT,
      min_players          INTEGER,
      max_players          INTEGER,
      playing_time         INTEGER,
      bgg_rating           REAL,
      categories           TEXT,
      mechanics            TEXT,
      description          TEXT,
      notes                TEXT,
      status               TEXT NOT NULL DEFAULT 'owned' CHECK(status IN ('owned','lent','wishlist')),
      bgg_type             TEXT NOT NULL DEFAULT 'boardgame' CHECK(bgg_type IN ('boardgame','boardgameexpansion')),
      parent_game_id       TEXT REFERENCES games(id) ON DELETE SET NULL,
      added_at             TEXT NOT NULL DEFAULT (datetime('now')),
      metadata_refreshed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS friends (
      id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      name       TEXT NOT NULL,
      contact    TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS loans (
      id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      friend_id   TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
      lent_at     TEXT NOT NULL DEFAULT (datetime('now')),
      returned_at TEXT,
      notes       TEXT
    );

    CREATE TABLE IF NOT EXISTS recommendation_cache (
      id         INTEGER PRIMARY KEY,
      payload    TEXT NOT NULL,
      cached_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // Migrate: add extra metadata columns if they don't exist yet
  const addCol = (col, type) => {
    try { db.exec(`ALTER TABLE games ADD COLUMN ${col} ${type}`) } catch { /* already exists */ }
  }
  addCol('min_playtime',  'INTEGER')
  addCol('max_playtime',  'INTEGER')
  addCol('age',           'INTEGER')
  addCol('bgg_rank',      'INTEGER')
  addCol('weight',        'REAL')
  addCol('designers',     'TEXT')
  addCol('publishers',    'TEXT')
  addCol('artists',       'TEXT')
  addCol('num_ratings',   'INTEGER')
  addCol('language_dep',  'TEXT')
  addCol('ean',                  'TEXT')
  addCol('howtoplay_video',      'TEXT')
  addCol('scoring_guide',        'TEXT')
  addCol('bgg_collid',           'TEXT')
  addCol('score_sheet_template', 'TEXT')
  addCol('strategy_guide',       'TEXT')

  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS games_ean ON games(ean) WHERE ean IS NOT NULL`) } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS plays (
      id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      game_id      TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      played_at    TEXT NOT NULL,
      duration_min INTEGER,
      notes        TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS play_players (
      id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      play_id     TEXT NOT NULL REFERENCES plays(id) ON DELETE CASCADE,
      player_name TEXT NOT NULL,
      score       REAL,
      winner      INTEGER NOT NULL DEFAULT 0,
      score_data  TEXT
    );

    CREATE TABLE IF NOT EXISTS play_expansions (
      id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      play_id      TEXT NOT NULL REFERENCES plays(id) ON DELETE CASCADE,
      expansion_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE
    );
  `)

  // Migrate play_players if needed
  try { db.exec('ALTER TABLE play_players ADD COLUMN score_data TEXT') } catch {}

  // Per-play override of each number field's multiplier (JSON: { [fieldId]: multiplier })
  try { db.exec('ALTER TABLE plays ADD COLUMN field_multipliers TEXT') } catch {}

  console.log(`Database ready at ${DB_PATH}`)
}
