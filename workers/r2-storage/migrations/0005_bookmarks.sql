-- Migration 0005: Đồng bộ Dấu trang & Ghi chú ngắn cách ly theo vai trò (D-029)
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

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_book
ON book_bookmarks(user_scope, book_id, created_at DESC);
