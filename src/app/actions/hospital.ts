"use server";

import { refresh } from "next/cache";
import { requireHospital } from "@/lib/server/demo-auth";
import {
  HospitalFlowError,
  respondToHospitalRequest,
  resumeUncoveredIncidents,
} from "@/lib/server/hospitals";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ActionResult } from "./responder";

async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof HospitalFlowError) return { error: err.message };
    console.error("[hospital action]", err);
    return { error: "Could not save. Please try again." };
  }
  refresh();
  return {};
}

/** Answer a request with how many patients this hospital will take (0 = none). */
export async function answerHospitalRequest(number: string, requestId: string, patients: number) {
  const hospital = await requireHospital(number);
  return run(() => respondToHospitalRequest(requestId, hospital.id, patients));
}

export async function updateHospitalStatus(number: string, capacity: number, available: boolean) {
  const hospital = await requireHospital(number);
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 1000) {
    return { error: "Capacity must be a whole number between 0 and 1000." };
  }
  return run(async () => {
    const { error } = await supabaseAdmin()
      .from("hospitals")
      .update({ emergency_capacity: capacity, is_available: available, updated_at: new Date().toISOString() })
      .eq("id", hospital.id);
    if (error) throw new Error(error.message);
    if (available && capacity > 0) await resumeUncoveredIncidents();
  });
}
