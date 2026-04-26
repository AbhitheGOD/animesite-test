-- ============================================================
-- AniScout v15 Migration — Username Update + Profiles Table
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ── Allow users to delete their own username row (needed for username changes) ──
drop policy if exists "users can delete own username" on public.usernames;
create policy "users can delete own username"
  on public.usernames for delete
  using (auth.uid() = user_id);

-- ── Profiles table (bio, display name extras) ─────────────────────────────────
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  bio        text default '' check (char_length(bio) <= 160),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "users can read own profile"   on public.profiles;
drop policy if exists "users can insert own profile" on public.profiles;
drop policy if exists "users can update own profile" on public.profiles;

create policy "users can read own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "users can update own profile"
  on public.profiles for update
  using (auth.uid() = user_id);

-- ── Done ──────────────────────────────────────────────────────────────────────
-- After running, username changes and bio saves will be fully DB-backed.
