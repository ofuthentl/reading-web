-- Wave 4 (Mục 15): Bình luận & Chấm điểm 1–5 sao theo Bộ truyện ('shelf') hoặc Tập lẻ ('book')
-- Chi phí $0 trên D1, 0 byte R2 phát sinh.

CREATE TABLE IF NOT EXISTS library_ratings (
  target_type TEXT NOT NULL CHECK (target_type IN ('shelf', 'book')),
  target_key TEXT NOT NULL,
  user_scope TEXT NOT NULL,
  author_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (target_type, target_key, user_scope)
);

CREATE TABLE IF NOT EXISTS library_comments (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('shelf', 'book')),
  target_key TEXT NOT NULL,
  user_scope TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_library_comments_target
  ON library_comments(target_type, target_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_library_comments_user_created
  ON library_comments(user_scope, created_at DESC);
