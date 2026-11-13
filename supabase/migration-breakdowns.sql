-- Channel Breakdowns (run once in the Supabase SQL Editor).
create table if not exists public.breakdowns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel_id text,
  channel_title text,
  channel_url text,
  plan jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.breakdowns enable row level security;
drop policy if exists "own breakdowns" on public.breakdowns;
create policy "own breakdowns" on public.breakdowns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
