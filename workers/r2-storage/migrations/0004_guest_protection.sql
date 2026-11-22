-- Migration 0004: Guest content anti-crawl protection — indexed chapter packs, Token Bucket anti-bot, UA binding & ban controls (D-028)

CREATE TABLE IF NOT EXISTS book_guest_packs (
  book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  pack_key TEXT NOT NULL,
  pack_size INTEGER NOT NULL DEFAULT 0,
  chapter_count INTEGER NOT NULL DEFAULT 0,
  manifest_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

ALTER TABLE discord_access ADD COLUMN ua_hash TEXT;
ALTER TABLE discord_access ADD COLUMN rl_tokens REAL NOT NULL DEFAULT 10;
ALTER TABLE discord_access ADD COLUMN rl_updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE discord_access ADD COLUMN rl_strikes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE discord_access ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE discord_access ADD COLUMN ban_reason TEXT;
