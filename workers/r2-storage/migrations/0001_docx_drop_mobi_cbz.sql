-- Migration 0001: Drop MOBI/CBZ and add DOCX support (D-009)
DELETE FROM reading_progress WHERE book_id IN (SELECT id FROM books WHERE file_type IN ('mobi', 'cbz'));
DELETE FROM books WHERE file_type IN ('mobi', 'cbz');

DROP TABLE IF EXISTS _progress_backup;
CREATE TABLE _progress_backup AS SELECT * FROM reading_progress;
DROP TABLE reading_progress;

DROP TABLE IF EXISTS books_new;
CREATE TABLE books_new (
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

INSERT INTO books_new (id, title, author, shelf, description, cover_color, cover_key, file_key, file_type, file_size, cover_size, created_at)
SELECT id, title, author, shelf, description, cover_color, cover_key, file_key, file_type, file_size, cover_size, created_at
FROM books;

DROP TABLE books;
ALTER TABLE books_new RENAME TO books;

CREATE TABLE reading_progress (
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

INSERT INTO reading_progress (book_id, chapter_id, chapter_index, chapter_title, total_chapters, scroll_ratio, scroll_top, completed, updated_at)
SELECT book_id, chapter_id, chapter_index, chapter_title, total_chapters, scroll_ratio, scroll_top, completed, updated_at
FROM _progress_backup
WHERE book_id IN (SELECT id FROM books);

DROP TABLE _progress_backup;

CREATE INDEX IF NOT EXISTS idx_books_shelf ON books(shelf);
CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_progress_updated_at ON reading_progress(updated_at DESC);
