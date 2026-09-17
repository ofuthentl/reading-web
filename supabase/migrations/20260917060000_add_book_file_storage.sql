ALTER TABLE books ADD COLUMN IF NOT EXISTS file_path text;
ALTER TABLE books ADD COLUMN IF NOT EXISTS file_type text;

ALTER TABLE books DROP CONSTRAINT IF EXISTS books_file_type_check;
ALTER TABLE books ADD CONSTRAINT books_file_type_check
  CHECK (file_type IN ('pdf', 'epub'));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'books',
  'books',
  true,
  104857600,
  ARRAY['application/pdf', 'application/epub+zip']::text[]
)
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
