-- Sovereign mirror schema — run once in the INDEPENDENT (non-Lovable) project.
-- Tables are written only by the service-role key from the portal's server;
-- RLS is enabled with no policies so no client can read them directly.

create table if not exists public.guardian_sync_state (
  key text primary key,
  brand_id text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.guardian_sync_log (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  status text not null,
  attempt integer not null default 1,
  http_status integer,
  duration_ms integer,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.guardian_commands (
  id uuid primary key default gen_random_uuid(),
  command_id text not null unique,
  command text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  acked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guardian_patch_state (
  key text primary key,
  local_version_number integer not null default 0,
  master_version_number integer,
  master_patch_text text,
  master_patch_pulled_at timestamptz,
  last_checked_at timestamptz,
  last_healed_at timestamptz,
  last_commit_sha text,
  last_error text,
  consecutive_failures integer not null default 0,
  escalated boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.guardian_capabilities (
  key text primary key,
  name text not null,
  category text,
  version text,
  status text not null default 'pending',
  reported_at timestamptz,
  detail jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.guardian_fleet_portals (
  id uuid primary key default gen_random_uuid(),
  repository_full_name text not null,
  repository_id bigint not null,
  default_branch text not null default 'main',
  portal_key text,
  role text not null default 'candidate',
  evidence jsonb not null default '{}'::jsonb,
  expected_patch_version text not null default 'v70',
  repository_patch_version text,
  live_patch_version text,
  live_url text,
  stage text not null default 'discovered',
  repository_commit_sha text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guardian_fleet_events (
  id uuid primary key default gen_random_uuid(),
  portal_id uuid,
  repository_full_name text not null,
  event text not null,
  status text not null,
  attempt integer not null default 1,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.guardian_code_sync (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  file_count integer not null default 0,
  total_bytes bigint not null default 0,
  files jsonb not null default '[]'::jsonb,
  pushed_ok boolean not null default false,
  channel text,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.guardian_publish_log (
  id uuid primary key default gen_random_uuid(),
  reason text not null,
  fingerprint text,
  status text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.guardian_sync_state enable row level security;
alter table public.guardian_sync_log enable row level security;
alter table public.guardian_commands enable row level security;
alter table public.guardian_patch_state enable row level security;
alter table public.guardian_capabilities enable row level security;
alter table public.guardian_fleet_portals enable row level security;
alter table public.guardian_fleet_events enable row level security;
alter table public.guardian_code_sync enable row level security;
alter table public.guardian_publish_log enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

grant all on public.guardian_sync_state to service_role;
grant all on public.guardian_sync_log to service_role;
grant all on public.guardian_commands to service_role;
grant all on public.guardian_patch_state to service_role;
grant all on public.guardian_capabilities to service_role;
grant all on public.guardian_fleet_portals to service_role;
grant all on public.guardian_fleet_events to service_role;
grant all on public.guardian_code_sync to service_role;
grant all on public.guardian_publish_log to service_role;
grant all on public.profiles to service_role;
grant all on public.user_roles to service_role;
