-- ============================================================
-- Wedding Board — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query).
-- Safe to re-run: uses "if not exists" / "or replace" throughout.
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- ============================================================
-- Tables
-- ============================================================

-- profiles: one row per auth user
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  email        text not null default '',
  created_at   timestamptz not null default now()
);

-- boards
create table if not exists public.boards (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default 'Untitled board',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- board_members: membership only (no role/ACL system)
create table if not exists public.board_members (
  board_id uuid not null references public.boards (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

-- uploads: a file placed on a board, keyed to its tldraw shape
create table if not exists public.uploads (
  id                uuid primary key default gen_random_uuid(),
  board_id          uuid not null references public.boards (id) on delete cascade,
  shape_id          text not null,                 -- tldraw shape id (e.g. "shape:abc123")
  storage_path      text not null,                 -- path within the 'uploads' bucket
  file_type         text not null,                 -- mime type
  original_filename text not null,
  status            text not null default '',       -- e.g. shortlisted / maybe / rejected
  created_by        uuid not null references auth.users (id) on delete cascade,
  created_at        timestamptz not null default now(),
  unique (board_id, shape_id)
);

-- ratings: per-user 1..10 rating for a shape
create table if not exists public.ratings (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  shape_id   text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  rating     int  not null check (rating between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shape_id, user_id)
);

-- comments: per-shape threaded-flat comments
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  shape_id   text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

-- links: a saved URL placed on a board, keyed to its tldraw shape (mirrors uploads)
create table if not exists public.links (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.boards (id) on delete cascade,
  shape_id    text not null,
  url         text not null,
  title       text not null default '',
  description text not null default '',
  image_url   text not null default '',
  site_name   text not null default '',
  status      text not null default '',
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (board_id, shape_id)
);

-- reactions: per-user emoji reaction on a shape (toggle; many emojis per user allowed)
create table if not exists public.reactions (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  shape_id   text not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  unique (shape_id, user_id, emoji)
);

-- todos: a simple per-board planning checklist
create table if not exists public.todos (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  body       text not null,
  done       boolean not null default false,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- board_snapshots: the tldraw canvas state (single source of truth for geometry)
create table if not exists public.board_snapshots (
  board_id      uuid primary key references public.boards (id) on delete cascade,
  snapshot_json jsonb not null,
  updated_at    timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_uploads_board   on public.uploads (board_id);
create index if not exists idx_ratings_board   on public.ratings (board_id, shape_id);
create index if not exists idx_comments_board  on public.comments (board_id, shape_id);
create index if not exists idx_members_user    on public.board_members (user_id);
create index if not exists idx_links_board      on public.links (board_id);
create index if not exists idx_reactions_board  on public.reactions (board_id, shape_id);
create index if not exists idx_todos_board      on public.todos (board_id, created_at);

-- ============================================================
-- Membership helper (SECURITY DEFINER to avoid RLS recursion)
-- ============================================================
create or replace function public.is_board_member(p_board_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.board_members m
    where m.board_id = p_board_id and m.user_id = p_user_id
  );
$$;

-- ============================================================
-- Auto-create a profile row when a new auth user signs up
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email,''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Keep updated_at fresh
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_boards on public.boards;
create trigger touch_boards before update on public.boards
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_ratings on public.ratings;
create trigger touch_ratings before update on public.ratings
  for each row execute function public.touch_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles        enable row level security;
alter table public.boards          enable row level security;
alter table public.board_members   enable row level security;
alter table public.uploads         enable row level security;
alter table public.ratings         enable row level security;
alter table public.comments        enable row level security;
alter table public.links           enable row level security;
alter table public.reactions       enable row level security;
alter table public.todos           enable row level security;
alter table public.board_snapshots enable row level security;

-- ---- profiles ----
-- Everyone signed-in can read profiles (so we can show names on a shared board).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---- boards ----
drop policy if exists boards_select on public.boards;
create policy boards_select on public.boards
  for select using (public.is_board_member(id, auth.uid()) or created_by = auth.uid());

drop policy if exists boards_insert on public.boards;
create policy boards_insert on public.boards
  for insert with check (created_by = auth.uid());

drop policy if exists boards_update on public.boards;
create policy boards_update on public.boards
  for update using (public.is_board_member(id, auth.uid()))
  with check (public.is_board_member(id, auth.uid()));

drop policy if exists boards_delete on public.boards;
create policy boards_delete on public.boards
  for delete using (created_by = auth.uid());

-- ---- board_members ----
-- A user can see membership rows for boards they belong to.
drop policy if exists members_select on public.board_members;
create policy members_select on public.board_members
  for select using (public.is_board_member(board_id, auth.uid()));

-- The board creator can add members; a user may add themselves (used at board creation).
drop policy if exists members_insert on public.board_members;
create policy members_insert on public.board_members
  for insert with check (
    user_id = auth.uid()
    or exists (select 1 from public.boards b where b.id = board_id and b.created_by = auth.uid())
  );

drop policy if exists members_delete on public.board_members;
create policy members_delete on public.board_members
  for delete using (
    exists (select 1 from public.boards b where b.id = board_id and b.created_by = auth.uid())
  );

-- ---- uploads / ratings / comments / snapshots: member-scoped ----
drop policy if exists uploads_rw on public.uploads;
create policy uploads_rw on public.uploads
  for all using (public.is_board_member(board_id, auth.uid()))
  with check (public.is_board_member(board_id, auth.uid()));

drop policy if exists ratings_rw on public.ratings;
create policy ratings_rw on public.ratings
  for all using (public.is_board_member(board_id, auth.uid()))
  with check (public.is_board_member(board_id, auth.uid()) and user_id = auth.uid());

drop policy if exists comments_rw on public.comments;
create policy comments_rw on public.comments
  for all using (public.is_board_member(board_id, auth.uid()))
  with check (public.is_board_member(board_id, auth.uid()) and user_id = auth.uid());

drop policy if exists links_rw on public.links;
create policy links_rw on public.links
  for all using (public.is_board_member(board_id, auth.uid()))
  with check (public.is_board_member(board_id, auth.uid()));

drop policy if exists reactions_rw on public.reactions;
create policy reactions_rw on public.reactions
  for all using (public.is_board_member(board_id, auth.uid()))
  with check (public.is_board_member(board_id, auth.uid()) and user_id = auth.uid());

drop policy if exists todos_rw on public.todos;
create policy todos_rw on public.todos
  for all using (public.is_board_member(board_id, auth.uid()))
  with check (public.is_board_member(board_id, auth.uid()));

drop policy if exists snapshots_rw on public.board_snapshots;
create policy snapshots_rw on public.board_snapshots
  for all using (public.is_board_member(board_id, auth.uid()))
  with check (public.is_board_member(board_id, auth.uid()));

-- ============================================================
-- Table privileges
-- RLS decides WHICH ROWS are visible/writable, but the role still needs base
-- table privileges first. Supabase does not always auto-grant these for tables
-- created via raw SQL, so grant them explicitly. (RLS remains the gatekeeper.)
-- ============================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- ============================================================
-- Realtime: broadcast row changes for these tables
-- ============================================================
alter publication supabase_realtime add table public.ratings;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.uploads;
alter publication supabase_realtime add table public.links;
alter publication supabase_realtime add table public.reactions;
alter publication supabase_realtime add table public.todos;

-- ============================================================
-- Storage bucket + policies  ('uploads' bucket)
-- Files are stored at:  {board_id}/{uuid}-{original filename}
-- so the first path segment identifies the board for RLS.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

drop policy if exists uploads_obj_select on storage.objects;
create policy uploads_obj_select on storage.objects
  for select using (
    bucket_id = 'uploads'
    and public.is_board_member((split_part(name, '/', 1))::uuid, auth.uid())
  );

drop policy if exists uploads_obj_insert on storage.objects;
create policy uploads_obj_insert on storage.objects
  for insert with check (
    bucket_id = 'uploads'
    and public.is_board_member((split_part(name, '/', 1))::uuid, auth.uid())
  );

drop policy if exists uploads_obj_delete on storage.objects;
create policy uploads_obj_delete on storage.objects
  for delete using (
    bucket_id = 'uploads'
    and public.is_board_member((split_part(name, '/', 1))::uuid, auth.uid())
  );
