import "server-only";
import { formatDistance, haversineKm } from "../geo";
import { must, supabaseAdmin } from "../supabase/server";
import type { Hospital, HospitalAllocation, HospitalRequest, Incident } from "../types";
import { logEvent } from "./events";
import { bringWithinRing } from "./fleet";

export class HospitalFlowError extends Error {}

async function allocatedSoFar(incidentId: string): Promise<number> {
  const rows = must(
    await supabaseAdmin().from("hospital_allocations").select("patients").eq("incident_id", incidentId),
    "load allocations",
  ) as Pick<HospitalAllocation, "patients">[];
  return rows.reduce((sum, r) => sum + r.patients, 0);
}

/**
 * Contact the next hospital for an incident, one at a time.
 * Hospitals are chosen by distance among those that are available and report
 * capacity > 0 and have not been contacted yet for this incident.
 */
export async function contactNextHospital(incidentId: string) {
  const db = supabaseAdmin();
  const incident = must(await db.from("incidents").select("*").eq("id", incidentId).single(), "load incident") as Incident;
  if (!incident.hospital_required || incident.status === "RESOLVED") return;

  const allocated = await allocatedSoFar(incidentId);
  const remaining = incident.patients_to_allocate - allocated;
  const now = new Date().toISOString();

  if (remaining <= 0) {
    await db.from("incidents").update({ hospital_status: "COVERED", updated_at: now }).eq("id", incidentId);
    await logEvent(incidentId, "MEDICAL_CAPACITY_COVERED", `${incident.patients_to_allocate} / ${incident.patients_to_allocate} patients covered`, {
      patients: incident.patients_to_allocate,
    });
    return;
  }

  const requests = must(
    await db.from("hospital_requests").select("*").eq("incident_id", incidentId),
    "load hospital requests",
  ) as HospitalRequest[];
  // Only one open request at a time.
  if (requests.some((r) => r.status === "PENDING" || r.status === "ACCEPTED")) return;

  const contacted = new Set(requests.map((r) => r.hospital_id));
  const hospitals = must(await db.from("hospitals").select("*"), "load hospitals") as Hospital[];
  const nearest = hospitals
    .filter((h) => !contacted.has(h.id) && h.is_available && h.emergency_capacity > 0)
    .map((h) => ({ hospital: h, distance: haversineKm(h, incident) }))
    .sort((a, b) => a.distance - b.distance)[0];
  // Demo: the contacted hospital is always 10–20 km from the emergency.
  let next = nearest;
  if (nearest) {
    const hospital = await bringWithinRing("hospitals", nearest.hospital, incident);
    next = { hospital, distance: haversineKm(hospital, incident) };
  }

  if (!next) {
    await db.from("incidents").update({ hospital_status: "UNCOVERED", updated_at: now }).eq("id", incidentId);
    await logEvent(incidentId, "MEDICAL_CAPACITY_EXHAUSTED", `${remaining} patients without allocated capacity — all hospitals exhausted`, {
      remaining,
    });
    return;
  }

  const inserted = await db.from("hospital_requests").insert({
    incident_id: incidentId,
    hospital_id: next.hospital.id,
    sequence: requests.length + 1,
    requested_patients: remaining,
    distance_km: Math.round(next.distance * 100) / 100,
  });
  if (inserted.error) {
    // Unique (incident, hospital) — another request raced us; nothing to do.
    if (inserted.error.code === "23505") return;
    throw new Error(`create hospital request: ${inserted.error.message}`);
  }
  await db.from("incidents").update({ hospital_status: "COORDINATING", updated_at: now }).eq("id", incidentId);
  await logEvent(
    incidentId,
    "HOSPITAL_NOTIFIED",
    `${next.hospital.short_name} notified — ${remaining} patients need capacity (${formatDistance(next.distance)} away)`,
    { hospital_id: next.hospital.id, requested: remaining },
  );
}

/** When a hospital frees up capacity, resume coordination for incidents left short. */
export async function resumeUncoveredIncidents() {
  const { data } = await supabaseAdmin()
    .from("incidents")
    .select("id")
    .eq("hospital_status", "UNCOVERED")
    .neq("status", "RESOLVED")
    .order("priority_score", { ascending: false });
  for (const i of data ?? []) await contactNextHospital(i.id);
}

async function loadRequest(requestId: string, hospitalId: string) {
  const db = supabaseAdmin();
  const { data: request } = await db.from("hospital_requests").select("*").eq("id", requestId).maybeSingle<HospitalRequest>();
  if (!request || request.hospital_id !== hospitalId) throw new HospitalFlowError("Request not found for this hospital.");
  const hospital = must(await db.from("hospitals").select("*").eq("id", hospitalId).single(), "load hospital") as Hospital;
  return { request, hospital };
}

/**
 * A hospital's single-step answer: how many of the requested patients it will take.
 * 0 declines. A partial offer (e.g. 15 of 70) is allocated and the remainder is
 * immediately routed to the next nearest hospital.
 */
export async function respondToHospitalRequest(requestId: string, hospitalId: string, offered: number) {
  if (!Number.isInteger(offered) || offered < 0 || offered > 1000) {
    throw new HospitalFlowError("Patients must be a whole number between 0 and 1000.");
  }
  const db = supabaseAdmin();
  const { request, hospital } = await loadRequest(requestId, hospitalId);
  if (request.status !== "PENDING" && request.status !== "ACCEPTED") {
    throw new HospitalFlowError("This request has already been answered.");
  }
  const now = new Date().toISOString();

  if (offered === 0) {
    const res = await db
      .from("hospital_requests")
      .update({ status: "REJECTED", responded_at: now })
      .eq("id", requestId)
      .eq("status", request.status)
      .select("id");
    if (!res.data?.length) throw new HospitalFlowError("This request has already been answered.");
    await logEvent(request.incident_id, "HOSPITAL_REJECTED", `${hospital.short_name} has no capacity for this incident`, {
      hospital_id: hospitalId,
    });
    await contactNextHospital(request.incident_id);
    return;
  }

  const incident = must(
    await db.from("incidents").select("*").eq("id", request.incident_id).single(),
    "load incident",
  ) as Incident;
  const remainingBefore = Math.max(0, incident.patients_to_allocate - (await allocatedSoFar(incident.id)));
  const patients = Math.min(offered, remainingBefore);

  const res = await db
    .from("hospital_requests")
    .update({ status: "CONFIRMED", offered_capacity: offered, responded_at: request.responded_at ?? now, confirmed_at: now })
    .eq("id", requestId)
    .eq("status", request.status)
    .select("id");
  if (!res.data?.length) throw new HospitalFlowError("This request has already been answered.");

  must(
    await db
      .from("hospital_allocations")
      .insert({ incident_id: incident.id, hospital_id: hospitalId, request_id: requestId, patients })
      .select("id")
      .single(),
    "create allocation",
  );
  // Beds left at this hospital after taking these patients.
  await db
    .from("hospitals")
    .update({ emergency_capacity: Math.max(0, hospital.emergency_capacity - patients), updated_at: now })
    .eq("id", hospitalId);

  const remaining = remainingBefore - patients;
  const partial = patients < request.requested_patients;
  await logEvent(
    incident.id,
    "CAPACITY_CONFIRMED",
    partial
      ? `${hospital.short_name} accepted ${patients} of ${request.requested_patients} patients (partial capacity)`
      : `${hospital.short_name} accepted all ${patients} patients`,
    { hospital_id: hospitalId, offered, patients, partial },
  );
  await logEvent(
    incident.id,
    "VICTIMS_ALLOCATED",
    remaining > 0
      ? `${hospital.short_name} allocated ${patients} — routing remaining ${remaining} to the next hospital`
      : `${hospital.short_name} allocated ${patients} — all patients placed`,
    { hospital_id: hospitalId, patients, remaining },
  );

  await contactNextHospital(incident.id);
}
