-- Pre-Publish Check history (run once in the Supabase SQL Editor).
create table if not exists public.prepublish_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel_input text not null,
  channel_title text,
  title text not null,
  overall int not null,
  verdict text,
  detail jsonb,
  created_at timestamptz not null default now()
);
alter table public.prepublish_checks enable row level security;
drop policy if exists "own prepublish checks" on public.prepublish_checks;
create policy "own prepublish checks" on public.prepublish_checks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
