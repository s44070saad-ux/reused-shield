-- Viral Content Finder — migration for the LIVE "reused-shield" project
-- (xfnzddcjsuisudyfjuad) ONLY. Run in the SQL Editor.

create table if not exists public.finder_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  query_key text not null,
  filters jsonb not null default '{}'::jsonb,
  results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.finder_searches enable row level security;
drop policy if exists "own finder select" on public.finder_searches;
create policy "own finder select" on public.finder_searches for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own finder insert" on public.finder_searches;
create policy "own finder insert" on public.finder_searches for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "own finder delete" on public.finder_searches;
create policy "own finder delete" on public.finder_searches for delete to authenticated using (auth.uid() = user_id);
create index if not exists finder_searches_user_key_idx on public.finder_searches (user_id, query_key, created_at desc);
