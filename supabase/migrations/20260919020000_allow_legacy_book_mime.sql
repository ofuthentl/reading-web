UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/epub+zip',
  'application/x-mobipocket-ebook',
  'application/vnd.comicbook+zip',
  'application/octet-stream',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]::text[],
file_size_limit = 419430400
WHERE id = 'books';