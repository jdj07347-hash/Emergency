import "server-only";
import type { EventType } from "../constants";
import { supabaseAdmin } from "../supabase/server";

/** Append an entry to an incident's timeline. Failures are logged, never fatal. */
export async function logEvent(
  incidentId: string,
  type: EventType,
  message: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await supabaseAdmin()
    .from("incident_events")
    .insert({ incident_id: incidentId, type, message, metadata });
  if (error) console.error(`[events] failed to log ${type} for ${incidentId}:`, error.message);
}
