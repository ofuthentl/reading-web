-- Migration 0010: Bảng đếm gộp thống kê sử dụng theo ngày cho Admin (/usage, D-035)
-- Không lưu IP thật hay nhật ký đọc chi tiết; chỉ đếm gộp theo ngày UTC+7 (~365 dòng/năm).

CREATE TABLE IF NOT EXISTS usage_daily_stats (
  day_key TEXT PRIMARY KEY,
  owner_logins INTEGER NOT NULL DEFAULT 0,
  guest_logins INTEGER NOT NULL DEFAULT 0,
  discord_keys_issued INTEGER NOT NULL DEFAULT 0,
  login_failures INTEGER NOT NULL DEFAULT 0,
  guest_chapter_reads INTEGER NOT NULL DEFAULT 0,
  owner_progress_updates INTEGER NOT NULL DEFAULT 0,
  guest_searches INTEGER NOT NULL DEFAULT 0,
  rate_limit_hits INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_daily_readers (
  day_key TEXT NOT NULL,
  reader_scope TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'guest')),
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (day_key, reader_scope)
);

CREATE INDEX IF NOT EXISTS idx_usage_daily_readers_day
  ON usage_daily_readers(day_key);
