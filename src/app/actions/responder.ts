"use server";

import { refresh } from "next/cache";
import { ASSIGNMENT_STATUSES, type AssignmentStatus } from "@/lib/constants";
import { requireResponder } from "@/lib/server/demo-auth";
import { TransitionError, transitionAssignment } from "@/lib/server/dispatch";
import { supabaseAdmin } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
}

export async function updateAssignmentStatus(
  typeSlug: string,
  number: string,
  assignmentId: string,
  next: AssignmentStatus,
): Promise<ActionResult> {
  const responder = await requireResponder(typeSlug, number);
  if (!ASSIGNMENT_STATUSES.includes(next)) return { error: "Unknown status." };
  try {
    await transitionAssignment(assignmentId, responder.id, next);
  } catch (err) {
    if (err instanceof TransitionError) return { error: err.message };
    console.error("[responder action]", err);
    return { error: "Could not update status. Please try again." };
  }
  refresh();
  return {};
}

/** Off-duty toggle. Only allowed when the unit has no active assignment. */
export async function setResponderAvailability(typeSlug: string, number: string, available: boolean): Promise<ActionResult> {
  const responder = await requireResponder(typeSlug, number);
  const from = available ? "BUSY" : "AVAILABLE";
  const { data, error } = await supabaseAdmin()
    .from("responders")
    .update({ status: available ? "AVAILABLE" : "BUSY", updated_at: new Date().toISOString() })
    .eq("id", responder.id)
    .eq("status", from)
    .select("id");
  if (error || !data?.length) return { error: "Status can only be changed while not on an assignment." };
  refresh();
  return {};
}
