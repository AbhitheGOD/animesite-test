-- ============================================================
-- AniScout v5 Migration — Add 'image' to messages type constraint
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- The original messages table was created with:
--   type text not null check (type in ('text', 'anime'))
-- Image sharing was added in v3 but this constraint was never updated,
-- causing all image message inserts to fail silently.

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_type_check
  CHECK (type IN ('text', 'anime', 'image'));

-- ── Done ─────────────────────────────────────────────────────
