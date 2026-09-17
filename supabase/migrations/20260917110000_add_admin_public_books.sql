CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_read_own_role" ON user_roles;
CREATE POLICY "users_read_own_role" ON user_roles FOR SELECT
  TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

ALTER TABLE books ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "user_select_books" ON books;
DROP POLICY IF EXISTS "user_insert_books" ON books;
DROP POLICY IF EXISTS "user_update_books" ON books;
DROP POLICY IF EXISTS "user_delete_books" ON books;

CREATE POLICY "user_select_books" ON books FOR SELECT
  TO authenticated USING (
    owner_id = auth.uid() OR is_public = true OR owner_id IS NULL
  );

CREATE POLICY "user_insert_books" ON books FOR INSERT
  TO authenticated WITH CHECK (
    owner_id = auth.uid() AND (is_public = false OR public.is_admin())
  );

CREATE POLICY "user_update_books" ON books FOR UPDATE
  TO authenticated USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() AND (is_public = false OR public.is_admin()));

CREATE POLICY "user_delete_books" ON books FOR DELETE
  TO authenticated USING (owner_id = auth.uid());
