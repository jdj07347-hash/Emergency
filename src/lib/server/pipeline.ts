import "server-only";
import { randomBytes } from "node:crypto";
import { CATEGORY_LABEL, STORAGE_BUCKET, type Category, type Severity } from "../constants";
import { analyzeEmergency } from "../ai/gemini";
import type { AiAnalysis } from "../ai/schema";
import { computePriority, patientsToAllocate } from "../priority";
import { requiredServices } from "../services";
import { must, supabaseAdmin } from "../supabase/server";
import type { Incident } from "../types";
import type { MediaKind } from "../uploads";
import { dispatchRequiredServices } from "./dispatch";
import { logEvent } from "./events";
import { ensureFleetNear } from "./fleet";
import { contactNextHospital } from "./hospitals";

export interface ValidatedReport {
  description: string | null;
  citizenVictims: number | null;
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  media: { kind: MediaKind; path: string; mimeType: string; size: number }[];
}

export interface CreatedIncident {
  code: string;
  token: string;
  aiStatus: Incident["ai_status"];
}

/**
 * REPORT → ANALYZE → PRIORITIZE → DISPATCH → COORDINATE.
 * The incident is persisted before AI runs, so an AI failure never loses it.
 */
export async function createIncidentFromReport(report: ValidatedReport): Promise<CreatedIncident> {
  const db = supabaseAdmin();

  const incident = must(
    await db
      .from("incidents")
      .insert({
        status: "ANALYZING",
        description: report.description,
        citizen_victims: report.citizenVictims,
        latitude: report.latitude,
        longitude: report.longitude,
        gps_accuracy: report.accuracy,
        gps_captured_at: report.capturedAt,
      })
      .select("*")
      .single(),
    "create incident",
  ) as Incident;

  const token = randomBytes(24).toString("base64url");
  must(await db.from("incident_tracking").insert({ incident_id: incident.id, token }).select("token").single(), "create tracking token");

  const mediaRows = report.media.map((m) => ({
    incident_id: incident.id,
    kind: m.kind,
    storage_path: m.path,
    public_url: db.storage.from(STORAGE_BUCKET).getPublicUrl(m.path).data.publicUrl,
    mime_type: m.mimeType,
    size_bytes: m.size,
  }));
  if (mediaRows.length) must(await db.from("incident_media").insert(mediaRows).select("id"), "store media");

  await logEvent(incident.id, "INCIDENT_CREATED", "Emergency reported");
  await logEvent(incident.id, "LOCATION_CAPTURED", `GPS location received (±${Math.round(report.accuracy)} m)`, {
    accuracy_m: report.accuracy,
  });
  if (mediaRows.length) {
    const kinds = report.media.map((m) => m.kind.toLowerCase()).join(", ");
    await logEvent(incident.id, "MEDIA_RECEIVED", `Evidence received: ${kinds}`, { count: mediaRows.length });
  }

  // Demo: place idle units 5–10 km around the reporter while the AI runs.
  const fleetReady = ensureFleetNear(incident).catch((err) => {
    console.error(`[pipeline] fleet positioning failed for ${incident.code}:`, (err as Error).message);
  });

  let analysis: AiAnalysis;
  let model: string;
  try {
    const [audio, image] = await Promise.all([
      downloadFirst(report.media, "AUDIO"),
      downloadFirst(report.media, "IMAGE"),
    ]);
    ({ analysis, model } = await analyzeEmergency({
      description: report.description,
      citizenVictims: report.citizenVictims,
      audio,
      image,
      gpsAccuracy: report.accuracy,
    }));
  } catch (err) {
    const message = (err as Error).message ?? "unknown error";
    console.error(`[pipeline] AI analysis failed for ${incident.code}:`, message);
    await db
      .from("incidents")
      .update({ ai_status: "FAILED", ai_error: message.slice(0, 500), status: "PENDING_REVIEW", updated_at: new Date().toISOString() })
      .eq("id", incident.id);
    await logEvent(incident.id, "AI_ANALYSIS_FAILED", "AI analysis unavailable — waiting for manual assessment");
    await fleetReady;
    return { code: incident.code, token, aiStatus: "FAILED" };
  }

  await fleetReady;
  await applyAssessment(incident.id, analysis, "AI", model);
  return { code: incident.code, token, aiStatus: "COMPLETED" };
}

async function downloadFirst(media: ValidatedReport["media"], kind: MediaKind) {
  const item = media.find((m) => m.kind === kind);
  if (!item) return null;
  const { data, error } = await supabaseAdmin().storage.from(STORAGE_BUCKET).download(item.path);
  if (error || !data) {
    console.warn(`[pipeline] could not download ${kind} for analysis:`, error?.message);
    return null;
  }
  return { mimeType: item.mimeType, data: Buffer.from(await data.arrayBuffer()) };
}

/**
 * Apply an interpretation (from Gemini or a human operator) and run the
 * deterministic decisions: priority, required services, dispatch, hospitals.
 */
export async function applyAssessment(incidentId: string, a: AiAnalysis, source: "AI" | "MANUAL", model?: string) {
  const db = supabaseAdmin();
  const current = must(await db.from("incidents").select("*").eq("id", incidentId).single(), "load incident") as Incident;

  const patients = patientsToAllocate(current.citizen_victims, a.estimated_victims_min, a.estimated_victims_max);
  const victimsForScoring = Math.max(patients, a.estimated_victims_max);
  const priority = computePriority({
    aiSeverity: a.severity,
    aiSeverityScore: a.severity_score,
    victims: victimsForScoring,
    lifeThreatening: a.life_threatening,
    medicalRequired: a.medical_required,
    trappedPossible: a.trapped_possible,
    fireRisk: a.fire_risk,
    secondaryHazards: a.secondary_hazards.length,
  });
  const services = requiredServices({
    category: a.category,
    severity: priority.severity,
    victims: patients,
    fireRequired: a.fire_required,
    policeRequired: a.police_required,
    medicalRequired: a.medical_required,
    trappedPossible: a.trapped_possible,
    fireRisk: a.fire_risk,
  });
  const hospitalRequired = (a.hospital_required || a.medical_required) && patients > 0;

  const updated = must(
    await db
      .from("incidents")
      .update({
        status: "DISPATCHING",
        ai_status: source === "AI" ? "COMPLETED" : "MANUAL",
        ai_error: null,
        transcript: a.transcript,
        ai_summary: a.summary,
        ai_severity: a.severity,
        ai_severity_score: a.severity_score,
        ai_confidence: a.confidence,
        ai_reasoning: a.reasoning,
        ai_victims_min: a.estimated_victims_min,
        ai_victims_max: a.estimated_victims_max,
        category: a.category,
        severity: priority.severity,
        priority_score: priority.score,
        priority_breakdown: priority.breakdown,
        trapped_possible: a.trapped_possible,
        fire_risk: a.fire_risk,
        life_threatening: a.life_threatening,
        required_services: services,
        hospital_required: hospitalRequired,
        patients_to_allocate: hospitalRequired ? patients : 0,
        hospital_status: hospitalRequired ? "COORDINATING" : "NOT_REQUIRED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", incidentId)
      .select("*")
      .single(),
    "update incident",
  ) as Incident;

  if (source === "AI") {
    await logEvent(
      incidentId,
      "AI_ANALYSIS_COMPLETED",
      `AI analysis completed: ${CATEGORY_LABEL[a.category]} (${Math.round(a.confidence * 100)}% confidence)`,
      { category: a.category, ai_severity: a.severity, ai_score: a.severity_score, model },
    );
  } else {
    await logEvent(incidentId, "MANUAL_ASSESSMENT", `Manual assessment by Control Center: ${CATEGORY_LABEL[a.category]}`);
  }
  await logEvent(incidentId, "PRIORITY_ASSIGNED", `Priority classified: ${priority.severity} (${priority.score}/100)`, {
    score: priority.score,
    breakdown: priority.breakdown,
  });

  // No-op when idle units already cover the area (they were placed at intake).
  await ensureFleetNear(updated, { onlyIfUncovered: true }).catch((err) => console.error("[pipeline] fleet positioning failed:", (err as Error).message));
  await dispatchRequiredServices(updated);
  if (hospitalRequired) await contactNextHospital(incidentId);
}

/** Build an assessment from Control Center input when AI is unavailable. */
export function manualAssessment(input: {
  category: Category;
  severity: Severity;
  victims: number;
  trapped: boolean;
  fireRisk: boolean;
  lifeThreatening: boolean;
}): AiAnalysis {
  const anchor: Record<Severity, number> = { LOW: 20, MEDIUM: 45, HIGH: 70, CRITICAL: 92 };
  return {
    category: input.category,
    severity: input.severity,
    severity_score: anchor[input.severity],
    estimated_victims_min: input.victims,
    estimated_victims_max: input.victims,
    trapped_possible: input.trapped,
    fire_risk: input.fireRisk,
    life_threatening: input.lifeThreatening,
    medical_required: input.category === "MEDICAL_EMERGENCY" || (input.victims > 0 && input.category !== "SECURITY_THREAT"),
    police_required: false,
    fire_required: input.category === "FIRE",
    hospital_required: input.victims > 0 && input.category !== "SECURITY_THREAT",
    secondary_hazards: [],
    confidence: 1,
    transcript: null,
    summary: "Manually assessed by Control Center operator.",
    reasoning: ["Assessed manually because AI analysis was unavailable."],
  };
}

