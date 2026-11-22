CREATE TABLE IF NOT EXISTS shelf_access_rules (
  shelf_key TEXT PRIMARY KEY,
  access_mode TEXT NOT NULL DEFAULT 'public' CHECK (access_mode IN ('public', 'restricted')),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shelf_guest_grants (
  shelf_key TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  granted_label TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (shelf_key, discord_user_id)
);

CREATE INDEX IF NOT EXISTS idx_shelf_grants_user ON shelf_guest_grants(discord_user_id);
