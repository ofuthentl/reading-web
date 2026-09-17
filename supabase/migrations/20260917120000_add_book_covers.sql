ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_path text;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/epub+zip',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]::text[]
WHERE id = 'books';
