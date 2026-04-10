-- ============================================================
-- AniScout v10 Migration — Allow anon username lookups
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- The "anyone can read usernames" policy previously required
-- auth.uid() IS NOT NULL, meaning you had to be signed in to
-- check if a username was taken. The sign-up flow needs to check
-- username availability BEFORE authenticating, so anon reads are
-- required. Usernames are public (shown in chat rooms) so this is safe.

DROP POLICY IF EXISTS "anyone can read usernames" ON public.usernames;

CREATE POLICY "anyone can read usernames"
  ON public.usernames FOR SELECT
  USING (true);

-- ── Done ─────────────────────────────────────────────────────
