ALTER TABLE books ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_books_owner_id ON books(owner_id);

ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_books" ON books;
DROP POLICY IF EXISTS "anon_insert_books" ON books;
DROP POLICY IF EXISTS "anon_update_books" ON books;
DROP POLICY IF EXISTS "anon_delete_books" ON books;
DROP POLICY IF EXISTS "user_select_books" ON books;
DROP POLICY IF EXISTS "user_insert_books" ON books;
DROP POLICY IF EXISTS "user_update_books" ON books;
DROP POLICY IF EXISTS "user_delete_books" ON books;

CREATE POLICY "user_select_books" ON books FOR SELECT
  TO authenticated USING (owner_id = auth.uid() OR owner_id IS NULL);

CREATE POLICY "user_insert_books" ON books FOR INSERT
  TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "user_update_books" ON books FOR UPDATE
  TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "user_delete_books" ON books FOR DELETE
  TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "anon_select_chapters" ON chapters;
DROP POLICY IF EXISTS "anon_insert_chapters" ON chapters;
DROP POLICY IF EXISTS "anon_update_chapters" ON chapters;
DROP POLICY IF EXISTS "anon_delete_chapters" ON chapters;
DROP POLICY IF EXISTS "user_select_chapters" ON chapters;
DROP POLICY IF EXISTS "user_insert_chapters" ON chapters;
DROP POLICY IF EXISTS "user_update_chapters" ON chapters;
DROP POLICY IF EXISTS "user_delete_chapters" ON chapters;

CREATE POLICY "user_select_chapters" ON chapters FOR SELECT
  TO authenticated USING (EXISTS (
    SELECT 1 FROM books
    WHERE books.id = chapters.book_id
      AND (books.owner_id = auth.uid() OR books.owner_id IS NULL)
  ));

CREATE POLICY "user_insert_chapters" ON chapters FOR INSERT
  TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM books
    WHERE books.id = chapters.book_id AND books.owner_id = auth.uid()
  ));

CREATE POLICY "user_update_chapters" ON chapters FOR UPDATE
  TO authenticated USING (EXISTS (
    SELECT 1 FROM books
    WHERE books.id = chapters.book_id AND books.owner_id = auth.uid()
  ));

CREATE POLICY "user_delete_chapters" ON chapters FOR DELETE
  TO authenticated USING (EXISTS (
    SELECT 1 FROM books
    WHERE books.id = chapters.book_id AND books.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "anon_select_book_files" ON storage.objects;
DROP POLICY IF EXISTS "anon_insert_book_files" ON storage.objects;
DROP POLICY IF EXISTS "anon_update_book_files" ON storage.objects;
DROP POLICY IF EXISTS "anon_delete_book_files" ON storage.objects;
DROP POLICY IF EXISTS "user_insert_book_files" ON storage.objects;
DROP POLICY IF EXISTS "user_update_book_files" ON storage.objects;
DROP POLICY IF EXISTS "user_delete_book_files" ON storage.objects;

CREATE POLICY "user_insert_book_files" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'books' AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "user_update_book_files" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'books' AND (storage.foldername(name))[1] = auth.uid()::text
  ) WITH CHECK (
    bucket_id = 'books' AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "user_delete_book_files" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'books' AND (storage.foldername(name))[1] = auth.uid()::text
  );
