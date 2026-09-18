-- Keep book files private and allow signed URLs only for accounts that own or received a book.
UPDATE storage.buckets
SET public = false
WHERE id = 'books';

DROP POLICY IF EXISTS "anon_select_book_files" ON storage.objects;
DROP POLICY IF EXISTS "user_select_book_files" ON storage.objects;
DROP POLICY IF EXISTS "user_insert_book_files" ON storage.objects;
DROP POLICY IF EXISTS "user_update_book_files" ON storage.objects;
DROP POLICY IF EXISTS "user_delete_book_files" ON storage.objects;

CREATE POLICY "user_select_book_files" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'books'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.books
        WHERE books.owner_id = auth.uid()
          AND (books.file_path = storage.objects.name OR books.cover_path = storage.objects.name)
      )
    )
  );

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
