-- Pause "Find your people": run this ONCE in Supabase -> SQL Editor -> New query -> Run.
-- All community data lives in one table that only the server (service_role key) can touch.
-- Row Level Security is ON with NO policies, so the public anon key can read/write nothing.

create table if not exists public.pause_kv (
  key        text primary key,
  value      text not null,
  expires_at timestamptz
);
alter table public.pause_kv enable row level security;
revoke all on public.pause_kv from anon, authenticated;

-- Atomic helpers (lists / sets are stored as JSON arrays)
create or replace function public.pause_lpush(k text, v text) returns void
language sql as $$
  insert into public.pause_kv(key, value) values (k, jsonb_build_array(v)::text)
  on conflict (key) do update set value = (jsonb_build_array(v) || public.pause_kv.value::jsonb)::text
$$;

create or replace function public.pause_lrem(k text, v text) returns void
language sql as $$
  update public.pause_kv
     set value = (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(value::jsonb) x where x <> to_jsonb(v))::text
   where key = k
$$;

create or replace function public.pause_sadd(k text, v text) returns void
language sql as $$
  insert into public.pause_kv(key, value) values (k, jsonb_build_array(v)::text)
  on conflict (key) do update set value =
    case when public.pause_kv.value::jsonb ? v then public.pause_kv.value
         else (public.pause_kv.value::jsonb || to_jsonb(v))::text end
$$;

-- counter with a 1-hour window (used for rate limits and moderator lockout)
create or replace function public.pause_incr(k text, ttl int) returns int
language sql as $$
  insert into public.pause_kv(key, value, expires_at) values (k, '1', now() + make_interval(secs => ttl))
  on conflict (key) do update set
    value      = case when public.pause_kv.expires_at < now() then '1' else (public.pause_kv.value::int + 1)::text end,
    expires_at = case when public.pause_kv.expires_at < now() then now() + make_interval(secs => ttl) else public.pause_kv.expires_at end
  returning value::int
$$;

revoke all on function public.pause_lpush(text, text), public.pause_lrem(text, text), public.pause_sadd(text, text), public.pause_incr(text, int) from public, anon, authenticated;
grant execute on function public.pause_lpush(text, text), public.pause_lrem(text, text), public.pause_sadd(text, text), public.pause_incr(text, int) to service_role;
