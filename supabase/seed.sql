-- Smart Rescue — demo units (fictional names and stations).
-- Positions are offsets (km) from a demo center. Change the center below, or use
-- "Re-center demo units" in the Control Center to move every unit around a new point.

do $$
declare
  center_lat constant double precision := 12.9716;  -- demo center latitude
  center_lng constant double precision := 77.5946;  -- demo center longitude
  km_per_deg_lat constant double precision := 110.574;
  km_per_deg_lng constant double precision := 111.320 * cos(radians(center_lat));
begin
  insert into public.responders (type, demo_number, name, callsign, station, offset_north_km, offset_east_km, status, latitude, longitude)
  select r.type, r.demo_number, r.name, r.callsign, r.station, r.n, r.e, r.status,
         center_lat + r.n / km_per_deg_lat, center_lng + r.e / km_per_deg_lng
  from (values
    ('FIRE',      1, 'Fire Responder 1',   'Engine 21',  'Northgate Fire Station',      1.6,  1.8, 'AVAILABLE'),
    ('FIRE',      2, 'Fire Responder 2',   'Engine 34',  'Lakeside Fire Station',      -3.9,  2.6, 'AVAILABLE'),
    ('FIRE',      3, 'Fire Responder 3',   'Ladder 7',   'Old Town Fire Station',       0.7, -0.8, 'BUSY'),
    ('POLICE',    1, 'Police Responder 1', 'Patrol 12',  'Central Police Post',        -1.2,  1.3, 'AVAILABLE'),
    ('POLICE',    2, 'Police Responder 2', 'Patrol 18',  'Riverside Police Post',       3.1, -2.2, 'AVAILABLE'),
    ('POLICE',    3, 'Police Responder 3', 'Patrol 25',  'Hillcrest Police Post',      -4.4, -3.0, 'AVAILABLE'),
    ('AMBULANCE', 1, 'Ambulance 1',        'Medic 3',    'Greenfield EMS Base',         2.2, -2.0, 'AVAILABLE'),
    ('AMBULANCE', 2, 'Ambulance 2',        'Medic 9',    'Harbor EMS Base',            -2.8, -3.6, 'AVAILABLE'),
    ('AMBULANCE', 3, 'Ambulance 3',        'Medic 14',   'Eastside EMS Base',           4.5,  4.1, 'AVAILABLE')
  ) as r(type, demo_number, name, callsign, station, n, e, status)
  on conflict (type, demo_number) do nothing;

  insert into public.hospitals (demo_number, name, short_name, offset_north_km, offset_east_km, emergency_capacity, latitude, longitude)
  select h.demo_number, h.name, h.short_name, h.n, h.e, h.capacity,
         center_lat + h.n / km_per_deg_lat, center_lng + h.e / km_per_deg_lng
  from (values
    (1, 'Hospital 1 · Riverside General (fictional)',  'Hospital 1', -2.1,  2.4, 12),
    (2, 'Hospital 2 · St. Aurora Medical (fictional)', 'Hospital 2',  3.6,  3.7, 8),
    (3, 'Hospital 3 · Meadowbrook Trauma (fictional)', 'Hospital 3', -5.6, -5.4, 15)
  ) as h(demo_number, name, short_name, n, e, capacity)
  on conflict (demo_number) do nothing;
end $$;
