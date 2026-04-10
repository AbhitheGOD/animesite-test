-- ============================================================
-- AniScout v11 Migration — Seen By (read receipts)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Tracks each user's last-seen message per room (Instagram-style read cursor).
-- One row per (room_id, user_id) — upserted whenever the user reads new messages.

CREATE TABLE IF NOT EXISTS public.message_reads (
  room_id    uuid NOT NULL REFERENCES public.rooms(id)    ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

-- Room members can see all read cursors in rooms they belong to
CREATE POLICY "room members can read message_reads"
  ON public.message_reads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = message_reads.room_id
        AND rm.user_id = auth.uid()
    )
  );

-- Users can insert their own read cursor
CREATE POLICY "users can insert own message_reads"
  ON public.message_reads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own read cursor
CREATE POLICY "users can update own message_reads"
  ON public.message_reads FOR UPDATE
  USING (auth.uid() = user_id);

-- Add to Realtime so seen-by indicators update live
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;

-- ── Done ─────────────────────────────────────────────────────
