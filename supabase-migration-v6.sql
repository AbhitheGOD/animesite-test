-- ============================================================
-- AniScout v6 Migration — Fix messages RLS INSERT policy
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- The messages INSERT policy uses is_room_member() (SECURITY DEFINER).
-- auth.uid() inside that function can return the wrong value when called
-- from a WITH CHECK context, causing all message sends to fail with
-- "new row violates row-level security policy for table messages".
--
-- Fix: replace the INSERT policy with an inline EXISTS check so
-- auth.uid() is evaluated directly in the policy (not inside SECURITY DEFINER).

DROP POLICY IF EXISTS "members can send messages" ON public.messages;

CREATE POLICY "members can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_id
        AND rm.user_id = auth.uid()
    )
  );

-- ── Done ─────────────────────────────────────────────────────
