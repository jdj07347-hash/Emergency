-- Road routing for dispatched units (OSRM). All nullable: if routing is
-- unavailable the app falls back to a straight-line estimate.
alter table public.responder_assignments
  add column if not exists route_distance_km double precision,
  add column if not exists eta_seconds integer,
  -- [[lat, lng], ...] road path from the unit to the incident
  add column if not exists route_geometry jsonb;
