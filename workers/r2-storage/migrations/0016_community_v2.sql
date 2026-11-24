-- Migration 0016: Nâng cấp Bình luận Wave 4 v2 (D-039)
-- Thêm trả lời 1 cấp (parent_id), gắn chương chống spoiler (chapter_number) & 5 emoji reaction

ALTER TABLE library_comments ADD COLUMN parent_id TEXT;
ALTER TABLE library_comments ADD COLUMN chapter_number INTEGER;

CREATE TABLE IF NOT EXISTS library_comment_reactions (
  comment_id TEXT NOT NULL,
  user_scope TEXT NOT NULL,
  emoji TEXT NOT NULL CHECK (emoji IN ('fire', 'cry', 'laugh', 'heart', 'mindblown')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (comment_id, user_scope, emoji)
);

CREATE INDEX IF NOT EXISTS idx_library_comments_parent
  ON library_comments(parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment
  ON library_comment_reactions(comment_id);
