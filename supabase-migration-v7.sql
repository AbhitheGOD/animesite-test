-- ============================================================
-- AniScout v7 Migration — Fix messages RLS definitively
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Root cause: the messages INSERT policy calls is_room_member(room_id)
-- which uses auth.uid() inside a SECURITY DEFINER body — that can return
-- the wrong value in a WITH CHECK context.
-- v6 tried an EXISTS subquery but `room_id` was ambiguous (both messages
-- and room_members have a room_id column), so the correlated subquery
-- silently became rm.room_id = rm.room_id (always true) while the
-- auth.uid() = user_id check still blocked the insert.
--
-- Fix: a helper that takes BOTH values as explicit parameters so
-- auth.uid() is evaluated in the policy expression (normal context)
-- and the function never needs to call it internally.

CREATE OR REPLACE FUNCTION public.is_member_of(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id AND user_id = p_user_id
  );
$$;

-- Recreate messages policies using the new helper
DROP POLICY IF EXISTS "members can read messages"  ON public.messages;
DROP POLICY IF EXISTS "members can send messages"  ON public.messages;

CREATE POLICY "members can read messages"
  ON public.messages FOR SELECT
  USING (public.is_member_of(room_id, auth.uid()));

CREATE POLICY "members can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_member_of(room_id, auth.uid())
  );

-- ── Done ─────────────────────────────────────────────────────
