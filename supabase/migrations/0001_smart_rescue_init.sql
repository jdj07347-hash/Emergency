-- Smart Rescue — initial schema (DEMO MODE)
-- All writes happen server-side through the service-role key.
-- The anon key is only used by browsers to receive Realtime change notifications.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Demo units
-- ---------------------------------------------------------------------------

create table if not exists public.responders (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('FIRE', 'POLICE', 'AMBULANCE')),
  demo_number int not null check (demo_number between 1 and 99),
  name text not null,
  callsign text not null,
  station text not null,
  latitude double precision not null,
  longitude double precision not null,
  -- Offsets (km) from the demo center; used when the demo area is re-centered.
  offset_north_km double precision not null default 0,
  offset_east_km double precision not null default 0,
  status text not null default 'AVAILABLE'
    check (status in ('AVAILABLE', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'RESPONDING', 'COMPLETED', 'BUSY')),
  updated_at timestamptz not null default now(),
  unique (type, demo_number)
);

create table if not exists public.hospitals (
  id uuid primary key default gen_random_uuid(),
  demo_number int not null unique check (demo_number between 1 and 99),
  name text not null,
  short_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  offset_north_km double precision not null default 0,
  offset_east_km double precision not null default 0,
  is_available boolean not null default true,
  -- "Number of emergency patients the hospital can currently accommodate and begin treating."
  emergency_capacity int not null default 10 check (emergency_capacity >= 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Incidents
-- ---------------------------------------------------------------------------

create sequence if not exists public.incident_number_seq start 1042;

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.incident_number_seq'),
  code text generated always as ('SR-' || number::text) stored,
  status text not null default 'ANALYZING'
    check (status in ('ANALYZING', 'PENDING_REVIEW', 'DISPATCHING', 'IN_PROGRESS', 'RESOLVED')),

  description text,
  transcript text,

  -- AI interpretation (advisory only)
  ai_status text not null default 'PENDING' check (ai_status in ('PENDING', 'COMPLETED', 'FAILED', 'MANUAL')),
  ai_error text,
  ai_severity text check (ai_severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  ai_severity_score int check (ai_severity_score between 0 and 100),
  ai_confidence numeric(4, 3),
  ai_summary text,
  ai_reasoning jsonb not null default '[]'::jsonb,
  ai_victims_min int,
  ai_victims_max int,

  -- Backend decisions (authoritative)
  category text check (category in ('FIRE', 'ROAD_ACCIDENT', 'MEDICAL_EMERGENCY', 'FLOOD', 'BUILDING_COLLAPSE', 'NATURAL_DISASTER', 'OTHER')),
  severity text check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  priority_score int check (priority_score between 0 and 100),
  priority_breakdown jsonb,
  trapped_possible boolean not null default false,
  fire_risk boolean not null default false,
  life_threatening boolean not null default false,
  required_services text[] not null default '{}',

  citizen_victims int check (citizen_victims >= 0),
  hospital_required boolean not null default false,
  patients_to_allocate int not null default 0 check (patients_to_allocate >= 0),
  hospital_status text not null default 'NOT_REQUIRED'
    check (hospital_status in ('NOT_REQUIRED', 'COORDINATING', 'COVERED', 'UNCOVERED')),

  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  gps_accuracy double precision,
  gps_captured_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists incidents_created_at_idx on public.incidents (created_at desc);

-- Citizen tracking tokens. NOT readable with the anon key.
create table if not exists public.incident_tracking (
  incident_id uuid primary key references public.incidents (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days')
);

create table if not exists public.incident_media (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  kind text not null check (kind in ('AUDIO', 'IMAGE', 'VIDEO')),
  storage_path text not null,
  public_url text not null,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists incident_media_incident_idx on public.incident_media (incident_id);

-- ---------------------------------------------------------------------------
-- Response
-- ---------------------------------------------------------------------------

create table if not exists public.responder_assignments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  responder_id uuid not null references public.responders (id),
  responder_type text not null check (responder_type in ('FIRE', 'POLICE', 'AMBULANCE')),
  status text not null default 'DISPATCHED'
    check (status in ('DISPATCHED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'RESPONDING', 'COMPLETED', 'REJECTED')),
  distance_km double precision not null,
  dispatched_at timestamptz not null default now(),
  accepted_at timestamptz,
  en_route_at timestamptz,
  arrived_at timestamptz,
  responding_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists responder_assignments_incident_idx on public.responder_assignments (incident_id);
create index if not exists responder_assignments_responder_idx on public.responder_assignments (responder_id);

create table if not exists public.hospital_requests (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  hospital_id uuid not null references public.hospitals (id),
  sequence int not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'CONFIRMED', 'REJECTED')),
  requested_patients int not null check (requested_patients >= 0),
  offered_capacity int check (offered_capacity >= 0),
  distance_km double precision not null,
  notified_at timestamptz not null default now(),
  responded_at timestamptz,
  confirmed_at timestamptz,
  unique (incident_id, hospital_id)
);
create index if not exists hospital_requests_hospital_idx on public.hospital_requests (hospital_id);

create table if not exists public.hospital_allocations (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  hospital_id uuid not null references public.hospitals (id),
  request_id uuid not null unique references public.hospital_requests (id) on delete cascade,
  patients int not null check (patients >= 0),
  created_at timestamptz not null default now()
);
create index if not exists hospital_allocations_incident_idx on public.hospital_allocations (incident_id);

create table if not exists public.incident_events (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.incidents (id) on delete cascade,
  type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists incident_events_incident_idx on public.incident_events (incident_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Demo policy: anyone may READ operational tables (needed for Realtime);
-- nobody but the service role may WRITE. Tracking tokens are never readable.
-- ---------------------------------------------------------------------------

alter table public.responders enable row level security;
alter table public.hospitals enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_tracking enable row level security;
alter table public.incident_media enable row level security;
alter table public.responder_assignments enable row level security;
alter table public.hospital_requests enable row level security;
alter table public.hospital_allocations enable row level security;
alter table public.incident_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['responders', 'hospitals', 'incidents', 'incident_media', 'responder_assignments',
                           'hospital_requests', 'hospital_allocations', 'incident_events']
  loop
    execute format('drop policy if exists "demo read" on public.%I', t);
    execute format('create policy "demo read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['responders', 'hospitals', 'incidents', 'responder_assignments',
                           'hospital_requests', 'hospital_allocations', 'incident_events']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage bucket for citizen evidence (size + MIME enforced by Storage itself)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'incident-media', 'incident-media', true, 41943040,
  array['audio/wav', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
