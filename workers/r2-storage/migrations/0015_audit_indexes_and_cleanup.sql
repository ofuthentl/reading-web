-- Migration 0015: Bổ sung index book_id cho book_highlights & user_plan_to_read_books (Post-Wave 4 Audit)
-- Tăng tốc ON DELETE CASCADE và dọn dữ liệu khi xoá sách, không phá vỡ dữ liệu hiện có.

CREATE INDEX IF NOT EXISTS idx_highlights_book_id
  ON book_highlights(book_id);

CREATE INDEX IF NOT EXISTS idx_plan_to_read_books_book_id
  ON user_plan_to_read_books(book_id);
