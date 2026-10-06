import "server-only";
import { estimateTravel, haversineKm, type Travel } from "../geo";

/*
 * Road routing via OSRM (OpenStreetMap). The public demo server is used by
 * default; set OSRM_URL to point at your own instance. Every call has a short
 * timeout and callers always get a straight-line estimate as a fallback.
 */

const OSRM_URL = (process.env.OSRM_URL ?? "https://router.project-osrm.org").replace(/\/$/, "");
const TIMEOUT_MS = 5000;

type Point = { latitude: number; longitude: number };

const coord = (p: Point) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`;

async function osrm<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${OSRM_URL}${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
      headers: { "User-Agent": "SmartRescueDemo/1.0" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as T & { code?: string };
    return json.code === "Ok" ? json : null;
  } catch (err) {
    console.warn("[routing] OSRM request failed:", (err as Error).message);
    return null;
  }
}

/** Driving distance/time from each origin to one destination (one request). */
export async function travelTimesTo(origins: Point[], destination: Point): Promise<Travel[]> {
  const fallback = origins.map((o) => estimateTravel(haversineKm(o, destination)));
  if (origins.length === 0) return fallback;
  const coords = [...origins, destination].map(coord).join(";");
  const sources = origins.map((_, i) => i).join(";");
  const json = await osrm<{ durations: (number | null)[][]; distances: (number | null)[][] }>(
    `/table/v1/driving/${coords}?sources=${sources}&destinations=${origins.length}&annotations=duration,distance`,
  );
  if (!json) return fallback;
  return origins.map((_, i) => {
    const duration = json.durations?.[i]?.[0];
    const distance = json.distances?.[i]?.[0];
    if (duration == null || distance == null) return fallback[i];
    return { distanceKm: distance / 1000, durationSec: Math.round(duration), source: "ROAD" };
  });
}

/** Full road route (for drawing on the map). Null when routing is unavailable. */
export async function roadRoute(from: Point, to: Point): Promise<{ travel: Travel; path: [number, number][] } | null> {
  const json = await osrm<{ routes: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] }>(
    `/route/v1/driving/${coord(from)};${coord(to)}?overview=simplified&geometries=geojson`,
  );
  const route = json?.routes?.[0];
  if (!route) return null;
  return {
    travel: { distanceKm: route.distance / 1000, durationSec: Math.round(route.duration), source: "ROAD" },
    path: route.geometry.coordinates.map(([lng, lat]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5]),
  };
}

/** Snap a point onto the nearest drivable road. Returns how far it moved (m). */
export async function snapToRoad(p: Point): Promise<(Point & { movedM: number }) | null> {
  const json = await osrm<{ waypoints: { location: [number, number]; distance: number }[] }>(
    `/nearest/v1/driving/${coord(p)}?number=1`,
  );
  const w = json?.waypoints?.[0];
  if (!w) return null;
  return { latitude: w.location[1], longitude: w.location[0], movedM: w.distance };
}
