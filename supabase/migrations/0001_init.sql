-- Venture Volleybox Outreach: core schema.
-- All access goes through the server (service role / direct DB connection).
-- RLS is enabled with no policies so the anon/authenticated roles can read nothing.

create table settings (
  id int primary key default 1 check (id = 1),

  -- discovery
  discovery_enabled boolean not null default false,
  discovery_interval_minutes int not null default 360 check (discovery_interval_minutes >= 5),
  discovery_max_per_run int not null default 200 check (discovery_max_per_run between 1 and 5000),
  criteria_birth_years int[] not null default '{2007,2008,2009,2010}',
  criteria_genders text[] not null default '{female,male}',
  criteria_countries text[] not null default '{IT,ES,PT,BR}',
  criteria_positions text[] not null default '{}',

  -- outreach
  outreach_enabled boolean not null default false,
  auto_approve_adults boolean not null default false,
  plan_backlog_cap int not null default 50 check (plan_backlog_cap >= 0),
  daily_cap int not null default 25 check (daily_cap >= 0),
  min_interval_seconds int not null default 120 check (min_interval_seconds >= 0),
  window_start_hour int not null default 9 check (window_start_hour between 0 and 23),
  window_end_hour int not null default 18 check (window_end_hour between 1 and 24),
  send_days int[] not null default '{1,2,3,4,5}',
  timezone text not null default 'America/New_York',
  sender_name text not null default '',
  sender_org text not null default 'Venture Sports USA',

  -- follow-ups / response tracking
  followups_enabled boolean not null default true,
  followup_delay_days int not null default 4 check (followup_delay_days >= 1),
  max_followups int not null default 1 check (max_followups between 0 and 3),
  no_response_after_days int not null default 7 check (no_response_after_days >= 1),

  -- safeguards
  min_contact_age int not null default 16 check (min_contact_age >= 13),

  -- runtime state
  sending_paused_until timestamptz,
  sending_paused_reason text,
  replies_cursor text,
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1);

create table discovery_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  adapter text not null,
  criteria jsonb not null,
  found int not null default 0,
  inserted int not null default 0,
  duplicates int not null default 0,
  skipped_suppressed int not null default 0,
  skipped_criteria int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table athletes (
  id uuid primary key default gen_random_uuid(),
  profile_url text not null unique,
  volleybox_id text,
  full_name text not null,
  first_name text not null,
  birth_year int,
  birth_date date,
  gender text check (gender in ('female', 'male')),
  nationality text,
  position text,
  club text,
  club_country text,
  height_cm int,
  instagram text,
  preferred_language text,
  source text not null,
  raw jsonb,
  status text not null default 'discovered' check (status in (
    'discovered', 'queued', 'contacted', 'replied', 'interested',
    'not_interested', 'suppressed', 'unreachable', 'excluded')),
  excluded_reason text,
  first_contacted_at timestamptz,
  discovery_run_id uuid references discovery_runs (id) on delete set null,
  discovered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index athletes_status_idx on athletes (status);
create index athletes_filter_idx on athletes (birth_year, nationality);
create unique index athletes_volleybox_id_idx on athletes (volleybox_id) where volleybox_id is not null;

create table suppressions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid references athletes (id) on delete set null,
  profile_url text not null unique,
  reason text not null check (reason in ('declined', 'opt_out', 'manual', 'complaint', 'guardian_request')),
  source text not null default 'system',
  note text,
  created_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null unique references athletes (id) on delete cascade,
  adapter text not null,
  thread_id text,
  conversation_url text,
  status text not null default 'active' check (status in ('active', 'stopped', 'closed')),
  stop_reason text,
  outcome text not null default 'pending' check (outcome in ('pending', 'interested', 'not_interested', 'question', 'no_response')),
  followups_sent int not null default 0,
  last_outbound_at timestamptz,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_thread_idx on conversations (adapter, thread_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes (id) on delete cascade,
  conversation_id uuid references conversations (id) on delete set null,
  direction text not null check (direction in ('out', 'in')),
  kind text not null check (kind in ('intro', 'followup', 'reply', 'inbound')),
  language text not null default 'en',
  body text not null,
  status text not null check (status in (
    'pending_approval', 'approved', 'sending', 'sent', 'failed', 'cancelled', 'received')),
  requires_approval boolean not null default true,
  approved_at timestamptz,
  approved_by text,
  send_after timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 3,
  last_error text,
  adapter text,
  external_id text,
  sent_at timestamptz,
  received_at timestamptz,
  category text check (category in ('interested', 'not_interested', 'question', 'no_response')),
  category_source text check (category_source in ('auto', 'manual')),
  confidence real,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Hard duplicate guard: an athlete can only ever have one live intro message.
create unique index one_intro_per_athlete on messages (athlete_id) where kind = 'intro' and status <> 'cancelled';
create unique index inbound_dedupe on messages (adapter, external_id) where direction = 'in' and external_id is not null;
create index messages_queue_idx on messages (status, send_after) where direction = 'out';
create index messages_athlete_idx on messages (athlete_id, created_at);

create table leads (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null unique references athletes (id) on delete cascade,
  status text not null default 'new' check (status in (
    'new', 'in_conversation', 'moved_whatsapp', 'moved_instagram', 'qualified', 'closed_won', 'closed_lost')),
  off_platform_channel text check (off_platform_channel in ('whatsapp', 'instagram')),
  moved_at timestamptz,
  guardian_consent_at timestamptz,
  guardian_note text,
  notes text,
  -- Prepared for the future Pipedrive integration (nothing writes these yet except the sync job).
  pipedrive_person_id text,
  pipedrive_deal_id text,
  pipedrive_sync_status text not null default 'not_synced' check (pipedrive_sync_status in ('not_synced', 'pending', 'synced', 'error')),
  pipedrive_synced_at timestamptz,
  pipedrive_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('interested', 'question', 'sending_paused', 'send_failed', 'job_dead', 'info')),
  athlete_id uuid references athletes (id) on delete cascade,
  message_id uuid references messages (id) on delete set null,
  title text not null,
  body text,
  read_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index alerts_unread_idx on alerts (created_at) where read_at is null;

create table jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'dead')),
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 5,
  last_error text,
  result jsonb,
  locked_at timestamptz,
  locked_by text,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index jobs_due_idx on jobs (run_at) where status = 'queued';

create table event_log (
  id bigint generated always as identity primary key,
  level text not null check (level in ('debug', 'info', 'warn', 'error')),
  source text not null,
  message text not null,
  athlete_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index event_log_created_idx on event_log (created_at desc);

alter table settings enable row level security;
alter table discovery_runs enable row level security;
alter table athletes enable row level security;
alter table suppressions enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table leads enable row level security;
alter table alerts enable row level security;
alter table jobs enable row level security;
alter table event_log enable row level security;
