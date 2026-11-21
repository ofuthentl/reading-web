-- Migration 0003: Discord Bot ephemeral key access (5m TTL) + 24h single-session guest & isolated guest reading progress (D-026)

CREATE TABLE IF NOT EXISTS discord_access (
  discord_user_id TEXT PRIMARY KEY,
  discord_username TEXT NOT NULL,
  key_hash TEXT,
  key_issued_at INTEGER,
  key_expires_at INTEGER,
  active_session_id TEXT,
  session_expires_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_discord_access_key_hash
  ON discord_access(key_hash)
  WHERE key_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS guest_reading_progress (
  discord_user_id TEXT NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  chapter_index INTEGER NOT NULL DEFAULT 0,
  chapter_title TEXT,
  total_chapters INTEGER,
  scroll_ratio REAL NOT NULL DEFAULT 0,
  scroll_top REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (discord_user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_guest_progress_user_updated
  ON guest_reading_progress(discord_user_id, updated_at DESC);
