import "server-only";
import { ACTIVE_ASSIGNMENT_STATUSES, RESPONDER_TYPES } from "../constants";
import { haversineKm, offsetByKm } from "../geo";
import { must, supabaseAdmin } from "../supabase/server";
import type { Hospital, Responder } from "../types";
import { logEvent } from "./events";
import { snapToRoad } from "./routing";

/*
 * DEMO MODE fleet positioning.
 * The demo has a small fictional fleet. Every new emergency pulls the idle
 * units and hospitals to random points 5–10 km around the reporter's exact
 * location, so dispatch, routes and ETAs are meaningful wherever the demo is used.
 */

export const MIN_RING_KM = 5;
export const MAX_RING_KM = 10;
const GOLDEN_ANGLE = 137.508;

type Point = { latitude: number; longitude: number };

/** A point `km` away from `center` in direction `bearingDeg` (0 = north, clockwise). */
function pointAt(center: Point, km: number, bearingDeg: number): Point {
  const rad = (bearingDeg * Math.PI) / 180;
  return offsetByKm(center, km * Math.cos(rad), km * Math.sin(rad));
}

/**
 * A spot 5–10 km from `center`, on a road where possible (so it never lands in
 * the sea or a field). Tries a few directions before giving up on road snapping.
 */
async function ringPosition(center: Point, bearingDeg: number): Promise<Point> {
  let first: Point | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const km = MIN_RING_KM + Math.random() * (MAX_RING_KM - MIN_RING_KM);
    const p = pointAt(center, km, bearingDeg + attempt * 90);
    first ??= p;
    const snapped = await snapToRoad(p);
    if (!snapped) return p; // routing unavailable — use the raw point
    const d = haversineKm(snapped, center);
    if (snapped.movedM < 500 && d >= MIN_RING_KM && d <= MAX_RING_KM) {
      return { latitude: snapped.latitude, longitude: snapped.longitude };
    }
  }
  return first!;
}

/** Spread the given units and hospitals in all directions, 5–10 km around `center`. */
export async function positionFleet(center: Point, responders: Responder[], hospitals: Hospital[]) {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const start = Math.random() * 360;

  // Interleave types so each service is spread around the incident, not bunched on one side.
  const units = RESPONDER_TYPES.flatMap((t) => responders.filter((r) => r.type === t).sort((a, b) => a.demo_number - b.demo_number));
  const ordered: ({ table: "responders" } & Responder | { table: "hospitals" } & Hospital)[] = [
    ...units.map((r) => ({ ...r, table: "responders" as const })),
    ...hospitals.map((h) => ({ ...h, table: "hospitals" as const })),
  ];

  const positions = await Promise.all(ordered.map((_, i) => ringPosition(center, start + i * GOLDEN_ANGLE)));
  await Promise.all(
    ordered.map((row, i) =>
      db
        .from(row.table)
        .update({ latitude: positions[i].latitude, longitude: positions[i].longitude, updated_at: now })
        .eq("id", row.id),
    ),
  );
  return { moved: ordered.length };
}

/**
 * Position idle demo units 5–10 km around an incident. With `onlyIfUncovered`,
 * nothing moves when every service already has an available unit within 10 km.
 * Units and hospitals busy with another open incident are never moved.
 */
export async function ensureFleetNear(incident: Point & { id: string }, { onlyIfUncovered = false } = {}): Promise<boolean> {
  const db = supabaseAdmin();
  const [responders, hospitals, active, openRequests] = await Promise.all([
    db.from("responders").select("*"),
    db.from("hospitals").select("*"),
    db.from("responder_assignments").select("responder_id").in("status", ACTIVE_ASSIGNMENT_STATUSES),
    db.from("hospital_requests").select("hospital_id").in("status", ["PENDING", "ACCEPTED"]),
  ]);
  const engagedUnits = new Set((must(active, "load assignments") as { responder_id: string }[]).map((a) => a.responder_id));
  const engagedHospitals = new Set((must(openRequests, "load hospital requests") as { hospital_id: string }[]).map((r) => r.hospital_id));
  const idleUnits = (must(responders, "load responders") as Responder[]).filter((r) => !engagedUnits.has(r.id));
  const idleHospitals = (must(hospitals, "load hospitals") as Hospital[]).filter((h) => !engagedHospitals.has(h.id));
  if (idleUnits.length === 0 && idleHospitals.length === 0) return false;

  if (onlyIfUncovered) {
    const near = (p: Point) => haversineKm(p, incident) <= MAX_RING_KM + 0.5;
    const covered =
      RESPONDER_TYPES.every((t) => idleUnits.some((r) => r.type === t && r.status === "AVAILABLE" && near(r))) &&
      idleHospitals.some((h) => h.is_available && near(h));
    if (covered) return false;
  }

  await positionFleet(incident, idleUnits, idleHospitals);
  await logEvent(
    incident.id,
    "UNITS_POSITIONED",
    `Nearby fire, police, ambulance and hospital units located ${MIN_RING_KM}–${MAX_RING_KM} km from the emergency`,
    { units: idleUnits.length, hospitals: idleHospitals.length },
  );
  return true;
}
