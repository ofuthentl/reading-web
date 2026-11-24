-- Migration 0018: v4 Catalog, Half-Star Ratings, Re-read Count, Shelf Relations & 3-Tier Book/Chapter Access (D-042)

ALTER TABLE library_ratings ADD COLUMN rating_half INTEGER CHECK (rating_half BETWEEN 1 AND 10);
ALTER TABLE reading_progress ADD COLUMN reread_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guest_reading_progress ADD COLUMN reread_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS shelf_relations (
  source_shelf_key TEXT NOT NULL,
  target_shelf_key TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('sequel', 'spinoff', 'same_universe')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (source_shelf_key, target_shelf_key),
  CHECK (source_shelf_key != target_shelf_key)
);

CREATE INDEX IF NOT EXISTS idx_shelf_relations_target ON shelf_relations(target_shelf_key);

CREATE TABLE IF NOT EXISTS book_access_rules (
  book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  access_mode TEXT NOT NULL CHECK (access_mode IN ('public', 'restricted')),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS book_guest_grants (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  granted_label TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (book_id, discord_user_id)
);

CREATE INDEX IF NOT EXISTS idx_book_grants_user ON book_guest_grants(discord_user_id);

CREATE TABLE IF NOT EXISTS chapter_access_rules (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_key TEXT NOT NULL,
  access_mode TEXT NOT NULL DEFAULT 'restricted' CHECK (access_mode = 'restricted'),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (book_id, chapter_key)
);

CREATE TABLE IF NOT EXISTS chapter_guest_grants (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_key TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  granted_label TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (book_id, chapter_key, discord_user_id)
);

CREATE INDEX IF NOT EXISTS idx_chapter_grants_user ON chapter_guest_grants(discord_user_id);
