-- ============================================================
-- AniScout v3 Migration — Chat Upgrades
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ── 1. Add reply_to column to messages ───────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to jsonb;

-- ── 2. Create chat-images storage bucket ─────────────────────
-- Run this in Supabase Dashboard → Storage → New bucket
-- Name: chat-images, Public: true
-- Or run via SQL:

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Storage RLS: authenticated users can upload ───────────
DROP POLICY IF EXISTS "authenticated users can upload chat images" ON storage.objects;
CREATE POLICY "authenticated users can upload chat images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-images'
    AND auth.uid() IS NOT NULL
  );

-- Allow anyone to read (public bucket)
DROP POLICY IF EXISTS "public read chat images" ON storage.objects;
CREATE POLICY "public read chat images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-images');

-- ── Done ─────────────────────────────────────────────────────
