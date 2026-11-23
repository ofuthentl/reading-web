-- M-8 & M-9: Bổ sung bảng chống brute-force đăng nhập theo IP và các chỉ mục hiệu năng cho D1.

CREATE TABLE IF NOT EXISTS login_rate_limits (
  ip_hash TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_guest_progress_updated_at
  ON guest_reading_progress(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_guest_progress_book_id
  ON guest_reading_progress(book_id);

CREATE INDEX IF NOT EXISTS idx_bookmarks_book_id
  ON book_bookmarks(book_id);
