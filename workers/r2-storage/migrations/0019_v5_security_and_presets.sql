-- Migration 0019: v5 Security State (owner_min_iat), Discord Access Presets, Strike Backfill & Redundant Index Cleanup (D-046 / QĐ-5A)

CREATE TABLE IF NOT EXISTS app_security_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  owner_min_iat INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO app_security_state (id, owner_min_iat, updated_at)
VALUES (1, 0, 0);

CREATE TABLE IF NOT EXISTS discord_access_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS discord_access_preset_members (
  preset_id TEXT NOT NULL REFERENCES discord_access_presets(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  member_label TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (preset_id, discord_user_id)
);

CREATE INDEX IF NOT EXISTS idx_discord_preset_members_user
  ON discord_access_preset_members(discord_user_id);

CREATE INDEX IF NOT EXISTS idx_library_comments_created
  ON library_comments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_library_ratings_updated
  ON library_ratings(updated_at DESC);

-- Backfill mốc rl_last_strike_at cho các dòng rl_strikes > 0 tồn đọng trước migration 0017
UPDATE discord_access
SET rl_last_strike_at = CASE
  WHEN COALESCE(rl_updated_at, 0) > 0 THEN rl_updated_at
  WHEN COALESCE(updated_at, 0) > 0 THEN updated_at
  ELSE CAST(strftime('%s', 'now') AS INTEGER) * 1000
END
WHERE COALESCE(rl_strikes, 0) > 0
  AND COALESCE(rl_last_strike_at, 0) = 0;

-- Xoá 2 index dư thừa đã có sẵn trong PRIMARY KEY tương ứng
DROP INDEX IF EXISTS idx_usage_daily_readers_day;
DROP INDEX IF EXISTS idx_comment_reactions_comment;
