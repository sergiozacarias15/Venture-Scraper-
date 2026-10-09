-- Guided manual discovery on the Volleybox ranking page: one pass per birth year x country x gender section.
create table discovery_passes (
  id uuid primary key default gen_random_uuid(),
  birth_year int not null,
  country text not null,
  gender text not null check (gender in ('female', 'male')),
  status text not null default 'pending' check (status in ('pending', 'done')),
  imported int not null default 0,
  duplicates int not null default 0,
  last_import_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (birth_year, country, gender)
);
alter table discovery_passes enable row level security;
