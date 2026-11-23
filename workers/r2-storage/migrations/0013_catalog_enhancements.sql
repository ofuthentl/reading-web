-- Wave 3 (D-036): Tên gọi khác (alt_titles), Để dành đọc sau (Kệ & Tập) & Bộ sưu tập tuỳ chỉnh (Custom Collections)
ALTER TABLE shelf_prefs ADD COLUMN alt_titles_json TEXT;

CREATE TABLE IF NOT EXISTS user_plan_to_read (
  user_scope TEXT NOT NULL,
  shelf_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_scope, shelf_key)
);

CREATE INDEX IF NOT EXISTS idx_plan_to_read_user
  ON user_plan_to_read(user_scope, created_at DESC);

CREATE TABLE IF NOT EXISTS user_plan_to_read_books (
  user_scope TEXT NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_scope, book_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_to_read_books_user
  ON user_plan_to_read_books(user_scope, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_collection_shelves_shelf
  ON collection_shelves(shelf_key);
