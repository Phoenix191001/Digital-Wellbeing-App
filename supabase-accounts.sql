-- Pause accounts: run ONCE in Supabase -> SQL Editor -> New query -> Run (after supabase.sql).
-- Each signed-in student gets one private row with their backed-up app data.
-- Row Level Security: a student can only ever read or change their OWN row.

create table if not exists public.pause_user_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint pause_user_data_size check (pg_column_size(data) < 2000000)
);
alter table public.pause_user_data enable row level security;

drop policy if exists "pause: read own row"   on public.pause_user_data;
drop policy if exists "pause: insert own row" on public.pause_user_data;
drop policy if exists "pause: update own row" on public.pause_user_data;
drop policy if exists "pause: delete own row" on public.pause_user_data;
create policy "pause: read own row"   on public.pause_user_data for select to authenticated using ((select auth.uid()) = user_id);
create policy "pause: insert own row" on public.pause_user_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "pause: update own row" on public.pause_user_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "pause: delete own row" on public.pause_user_data for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.pause_user_data from anon;
grant select, insert, update, delete on public.pause_user_data to authenticated;
