-- ============================================================
-- AniScout v2 Migration — Unique Usernames + Watchlist
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ── Usernames table ──────────────────────────────────────────
-- Globally unique username → user_id mapping
-- username is the primary key, so DB enforces uniqueness

create table if not exists public.usernames (
  username   text primary key,
  user_id    uuid not null references auth.users(id) unique,
  created_at timestamptz default now()
);

alter table public.usernames enable row level security;

drop policy if exists "anyone can read usernames" on public.usernames;
drop policy if exists "users can claim username"  on public.usernames;

-- Any authenticated user can check if a username exists
create policy "anyone can read usernames"
  on public.usernames for select
  using (auth.uid() is not null);

-- Users can only insert their own username
create policy "users can claim username"
  on public.usernames for insert
  with check (auth.uid() = user_id);

-- ── Watchlist table ───────────────────────────────────────────

create table if not exists public.watchlist (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users(id),
  username text not null,
  mal_id   integer not null,
  title    text,
  poster   text,
  score    numeric,
  year     integer,
  added_at timestamptz default now(),
  unique(user_id, mal_id)
);

alter table public.watchlist enable row level security;

drop policy if exists "users can read own watchlist"   on public.watchlist;
drop policy if exists "users can insert own watchlist" on public.watchlist;
drop policy if exists "users can delete own watchlist" on public.watchlist;

create policy "users can read own watchlist"
  on public.watchlist for select
  using (auth.uid() = user_id);

create policy "users can insert own watchlist"
  on public.watchlist for insert
  with check (auth.uid() = user_id);

create policy "users can delete own watchlist"
  on public.watchlist for delete
  using (auth.uid() = user_id);

-- ── Done ─────────────────────────────────────────────────────
-- After running, test the rooms feature — username claiming
-- now checks the DB for uniqueness before proceeding.
