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

CREATE INDEX IF NOT EXISTS idx_books_shelf ON books(shelf);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_progress_updated_at ON reading_progress(updated_at DESC);
