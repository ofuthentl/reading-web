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

CREATE INDEX IF NOT EXISTS idx_highlights_user_book
  ON book_highlights(user_scope, book_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_highlights_user_created
  ON book_highlights(user_scope, created_at DESC);
