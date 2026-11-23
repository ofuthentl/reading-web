CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'Không rõ tác giả',
  shelf TEXT NOT NULL DEFAULT 'Kho chưa phân loại',
  description TEXT,
  cover_color TEXT NOT NULL DEFAULT '#4f46e5',
  cover_key TEXT,
  file_key TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('epub', 'docx')),
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
  reading_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shelf_prefs (
  shelf_key TEXT PRIMARY KEY,
  cover_book_id TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  tags_json TEXT,
  alt_titles_json TEXT,
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
  reading_seconds INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS login_rate_limits (
  ip_hash TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS usage_daily_stats (
  day_key TEXT PRIMARY KEY,
  owner_logins INTEGER NOT NULL DEFAULT 0,
  guest_logins INTEGER NOT NULL DEFAULT 0,
  discord_keys_issued INTEGER NOT NULL DEFAULT 0,
  login_failures INTEGER NOT NULL DEFAULT 0,
  guest_chapter_reads INTEGER NOT NULL DEFAULT 0,
  owner_progress_updates INTEGER NOT NULL DEFAULT 0,
  guest_searches INTEGER NOT NULL DEFAULT 0,
  rate_limit_hits INTEGER NOT NULL DEFAULT 0,
  owner_reading_seconds INTEGER NOT NULL DEFAULT 0,
  guest_reading_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_daily_readers (
  day_key TEXT NOT NULL,
  reader_scope TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'guest')),
  last_seen_at INTEGER NOT NULL,
  reading_seconds INTEGER NOT NULL DEFAULT 0,
  last_reading_sync_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day_key, reader_scope)
);

CREATE TABLE IF NOT EXISTS user_reader_prefs (
  user_scope TEXT PRIMARY KEY,
  settings_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS book_highlights (
  id TEXT PRIMARY KEY,
  user_scope TEXT NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  chapter_index INTEGER NOT NULL DEFAULT 0,
  chapter_title TEXT,
  quote_text TEXT NOT NULL,
  note TEXT,
  color TEXT NOT NULL DEFAULT 'amber',
  locator_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_plan_to_read (
  user_scope TEXT NOT NULL,
  shelf_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_scope, shelf_key)
);

CREATE TABLE IF NOT EXISTS user_plan_to_read_books (
  user_scope TEXT NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_scope, book_id)
);

CREATE TABLE IF NOT EXISTS custom_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_shelves (
  collection_id TEXT NOT NULL REFERENCES custom_collections(id) ON DELETE CASCADE,
  shelf_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, shelf_key)
);

CREATE INDEX IF NOT EXISTS idx_books_shelf ON books(shelf);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_progress_updated_at ON reading_progress(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_discord_access_key_hash ON discord_access(key_hash) WHERE key_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guest_progress_user_updated ON guest_reading_progress(discord_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_progress_updated_at ON guest_reading_progress(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_progress_book_id ON guest_reading_progress(book_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_book ON book_bookmarks(user_scope, book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_book_id ON book_bookmarks(book_id);
CREATE INDEX IF NOT EXISTS idx_shelf_grants_user ON shelf_guest_grants(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_usage_daily_readers_day ON usage_daily_readers(day_key);
CREATE INDEX IF NOT EXISTS idx_usage_daily_readers_scope_day ON usage_daily_readers(reader_scope, day_key);
CREATE INDEX IF NOT EXISTS idx_highlights_user_book ON book_highlights(user_scope, book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_highlights_user_created ON book_highlights(user_scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_to_read_user ON user_plan_to_read(user_scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_to_read_books_user ON user_plan_to_read_books(user_scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_shelves_shelf ON collection_shelves(shelf_key);
