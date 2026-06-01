-- ============================================================
-- Migration: link cards + emoji reactions
-- Run this in the Supabase SQL Editor AFTER the base schema.sql.
-- Safe to re-run.
-- ============================================================

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

create index if not exists idx_links_board     on public.links (board_id);
create index if not exists idx_reactions_board on public.reactions (board_id, shape_id);

alter table public.links     enable row level security;
alter table public.reactions enable row level security;

drop policy if exists links_rw on public.links;
create policy links_rw on public.links
  for all using (public.is_board_member(board_id, auth.uid()))
  with check (public.is_board_member(board_id, auth.uid()));

drop policy if exists reactions_rw on public.reactions;
create policy reactions_rw on public.reactions
  for all using (public.is_board_member(board_id, auth.uid()))
  with check (public.is_board_member(board_id, auth.uid()) and user_id = auth.uid());

-- Base table privileges (RLS still gates rows).
grant select, insert, update, delete on public.links     to authenticated;
grant select, insert, update, delete on public.reactions to authenticated;

-- Realtime change feeds (guarded so re-running is safe).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'links'
  ) then
    alter publication supabase_realtime add table public.links;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reactions'
  ) then
    alter publication supabase_realtime add table public.reactions;
  end if;
end $$;
