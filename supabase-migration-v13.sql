-- ============================================================
-- AniScout v13 Migration — Watch Queue (room_queue)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- One row per suggested video per room. Admin picks from this list to start a session.

CREATE TABLE IF NOT EXISTS public.room_queue (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  video_id    text NOT NULL,
  video_title text NOT NULL,
  suggested_by uuid REFERENCES auth.users(id),
  suggested_by_username text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.room_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room members can view queue"
  ON public.room_queue FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_queue.room_id AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "room members can suggest to queue"
  ON public.room_queue FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_queue.room_id AND rm.user_id = auth.uid()
    )
  );

CREATE POLICY "suggester or admin can remove from queue"
  ON public.room_queue FOR DELETE
  USING (
    suggested_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_queue.room_id AND rm.user_id = auth.uid() AND rm.is_admin = true
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.room_queue;

-- ── Done ─────────────────────────────────────────────────────
