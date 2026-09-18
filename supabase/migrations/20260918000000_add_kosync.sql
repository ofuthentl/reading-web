CREATE TABLE IF NOT EXISTS kosync_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  auth_key text NOT NULL CHECK (auth_key ~ '^[a-f0-9]{32}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kosync_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document text NOT NULL,
  percentage double precision NOT NULL CHECK (percentage >= 0 AND percentage <= 1),
  progress text NOT NULL,
  device text NOT NULL,
  device_id text,
  sync_timestamp bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document)
);

ALTER TABLE kosync_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE kosync_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_kosync_account" ON kosync_accounts;
CREATE POLICY "users_manage_own_kosync_account" ON kosync_accounts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_read_own_kosync_progress" ON kosync_progress;
CREATE POLICY "users_read_own_kosync_progress" ON kosync_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid());