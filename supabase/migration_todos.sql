-- ============================================================
-- Migration: board to-dos (wedding planning checklist)
-- Run in the Supabase SQL Editor after schema.sql. Safe to re-run.
-- ============================================================

create table if not exists public.todos (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  body       text not null,
  done       boolean not null default false,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_todos_board on public.todos (board_id, created_at);

alter table public.todos enable row level security;

drop policy if exists todos_rw on public.todos;
create policy todos_rw on public.todos
  for all using (public.is_board_member(board_id, auth.uid()))
  with check (public.is_board_member(board_id, auth.uid()));

grant select, insert, update, delete on public.todos to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'todos'
  ) then
    alter publication supabase_realtime add table public.todos;
  end if;
end $$;
