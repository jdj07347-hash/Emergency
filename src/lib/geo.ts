const EARTH_RADIUS_KM = 6371.0088;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle (straight-line) distance between two coordinates using the
 * Haversine formula. This is NOT a driving distance.
 */
export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Shift a point by a number of kilometres north/east (small-distance approximation). */
export function offsetByKm(
  center: { latitude: number; longitude: number },
  northKm: number,
  eastKm: number,
) {
  const kmPerDegLat = 110.574;
  const kmPerDegLng = 111.32 * Math.cos(toRad(center.latitude));
  return {
    latitude: center.latitude + northKm / kmPerDegLat,
    longitude: center.longitude + eastKm / kmPerDegLng,
  };
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function googleMapsNavigationUrl(latitude: number, longitude: number): string {
  const destination = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

/** Typical ratio of road distance to straight-line distance in cities. */
const ROAD_FACTOR = 1.35;
/** Average urban emergency-vehicle speed used when road routing is unavailable. */
const FALLBACK_SPEED_KMH = 32;

export interface Travel {
  distanceKm: number;
  durationSec: number;
  /** ROAD = computed on the road network; ESTIMATE = straight-line based fallback. */
  source: "ROAD" | "ESTIMATE";
}

/** Rough drive estimate from a straight-line distance, used when routing is unavailable. */
export function estimateTravel(straightKm: number): Travel {
  const distanceKm = straightKm * ROAD_FACTOR;
  return { distanceKm, durationSec: Math.round((distanceKm / FALLBACK_SPEED_KMH) * 3600) + 60, source: "ESTIMATE" };
}

/** Travel for a dispatched unit: stored road route when available, otherwise an estimate. */
export function assignmentTravel(a: { distance_km: number; route_distance_km: number | null; eta_seconds: number | null }): Travel {
  if (a.route_distance_km != null && a.eta_seconds != null) {
    return { distanceKm: a.route_distance_km, durationSec: a.eta_seconds, source: "ROAD" };
  }
  return estimateTravel(a.distance_km);
}

export function formatEta(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
