-- Migration 0002: Lưu tuỳ chọn kệ sách đồng bộ đa thiết bị — ảnh bìa đại diện & ghim kệ yêu thích (D-025)
CREATE TABLE IF NOT EXISTS shelf_prefs (
  shelf_key TEXT PRIMARY KEY,
  cover_book_id TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
