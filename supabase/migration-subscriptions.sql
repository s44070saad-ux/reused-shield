-- Manual subscription requests (run once in the Supabase SQL Editor).
-- A signed-in user requests a paid plan; the admin approves/rejects from
-- /admin (service-role API) after payment is arranged off-platform.
create table if not exists public.subscription_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('solo', 'pro', 'agency')),
  contact text not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.subscription_requests enable row level security;
drop policy if exists "read own subscription requests" on public.subscription_requests;
create policy "read own subscription requests" on public.subscription_requests
  for select using (auth.uid() = user_id);
drop policy if exists "insert own subscription requests" on public.subscription_requests;
create policy "insert own subscription requests" on public.subscription_requests
  for insert with check (auth.uid() = user_id);
-- No user update/delete: status changes happen only via the admin API (service role).
