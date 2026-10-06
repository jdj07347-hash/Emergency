-- Crime / personal-safety reports (stalking, suspicious persons, assault) get
-- their own category so they are dispatched police-only.
alter table public.incidents drop constraint if exists incidents_category_check;
alter table public.incidents add constraint incidents_category_check
  check (category in ('FIRE', 'ROAD_ACCIDENT', 'MEDICAL_EMERGENCY', 'FLOOD', 'BUILDING_COLLAPSE', 'NATURAL_DISASTER', 'SECURITY_THREAT', 'OTHER'));
