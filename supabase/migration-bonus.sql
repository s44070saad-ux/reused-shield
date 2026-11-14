-- Signup bonus support: profiles need a creation timestamp (run once).
alter table public.profiles add column if not exists created_at timestamptz not null default now();
