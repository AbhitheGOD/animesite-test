-- ============================================================
-- AniScout v12 Migration — Watchparty (room_sessions)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- One row per room. Tracks the active watch session state.
-- Any room member can start, update, or end a session.

CREATE TABLE IF NOT EXISTS public.room_sessions (
  room_id          uuid PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  video_id         text NOT NULL,
  video_title      text,
  playback_state   text NOT NULL DEFAULT 'paused'
                     CHECK (playback_state IN ('playing', 'paused')),
  position_seconds double precision NOT NULL DEFAULT 0,
  started_by       uuid REFERENCES auth.users(id),
  updated_by       uuid REFERENCES auth.users(id),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.room_sessions ENABLE ROW LEVEL SECURITY;

-- Room members can view the session
CREATE POLICY "room members can view session"
  ON public.room_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_sessions.room_id
        AND rm.user_id = auth.uid()
    )
  );

-- Room members can start a session
CREATE POLICY "room members can insert session"
  ON public.room_sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_sessions.room_id
        AND rm.user_id = auth.uid()
    )
  );

-- Room members can update session state (play/pause/seek)
CREATE POLICY "room members can update session"
  ON public.room_sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_sessions.room_id
        AND rm.user_id = auth.uid()
    )
  );

-- Room members can end a session
CREATE POLICY "room members can delete session"
  ON public.room_sessions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_sessions.room_id
        AND rm.user_id = auth.uid()
    )
  );

-- Broadcast session changes in real-time
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_sessions;

-- ── Done ─────────────────────────────────────────────────────
