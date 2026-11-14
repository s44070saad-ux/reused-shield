-- Watchlist monitoring + in-app alerts (run once in the Supabase SQL Editor).
create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel_id text not null,
  channel_title text,
  channel_url text,
  last_score int,
  last_level text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, channel_id)
);
alter table public.watchlist enable row level security;
drop policy if exists "own watchlist" on public.watchlist;
create policy "own watchlist" on public.watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  watchlist_id uuid references public.watchlist (id) on delete cascade,
  channel_title text,
  message text not null,
  prev_score int,
  new_score int,
  audit_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.alerts enable row level security;
drop policy if exists "own alerts" on public.alerts;
create policy "own alerts" on public.alerts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
