-- Reused-Content Shield — schema
-- Run in the SQL Editor of the NEW "reused-shield" Supabase project ONLY.
-- Never run in PharmaHub (hkigldiypjninnnvxlnb), Velora/menuqr
-- (owrbvnjptzbbufghoilt) or RichCalls (vgtwptdkqaizjanzsxrt).

create extension if not exists pgcrypto;

-- ── Waitlist (public, insert-only) ──────────────────────────────────────────
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  channel_url text,
  role text,
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;
drop policy if exists "anyone can join waitlist" on public.waitlist;
create policy "anyone can join waitlist" on public.waitlist
  for insert to anon, authenticated with check (true);
-- No select/update/delete policies for anon/authenticated: the list is private.

-- ── Audits (owner only) ─────────────────────────────────────────────────────
create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel_input text not null,
  channel_id text,
  channel_title text,
  channel_url text,
  subscriber_count bigint,
  video_count_sampled int not null default 0,
  score int not null,
  level text not null,
  signals jsonb not null default '[]'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  fixes jsonb not null default '[]'::jsonb,
  videos jsonb not null default '[]'::jsonb,
  self_check jsonb,
  created_at timestamptz not null default now()
);
alter table public.audits enable row level security;
drop policy if exists "own audits select" on public.audits;
create policy "own audits select" on public.audits for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own audits insert" on public.audits;
create policy "own audits insert" on public.audits for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "own audits update" on public.audits;
create policy "own audits update" on public.audits for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own audits delete" on public.audits;
create policy "own audits delete" on public.audits for delete to authenticated using (auth.uid() = user_id);

-- ── Provenance Vault entries (owner only) ───────────────────────────────────
create table if not exists public.provenance_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  audit_id uuid references public.audits (id) on delete set null,
  video_ref text not null,           -- video title or YouTube video ID/URL
  kind text not null check (kind in ('script','voiceover','sources','project-file','note')),
  title text not null,
  detail text,
  link text,
  created_at timestamptz not null default now()  -- the timestamp IS the evidence trail
);
alter table public.provenance_entries enable row level security;
drop policy if exists "own provenance select" on public.provenance_entries;
create policy "own provenance select" on public.provenance_entries for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own provenance insert" on public.provenance_entries;
create policy "own provenance insert" on public.provenance_entries for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "own provenance update" on public.provenance_entries;
create policy "own provenance update" on public.provenance_entries for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own provenance delete" on public.provenance_entries;
create policy "own provenance delete" on public.provenance_entries for delete to authenticated using (auth.uid() = user_id);

-- ── Rejection deadline tracker (owner only) ─────────────────────────────────
create table if not exists public.deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel_title text not null,
  rejection_date date not null,
  rejection_count int not null default 1 check (rejection_count >= 1),
  notes text,
  created_at timestamptz not null default now()
);
alter table public.deadlines enable row level security;
drop policy if exists "own deadlines select" on public.deadlines;
create policy "own deadlines select" on public.deadlines for select to authenticated using (auth.uid() = user_id);
drop policy if exists "own deadlines insert" on public.deadlines;
create policy "own deadlines insert" on public.deadlines for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "own deadlines update" on public.deadlines;
create policy "own deadlines update" on public.deadlines for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own deadlines delete" on public.deadlines;
create policy "own deadlines delete" on public.deadlines for delete to authenticated using (auth.uid() = user_id);

-- ── Viral Content Finder searches (owner only) ──────────────────────────────
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
