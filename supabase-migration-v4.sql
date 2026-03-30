-- ============================================================
-- AniScout v4 Migration — Admin / Moderation
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ── 1. Add is_admin to room_members ──────────────────────────
ALTER TABLE public.room_members
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- ── 2. Backfill: creators become admins ──────────────────────
UPDATE public.room_members rm
SET is_admin = true
FROM public.rooms r
WHERE rm.room_id = r.id AND rm.user_id = r.created_by;

-- ── 3. Unique constraint (needed for join upsert) ────────────
ALTER TABLE public.room_members
  DROP CONSTRAINT IF EXISTS room_members_room_id_user_id_key;
ALTER TABLE public.room_members
  ADD CONSTRAINT room_members_room_id_user_id_key UNIQUE (room_id, user_id);

-- ── 4. REPLICA IDENTITY FULL on room_members ─────────────────
-- Required so Supabase Realtime DELETE events include old row data
ALTER TABLE public.room_members REPLICA IDENTITY FULL;

-- ── 5. Helper functions (SECURITY DEFINER avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_room_member(room_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = room_uuid AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_room_admin(room_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = room_uuid AND user_id = auth.uid() AND is_admin = true
  );
$$;

-- ── 6. RPC: join a room by invite code (enforces code check) ─
-- This lets JOIN work without exposing all rooms via SELECT RLS.
CREATE OR REPLACE FUNCTION public.join_room_by_code(p_code text, p_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room_id uuid;
  v_room_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated.');
  END IF;

  SELECT id, name INTO v_room_id, v_room_name
  FROM public.rooms WHERE invite_code = upper(p_code);

  IF v_room_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Room not found. Double-check the code.');
  END IF;

  INSERT INTO public.room_members (room_id, user_id, username, is_admin)
  VALUES (v_room_id, auth.uid(), p_username, false)
  ON CONFLICT (room_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('room_id', v_room_id, 'name', v_room_name);
END;
$$;

-- ── 7. Enable RLS on tables ──────────────────────────────────
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;

-- ── 8. RLS: rooms ────────────────────────────────────────────
-- Only members can see their rooms (no public browsing)
DROP POLICY IF EXISTS "members can view rooms" ON public.rooms;
CREATE POLICY "members can view rooms"
  ON public.rooms FOR SELECT
  USING (public.is_room_member(id));

-- Authenticated users can create rooms
DROP POLICY IF EXISTS "authenticated users can create rooms" ON public.rooms;
CREATE POLICY "authenticated users can create rooms"
  ON public.rooms FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

-- Only room admin can update room metadata
DROP POLICY IF EXISTS "admin can update room" ON public.rooms;
CREATE POLICY "admin can update room"
  ON public.rooms FOR UPDATE
  USING (public.is_room_admin(id));

-- ── 9. RLS: room_members ─────────────────────────────────────
-- Members can see the member list for rooms they belong to
DROP POLICY IF EXISTS "members can view room members" ON public.room_members;
CREATE POLICY "members can view room members"
  ON public.room_members FOR SELECT
  USING (public.is_room_member(room_id));

-- Users can insert their own membership row (creator path from rooms.html)
DROP POLICY IF EXISTS "users can join rooms" ON public.room_members;
CREATE POLICY "users can join rooms"
  ON public.room_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Admin can remove any member; users can remove themselves (leave)
DROP POLICY IF EXISTS "admin can remove members" ON public.room_members;
CREATE POLICY "admin can remove members"
  ON public.room_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.is_room_admin(room_id)
  );

-- Only admin can update is_admin (transfer admin role)
DROP POLICY IF EXISTS "admin can transfer admin" ON public.room_members;
CREATE POLICY "admin can transfer admin"
  ON public.room_members FOR UPDATE
  USING (public.is_room_admin(room_id));

-- ── Done ─────────────────────────────────────────────────────
