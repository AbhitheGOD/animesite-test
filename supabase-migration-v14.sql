-- ============================================================
-- AniScout v14 Migration — Hyperbeam session ID on room_sessions
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Stores the Hyperbeam VM session ID so it can be terminated
-- when the admin ends the watch session.

ALTER TABLE public.room_sessions
  ADD COLUMN IF NOT EXISTS hyperbeam_session_id text;

-- ── Done ─────────────────────────────────────────────────────
