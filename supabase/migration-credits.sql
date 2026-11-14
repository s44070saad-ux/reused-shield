-- Plans + credit ledger (run once in the Supabase SQL Editor).
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free',
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = user_id);
drop policy if exists "create own profile" on public.profiles;
create policy "create own profile" on public.profiles
  for insert with check (auth.uid() = user_id);
-- NOTE: no update/delete policies — plan changes happen only via the admin
-- API using the service role, so users cannot upgrade themselves for free.

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  cost int not null,
  created_at timestamptz not null default now()
);
alter table public.usage_events enable row level security;
drop policy if exists "read own usage" on public.usage_events;
create policy "read own usage" on public.usage_events
  for select using (auth.uid() = user_id);
drop policy if exists "insert own usage" on public.usage_events;
create policy "insert own usage" on public.usage_events
  for insert with check (auth.uid() = user_id);

-- The owner's own account starts on Agency so he can test everything.
insert into public.profiles (user_id, plan)
select id, 'agency' from auth.users where email = 's44070saad@gmail.com'
on conflict (user_id) do update set plan = 'agency';
