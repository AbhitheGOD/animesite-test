-- ============================================================
-- AniScout v9 Migration — Watchlist UPDATE policy
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- The watchlist table had SELECT, INSERT, DELETE policies but no UPDATE policy.
-- updateStatus() in watchlist.html calls .update({status}) which was silently
-- blocked by RLS, so status changes never saved.

CREATE POLICY "users can update own watchlist"
  ON public.watchlist FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Done ─────────────────────────────────────────────────────
