ALTER TABLE books DROP CONSTRAINT IF EXISTS books_file_type_check;
ALTER TABLE books ADD CONSTRAINT books_file_type_check
  CHECK (file_type IN ('pdf', 'epub', 'mobi', 'cbz'));

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/epub+zip',
  'application/x-mobipocket-ebook',
  'application/vnd.comicbook+zip',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]::text[]
WHERE id = 'books';
