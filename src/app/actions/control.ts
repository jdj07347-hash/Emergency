"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { CATEGORIES, SEVERITIES } from "@/lib/constants";
import { requireControl } from "@/lib/server/demo-auth";
import { dispatchRequiredServices, resolveIncident } from "@/lib/server/dispatch";
import { positionFleet } from "@/lib/server/fleet";
import { applyAssessment, manualAssessment } from "@/lib/server/pipeline";
import { must, supabaseAdmin } from "@/lib/supabase/server";
import type { Hospital, Incident, Responder } from "@/lib/types";
import type { ActionResult } from "./responder";

const uuid = z.string().uuid();

async function run(fn: () => Promise<void>): Promise<ActionResult> {
  await requireControl();
  try {
    await fn();
  } catch (err) {
    console.error("[control action]", err);
    return { error: (err as Error).message || "Action failed." };
  }
  refresh();
  return {};
}

async function loadIncident(id: string) {
  if (!uuid.safeParse(id).success) throw new Error("Invalid incident.");
  return must(await supabaseAdmin().from("incidents").select("*").eq("id", id).single(), "load incident") as Incident;
}

const manualSchema = z.object({
  category: z.enum(CATEGORIES),
  severity: z.enum(SEVERITIES),
  victims: z.number().int().min(0).max(10000),
  trapped: z.boolean(),
  fireRisk: z.boolean(),
  lifeThreatening: z.boolean(),
});

export async function submitManualAssessment(incidentId: string, input: z.input<typeof manualSchema>) {
  return run(async () => {
    const incident = await loadIncident(incidentId);
    if (incident.status !== "PENDING_REVIEW") throw new Error("This incident is not waiting for manual assessment.");
    const parsed = manualSchema.parse(input);
    if (incident.citizen_victims == null && parsed.victims > 0) {
      await supabaseAdmin().from("incidents").update({ citizen_victims: parsed.victims }).eq("id", incidentId);
    }
    await applyAssessment(incidentId, manualAssessment(parsed), "MANUAL");
  });
}

export async function retryDispatch(incidentId: string) {
  return run(async () => {
    const incident = await loadIncident(incidentId);
    if (incident.status === "RESOLVED" || incident.status === "PENDING_REVIEW" || incident.status === "ANALYZING") {
      throw new Error("Dispatch is not possible in the current incident state.");
    }
    await dispatchRequiredServices(incident);
  });
}

export async function resolveIncidentManually(incidentId: string) {
  return run(async () => {
    await loadIncident(incidentId);
    await resolveIncident(incidentId, "closed by Control Center");
  });
}

/** Move every demo unit and hospital to points 10–20 km around a new center point. */
export async function recenterDemoUnits(latitude: number, longitude: number) {
  return run(async () => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) {
      throw new Error("Invalid coordinates.");
    }
    const db = supabaseAdmin();
    const responders = must(await db.from("responders").select("*"), "load responders") as Responder[];
    const hospitals = must(await db.from("hospitals").select("*"), "load hospitals") as Hospital[];
    await positionFleet({ latitude, longitude }, responders, hospitals);
  });
}

const DEMO_HOSPITAL_CAPACITY: Record<number, number> = { 1: 12, 2: 8, 3: 15 };

/** Return units/hospitals to their initial demo state; optionally clear all incidents. */
export async function resetDemo(clearIncidents: boolean) {
  return run(async () => {
    const db = supabaseAdmin();
    const now = new Date().toISOString();
    if (clearIncidents) {
      const { error } = await db.from("incidents").delete().not("id", "is", null);
      if (error) throw new Error(error.message);
    } else {
      const { data: open } = await db.from("incidents").select("id").neq("status", "RESOLVED");
      for (const i of open ?? []) await resolveIncident(i.id, "demo reset");
    }
    await db.from("responders").update({ status: "AVAILABLE", updated_at: now }).not("id", "is", null);
    await db.from("responders").update({ status: "BUSY" }).eq("type", "FIRE").eq("demo_number", 3);
    const hospitals = must(await db.from("hospitals").select("id, demo_number"), "load hospitals") as Hospital[];
    await Promise.all(
      hospitals.map((h) =>
        db
          .from("hospitals")
          .update({ emergency_capacity: DEMO_HOSPITAL_CAPACITY[h.demo_number] ?? 10, is_available: true, updated_at: now })
          .eq("id", h.id),
      ),
    );
  });
}
