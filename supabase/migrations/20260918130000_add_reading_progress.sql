CREATE TABLE IF NOT EXISTS reading_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id text NOT NULL,
  scroll_top double precision NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_reading_progress" ON reading_progress;
CREATE POLICY "users_manage_own_reading_progress" ON reading_progress
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_reading_progress_user_updated
  ON reading_progress(user_id, updated_at DESC);
