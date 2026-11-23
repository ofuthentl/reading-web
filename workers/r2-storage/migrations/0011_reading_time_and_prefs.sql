-- Migration 0011: Thời gian đọc thực tế (PA-1), Streak 90 ngày & Đồng bộ ReaderSettings (D-036 Wave 1)
-- Tất cả cột mới đều có DEFAULT 0 để tương thích ngược 100% với dữ liệu sẵn có trên D1.

ALTER TABLE usage_daily_stats ADD COLUMN owner_reading_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_daily_stats ADD COLUMN guest_reading_seconds INTEGER NOT NULL DEFAULT 0;

ALTER TABLE usage_daily_readers ADD COLUMN reading_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_daily_readers ADD COLUMN last_reading_sync_at INTEGER NOT NULL DEFAULT 0;

ALTER TABLE reading_progress ADD COLUMN reading_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guest_reading_progress ADD COLUMN reading_seconds INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS user_reader_prefs (
  user_scope TEXT PRIMARY KEY,
  settings_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_daily_readers_scope_day
  ON usage_daily_readers(reader_scope, day_key);
