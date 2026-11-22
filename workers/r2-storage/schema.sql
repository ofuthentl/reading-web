CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'Không rõ tác giả',
  shelf TEXT NOT NULL DEFAULT 'Kho chưa phân loại',
  description TEXT,
  cover_color TEXT NOT NULL DEFAULT '#4f46e5',
  cover_key TEXT,
  file_key TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('epub', 'pdf', 'docx')),
  file_size INTEGER NOT NULL DEFAULT 0,
  cover_size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_progress (
  book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  chapter_index INTEGER NOT NULL DEFAULT 0,
  chapter_title TEXT,
  total_chapters INTEGER,
  scroll_ratio REAL NOT NULL DEFAULT 0,
  scroll_top REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shelf_prefs (
  shelf_key TEXT PRIMARY KEY,
  cover_book_id TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS discord_access (
  discord_user_id TEXT PRIMARY KEY,
  discord_username TEXT NOT NULL,
  key_hash TEXT,
  key_issued_at INTEGER,
  key_expires_at INTEGER,
  active_session_id TEXT,
  session_expires_at INTEGER,
  ua_hash TEXT,
  rl_tokens REAL NOT NULL DEFAULT 10,
  rl_updated_at INTEGER NOT NULL DEFAULT 0,
  rl_strikes INTEGER NOT NULL DEFAULT 0,
  is_banned INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT,
  updated_at INTEGER NOT NULL
);

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

CREATE TABLE IF NOT EXISTS book_guest_packs (
  book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  pack_key TEXT NOT NULL,
  pack_size INTEGER NOT NULL DEFAULT 0,
  chapter_count INTEGER NOT NULL DEFAULT 0,
  manifest_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS book_bookmarks (
  id TEXT PRIMARY KEY,
  user_scope TEXT NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  chapter_index INTEGER NOT NULL DEFAULT 0,
  chapter_title TEXT,
  scroll_ratio REAL NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shelf_access_rules (
  shelf_key TEXT PRIMARY KEY,
  access_mode TEXT NOT NULL DEFAULT 'public' CHECK (access_mode IN ('public', 'restricted')),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shelf_guest_grants (
  shelf_key TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  granted_label TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (shelf_key, discord_user_id)
);

CREATE INDEX IF NOT EXISTS idx_books_shelf ON books(shelf);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_progress_updated_at ON reading_progress(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_discord_access_key_hash ON discord_access(key_hash) WHERE key_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guest_progress_user_updated ON guest_reading_progress(discord_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_book ON book_bookmarks(user_scope, book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shelf_grants_user ON shelf_guest_grants(discord_user_id);
