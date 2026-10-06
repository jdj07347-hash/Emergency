import "server-only";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  ASSIGNMENT_EVENT,
  ASSIGNMENT_TIMESTAMP_COLUMN,
  ASSIGNMENT_TRANSITIONS,
  RESPONDER_STATUS_FOR_ASSIGNMENT,
  RESPONDER_TYPE_LABEL,
  type AssignmentStatus,
  type ResponderType,
} from "../constants";
import { assignmentTravel, formatDistance, formatEta, haversineKm } from "../geo";
import { must, supabaseAdmin } from "../supabase/server";
import type { Incident, Responder, ResponderAssignment } from "../types";
import { logEvent } from "./events";
import { roadRoute, travelTimesTo } from "./routing";

type IncidentPoint = Pick<Incident, "id" | "latitude" | "longitude">;

/**
 * Select and claim the nearest AVAILABLE responder of a type.
 * Busy/assigned units are never chosen. Returns null when every unit is unavailable.
 */
export async function dispatchResponder(
  incident: IncidentPoint,
  type: ResponderType,
  excludeResponderIds: string[] = [],
): Promise<ResponderAssignment | null> {
  const db = supabaseAdmin();
  const responders = must(
    await db.from("responders").select("*").eq("type", type).eq("status", "AVAILABLE"),
    "load responders",
  ) as Responder[];

  // Shortlist by straight-line distance, then rank by actual drive time on the road network.
  const shortlist = responders
    .filter((r) => !excludeResponderIds.includes(r.id))
    .map((r) => ({ responder: r, distance: haversineKm(r, incident) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8);
  const times = await travelTimesTo(
    shortlist.map((c) => c.responder),
    incident,
  );
  const candidates = shortlist
    .map((c, i) => ({ ...c, travel: times[i] }))
    .sort((a, b) => a.travel.durationSec - b.travel.durationSec);

  for (const { responder, distance, travel } of candidates) {
    // Conditional claim: only succeeds if the unit is still AVAILABLE (guards concurrent incidents).
    const claimed = await db
      .from("responders")
      .update({ status: "ASSIGNED", updated_at: new Date().toISOString() })
      .eq("id", responder.id)
      .eq("status", "AVAILABLE")
      .select("id");
    if (claimed.error || !claimed.data?.length) continue;

    const route = await roadRoute(responder, incident);
    const best = route?.travel ?? (travel.source === "ROAD" ? travel : null);
    const assignment = must(
      await db
        .from("responder_assignments")
        .insert({
          incident_id: incident.id,
          responder_id: responder.id,
          responder_type: type,
          distance_km: Math.round(distance * 100) / 100,
          route_distance_km: best ? Math.round(best.distanceKm * 100) / 100 : null,
          eta_seconds: best?.durationSec ?? null,
          route_geometry: route?.path ?? null,
        })
        .select("*")
        .single(),
      "create assignment",
    ) as ResponderAssignment;

    const eta = assignmentTravel(assignment);
    await logEvent(
      incident.id,
      "RESPONDER_DISPATCHED",
      `${responder.name} dispatched from ${responder.station} — ${formatDistance(eta.distanceKm)} ${eta.source === "ROAD" ? "by road" : "(est.)"}, ETA ~${formatEta(eta.durationSec)}`,
      {
        responder_id: responder.id,
        responder_type: type,
        distance_km: assignment.distance_km,
        route_distance_km: assignment.route_distance_km,
        eta_seconds: assignment.eta_seconds,
      },
    );
    return assignment;
  }

  await logEvent(incident.id, "NO_UNITS_AVAILABLE", `${RESPONDER_TYPE_LABEL[type]}: all units currently unavailable`, {
    responder_type: type,
  });
  return null;
}

/** Dispatch every required service that does not already have an active unit. */
export async function dispatchRequiredServices(incident: Incident) {
  const db = supabaseAdmin();
  const existing = must(
    await db.from("responder_assignments").select("*").eq("incident_id", incident.id),
    "load assignments",
  ) as ResponderAssignment[];

  for (const type of incident.required_services) {
    const ofType = existing.filter((a) => a.responder_type === type);
    if (ofType.some((a) => a.status !== "REJECTED")) continue;
    await dispatchResponder(
      incident,
      type,
      ofType.map((a) => a.responder_id),
    );
  }
}

export class TransitionError extends Error {}

/** Move an assignment through the state machine on behalf of its responder. */
export async function transitionAssignment(assignmentId: string, responderId: string, next: AssignmentStatus) {
  const db = supabaseAdmin();
  const { data: assignment } = await db
    .from("responder_assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle<ResponderAssignment>();
  if (!assignment || assignment.responder_id !== responderId) {
    throw new TransitionError("Assignment not found for this unit.");
  }
  if (!ASSIGNMENT_TRANSITIONS[assignment.status].includes(next)) {
    throw new TransitionError(`Cannot move from ${assignment.status} to ${next}.`);
  }

  const now = new Date().toISOString();
  const updated = await db
    .from("responder_assignments")
    .update({ status: next, [ASSIGNMENT_TIMESTAMP_COLUMN[next]]: now, updated_at: now })
    .eq("id", assignmentId)
    .eq("status", assignment.status)
    .select("id");
  if (updated.error || !updated.data?.length) {
    throw new TransitionError("This assignment was updated elsewhere. Refresh and try again.");
  }

  await db
    .from("responders")
    .update({ status: RESPONDER_STATUS_FOR_ASSIGNMENT[next], updated_at: now })
    .eq("id", responderId);

  const responder = must(
    await db.from("responders").select("*").eq("id", responderId).single(),
    "load responder",
  ) as Responder;
  const incident = must(
    await db.from("incidents").select("*").eq("id", assignment.incident_id).single(),
    "load incident",
  ) as Incident;

  const verb: Record<string, string> = {
    ACCEPTED: "accepted the emergency",
    REJECTED: "declined the emergency",
    EN_ROUTE: "is en route",
    ARRIVED: "arrived on scene",
    RESPONDING: "started response operations",
    COMPLETED: "completed response",
  };
  await logEvent(incident.id, ASSIGNMENT_EVENT[next]!, `${responder.name} ${verb[next]}`, {
    responder_id: responderId,
    responder_type: responder.type,
    assignment_id: assignmentId,
  });

  if (next === "REJECTED") {
    // Automatically try the next nearest available unit of the same type.
    const tried = must(
      await db
        .from("responder_assignments")
        .select("responder_id")
        .eq("incident_id", incident.id)
        .eq("responder_type", assignment.responder_type),
      "load prior assignments",
    ) as { responder_id: string }[];
    await dispatchResponder(incident, assignment.responder_type, tried.map((t) => t.responder_id));
  }

  if (next === "ACCEPTED" && incident.status === "DISPATCHING") {
    await db.from("incidents").update({ status: "IN_PROGRESS", updated_at: now }).eq("id", incident.id);
  }

  if (next === "COMPLETED") await resolveIfComplete(incident.id);
}

/** An incident resolves once every dispatched (non-rejected) unit has completed. */
export async function resolveIfComplete(incidentId: string) {
  const db = supabaseAdmin();
  const assignments = must(
    await db.from("responder_assignments").select("status").eq("incident_id", incidentId),
    "load assignments",
  ) as { status: AssignmentStatus }[];
  const live = assignments.filter((a) => a.status !== "REJECTED");
  if (live.length === 0 || live.some((a) => a.status !== "COMPLETED")) return;
  await resolveIncident(incidentId, "All units completed response");
}

export async function resolveIncident(incidentId: string, reason: string) {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const res = await db
    .from("incidents")
    .update({ status: "RESOLVED", resolved_at: now, updated_at: now })
    .eq("id", incidentId)
    .neq("status", "RESOLVED")
    .select("id");
  if (!res.data?.length) return;

  // Release any units still attached (manual resolution from Control Center).
  const active = must(
    await db
      .from("responder_assignments")
      .select("id, responder_id")
      .eq("incident_id", incidentId)
      .in("status", ACTIVE_ASSIGNMENT_STATUSES),
    "load active assignments",
  ) as { id: string; responder_id: string }[];
  for (const a of active) {
    await db.from("responder_assignments").update({ status: "COMPLETED", completed_at: now, updated_at: now }).eq("id", a.id);
    await db.from("responders").update({ status: "AVAILABLE", updated_at: now }).eq("id", a.responder_id);
  }

  await logEvent(incidentId, "INCIDENT_RESOLVED", `Incident resolved — ${reason}`);
}
