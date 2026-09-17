/*
# Create books and chapters tables (single-tenant, no auth)

1. New Tables
- `books`
  - `id` (uuid, primary key)
  - `title` (text, not null)
  - `author` (text, not null)
  - `description` (text, nullable)
  - `cover_color` (text, default '#3b82f6')
  - `created_at` (timestamp)
- `chapters`
  - `id` (uuid, primary key)
  - `book_id` (uuid, foreign key to books, cascade delete)
  - `title` (text, not null)
  - `content` (text, not null)
  - `chapter_number` (int, not null)
  - `created_at` (timestamp)
2. Security
- Enable RLS on both tables.
- Allow anon + authenticated CRUD (single-tenant, intentionally public data).
3. Indexes
- Index on chapters.book_id for fast lookups.
*/

CREATE TABLE IF NOT EXISTS books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text NOT NULL,
  description text,
  cover_color text NOT NULL DEFAULT '#3b82f6',
  file_path text,
  file_type text CHECK (file_type IN ('pdf', 'epub')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE books ADD COLUMN IF NOT EXISTS file_path text;
ALTER TABLE books ADD COLUMN IF NOT EXISTS file_type text;
ALTER TABLE books DROP CONSTRAINT IF EXISTS books_file_type_check;
ALTER TABLE books ADD CONSTRAINT books_file_type_check CHECK (file_type IN ('pdf', 'epub'));

CREATE TABLE IF NOT EXISTS chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  chapter_number int NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id);

ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_books" ON books;
CREATE POLICY "anon_select_books" ON books FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_books" ON books;
CREATE POLICY "anon_insert_books" ON books FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_books" ON books;
CREATE POLICY "anon_update_books" ON books FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_books" ON books;
CREATE POLICY "anon_delete_books" ON books FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_chapters" ON chapters;
CREATE POLICY "anon_select_chapters" ON chapters FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_chapters" ON chapters;
CREATE POLICY "anon_insert_chapters" ON chapters FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_chapters" ON chapters;
CREATE POLICY "anon_update_chapters" ON chapters FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_chapters" ON chapters;
CREATE POLICY "anon_delete_chapters" ON chapters FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('books', 'books', true)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY['application/pdf', 'application/epub+zip']::text[];

DROP POLICY IF EXISTS "anon_select_book_files" ON storage.objects;
CREATE POLICY "anon_select_book_files" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'books');

DROP POLICY IF EXISTS "anon_insert_book_files" ON storage.objects;
CREATE POLICY "anon_insert_book_files" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'books');

DROP POLICY IF EXISTS "anon_update_book_files" ON storage.objects;
CREATE POLICY "anon_update_book_files" ON storage.objects FOR UPDATE
  TO anon, authenticated USING (bucket_id = 'books') WITH CHECK (bucket_id = 'books');

DROP POLICY IF EXISTS "anon_delete_book_files" ON storage.objects;
CREATE POLICY "anon_delete_book_files" ON storage.objects FOR DELETE
  TO anon, authenticated USING (bucket_id = 'books');
