import "server-only";
import { must, supabaseAdmin } from "../supabase/server";
import type {
  Hospital,
  HospitalAllocation,
  HospitalRequest,
  Incident,
  IncidentBundle,
  IncidentEvent,
  IncidentMedia,
  Responder,
  ResponderAssignment,
} from "../types";

export async function listResponders(): Promise<Responder[]> {
  return must(
    await supabaseAdmin().from("responders").select("*").order("type").order("demo_number"),
    "load responders",
  ) as Responder[];
}

export async function listHospitals(): Promise<Hospital[]> {
  return must(await supabaseAdmin().from("hospitals").select("*").order("demo_number"), "load hospitals") as Hospital[];
}

/** Load incidents plus all related rows in a fixed number of queries. */
export async function loadBundles(incidents: Incident[]): Promise<IncidentBundle[]> {
  if (incidents.length === 0) return [];
  const db = supabaseAdmin();
  const ids = incidents.map((i) => i.id);
  const [media, assignments, requests, allocations, events, responders, hospitals] = await Promise.all([
    db.from("incident_media").select("*").in("incident_id", ids).order("created_at"),
    db.from("responder_assignments").select("*").in("incident_id", ids).order("dispatched_at"),
    db.from("hospital_requests").select("*").in("incident_id", ids).order("sequence"),
    db.from("hospital_allocations").select("*").in("incident_id", ids).order("created_at"),
    db.from("incident_events").select("*").in("incident_id", ids).order("created_at").order("id"),
    listResponders(),
    listHospitals(),
  ]);
  const responderById = new Map(responders.map((r) => [r.id, r]));
  const hospitalById = new Map(hospitals.map((h) => [h.id, h]));
  const by = <T extends { incident_id: string }>(rows: T[] | null, id: string) =>
    (rows ?? []).filter((r) => r.incident_id === id);

  return incidents.map((incident) => ({
    incident,
    media: by(must(media, "load media") as IncidentMedia[], incident.id),
    assignments: by(must(assignments, "load assignments") as ResponderAssignment[], incident.id).map((a) => ({
      ...a,
      responder: responderById.get(a.responder_id)!,
    })),
    hospitalRequests: by(must(requests, "load hospital requests") as HospitalRequest[], incident.id).map((r) => ({
      ...r,
      hospital: hospitalById.get(r.hospital_id)!,
    })),
    allocations: by(must(allocations, "load allocations") as HospitalAllocation[], incident.id),
    events: by(must(events, "load events") as IncidentEvent[], incident.id),
  }));
}

export async function getIncidentBundle(incidentId: string): Promise<IncidentBundle | null> {
  const { data } = await supabaseAdmin().from("incidents").select("*").eq("id", incidentId).maybeSingle<Incident>();
  if (!data) return null;
  return (await loadBundles([data]))[0];
}

export async function getRecentBundles(limit = 40): Promise<IncidentBundle[]> {
  const incidents = must(
    await supabaseAdmin().from("incidents").select("*").order("created_at", { ascending: false }).limit(limit),
    "load incidents",
  ) as Incident[];
  return loadBundles(incidents);
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

/** Resolve a citizen tracking token. Invalid or expired tokens return null. */
export async function getBundleByTrackingToken(token: string): Promise<IncidentBundle | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const { data } = await supabaseAdmin()
    .from("incident_tracking")
    .select("incident_id, expires_at")
    .eq("token", token)
    .maybeSingle<{ incident_id: string; expires_at: string }>();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;
  return getIncidentBundle(data.incident_id);
}

export async function getResponderView(responderId: string) {
  const db = supabaseAdmin();
  const assignments = must(
    await db
      .from("responder_assignments")
      .select("incident_id, dispatched_at")
      .eq("responder_id", responderId)
      .order("dispatched_at", { ascending: false })
      .limit(10),
    "load responder assignments",
  ) as { incident_id: string }[];
  const ids = [...new Set(assignments.map((a) => a.incident_id))];
  if (ids.length === 0) return [];
  const incidents = must(await db.from("incidents").select("*").in("id", ids), "load incidents") as Incident[];
  const order = new Map(ids.map((id, i) => [id, i]));
  incidents.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return loadBundles(incidents);
}

export async function getHospitalView(hospitalId: string) {
  const db = supabaseAdmin();
  const requests = must(
    await db
      .from("hospital_requests")
      .select("incident_id, notified_at")
      .eq("hospital_id", hospitalId)
      .order("notified_at", { ascending: false })
      .limit(15),
    "load hospital requests",
  ) as { incident_id: string }[];
  const ids = [...new Set(requests.map((r) => r.incident_id))];
  if (ids.length === 0) return [];
  const incidents = must(await db.from("incidents").select("*").in("id", ids), "load incidents") as Incident[];
  const order = new Map(ids.map((id, i) => [id, i]));
  incidents.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return loadBundles(incidents);
}
