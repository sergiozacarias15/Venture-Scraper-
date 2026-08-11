create extension if not exists "pgcrypto";

create table if not exists public.volleyball_assessments (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  sport text not null check (sport = 'Volleyball'),
  agent text not null,
  language text not null,
  country text,
  "marketingSource" text,
  "submittedAt" timestamptz not null,
  "sourceRoute" text not null,
  created_at timestamptz not null default now()
);

alter table public.volleyball_assessments enable row level security;

-- This initial policy permits anonymous form submissions without exposing saved rows.
-- For production, prefer an Edge Function with CAPTCHA and rate limiting.
create policy "allow anonymous assessment inserts"
on public.volleyball_assessments
for insert
to anon
with check (
  sport = 'Volleyball'
  and agent = 'Sergio Zacarias'
);

revoke select, update, delete on public.volleyball_assessments from anon;
grant insert on public.volleyball_assessments to anon;
