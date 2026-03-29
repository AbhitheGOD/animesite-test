-- ============================================================
-- AniScout Rooms — Supabase Migration
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ── Tables ───────────────────────────────────────────────────

create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text unique not null,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);

create table if not exists public.room_members (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null references public.rooms(id) on delete cascade,
  user_id   uuid not null references auth.users(id),
  username  text not null,
  joined_at timestamptz default now(),
  unique(room_id, user_id)
);

create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  user_id       uuid not null references auth.users(id),
  username      text not null,
  type          text not null check (type in ('text', 'anime')),
  content       text,
  anime_payload jsonb,
  created_at    timestamptz default now()
);

-- ── Enable Row Level Security ─────────────────────────────────

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;

-- ── Helper: membership check (security definer avoids RLS recursion) ──────────

create or replace function public.is_room_member(check_room_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists(
    select 1 from public.room_members
    where room_id = check_room_id and user_id = auth.uid()
  );
$$;

-- ── RLS Policies: rooms ───────────────────────────────────────

drop policy if exists "authenticated users can read rooms"   on public.rooms;
drop policy if exists "authenticated users can create rooms" on public.rooms;

-- Any authenticated user can read rooms (required to look up by invite_code when joining)
create policy "authenticated users can read rooms"
  on public.rooms for select
  using (auth.uid() is not null);

-- Authenticated users can create rooms
create policy "authenticated users can create rooms"
  on public.rooms for insert
  with check (auth.uid() = created_by);

-- ── RLS Policies: room_members ────────────────────────────────

drop policy if exists "members can view room members"    on public.room_members;
drop policy if exists "authenticated users can join rooms" on public.room_members;
drop policy if exists "members can leave rooms"          on public.room_members;

-- Members can see other members in rooms they belong to
create policy "members can view room members"
  on public.room_members for select
  using (public.is_room_member(room_id));

-- Authenticated users can insert themselves as a member
create policy "authenticated users can join rooms"
  on public.room_members for insert
  with check (auth.uid() = user_id);

-- Members can remove themselves
create policy "members can leave rooms"
  on public.room_members for delete
  using (auth.uid() = user_id);

-- ── RLS Policies: messages ────────────────────────────────────

drop policy if exists "members can read messages" on public.messages;
drop policy if exists "members can send messages" on public.messages;

-- Only room members can read messages
create policy "members can read messages"
  on public.messages for select
  using (public.is_room_member(room_id));

-- Only room members can send messages (must be sending as themselves)
create policy "members can send messages"
  on public.messages for insert
  with check (
    auth.uid() = user_id
    and public.is_room_member(room_id)
  );

-- ── Realtime ─────────────────────────────────────────────────
-- Enable Realtime replication for live chat + member join events

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'room_members'
  ) then
    alter publication supabase_realtime add table public.room_members;
  end if;
end $$;

-- ── Done ─────────────────────────────────────────────────────
-- After running this migration:
--   1. Go to Supabase Dashboard → Authentication → Settings
--   2. Enable "Allow anonymous sign-ins"
--   3. Set SUPABASE_URL and SUPABASE_ANON_KEY env vars in Vercel
--   4. For local dev: export SUPABASE_URL=... && export SUPABASE_ANON_KEY=...
