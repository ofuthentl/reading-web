-- Replace the old public-library behavior with explicit per-account sharing.
DROP POLICY IF EXISTS "user_select_books" ON books;
CREATE POLICY "user_select_books" ON books FOR SELECT
  TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "user_select_chapters" ON chapters;
CREATE POLICY "user_select_chapters" ON chapters FOR SELECT
  TO authenticated USING (EXISTS (
    SELECT 1 FROM books
    WHERE books.id = chapters.book_id
      AND books.owner_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.send_books_to_email(
  target_email text,
  source_book_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_user_id uuid;
  source_book books%ROWTYPE;
  copied_book_id uuid;
  sent_titles text[] := ARRAY[]::text[];
  duplicate_titles text[] := ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để gửi sách.';
  END IF;

  SELECT id INTO target_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(target_email))
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản với email này.';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Không thể gửi sách cho chính tài khoản hiện tại.';
  END IF;

  FOR source_book IN
    SELECT * FROM books
    WHERE id = ANY(source_book_ids)
      AND owner_id = auth.uid()
  LOOP
    IF EXISTS (
      SELECT 1 FROM books
      WHERE owner_id = target_user_id
        AND lower(title) = lower(source_book.title)
        AND lower(author) = lower(source_book.author)
    ) THEN
      duplicate_titles := array_append(duplicate_titles, source_book.title);
      CONTINUE;
    END IF;

    INSERT INTO books (
      title, author, description, cover_color, cover_path, file_path, file_type,
      owner_id, is_public, created_at
    )
    VALUES (
      source_book.title, source_book.author, source_book.description,
      source_book.cover_color, source_book.cover_path, source_book.file_path,
      source_book.file_type, target_user_id, false, now()
    )
    RETURNING id INTO copied_book_id;

    INSERT INTO chapters (book_id, title, content, chapter_number, created_at)
    SELECT copied_book_id, title, content, chapter_number, created_at
    FROM chapters
    WHERE chapters.book_id = source_book.id;

    sent_titles := array_append(sent_titles, source_book.title);
  END LOOP;

  RETURN jsonb_build_object(
    'sent_count', cardinality(sent_titles),
    'sent_titles', to_jsonb(sent_titles),
    'duplicate_count', cardinality(duplicate_titles),
    'duplicate_titles', to_jsonb(duplicate_titles)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_books_to_email(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_books_to_email(text, uuid[]) TO authenticated;
