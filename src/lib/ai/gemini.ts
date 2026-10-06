import "server-only";
import { aiAnalysisSchema, geminiResponseSchema, type AiAnalysis } from "./schema";

export interface AnalysisInput {
  description: string | null;
  citizenVictims: number | null;
  audio?: { mimeType: string; data: Buffer } | null;
  image?: { mimeType: string; data: Buffer } | null;
  gpsAccuracy: number | null;
}

const SYSTEM_PROMPT = `You are the triage interpreter for "Smart Rescue", a DEMO emergency response system.
You receive a citizen's emergency report (voice recording, optional text, optional photo, approximate victim count).
Interpret it and return ONLY the JSON object described by the schema.

Rules:
- category must be exactly one of: FIRE, ROAD_ACCIDENT, MEDICAL_EMERGENCY, FLOOD, BUILDING_COLLAPSE, NATURAL_DISASTER, SECURITY_THREAT, OTHER.
  Vehicle crashes/collisions of any kind are ROAD_ACCIDENT. A burning building is FIRE even if people are trapped.
  A single person collapsed/unconscious/not breathing is MEDICAL_EMERGENCY.
  Crime or danger from people (being followed/stalked, suspicious persons, theft, break-in, assault, harassment,
  violence, weapons, kidnapping, domestic violence) is SECURITY_THREAT.
- severity: LOW (no injuries, minor), MEDIUM (minor injuries, contained), HIGH (serious injuries or spreading hazard),
  CRITICAL (life-threatening, multiple casualties, trapped people, mass-casualty potential).
- severity_score 0-100 must be consistent with severity.
- Victim estimate: use all evidence. If the citizen gave a count, keep the range close to it unless the evidence clearly contradicts it.
- trapped_possible: true only if someone is physically trapped and needs rescue/extrication — pinned in a vehicle,
  under debris, stuck in a lift, cut off by water or fire, locked in a burning room. Hiding from or being cornered
  by a person is NOT trapped (that is a police matter).
- fire_risk: true only for actual fire, smoke, explosion, fuel leak, or gas leak. A crash alone is not a fire risk.
- life_threatening: true if anyone may die without urgent help.

Required services — choose ONLY what this specific situation needs. Do not request a service "just in case".
- fire_required (fire & rescue): fires, smoke, gas/fuel leaks, hazardous materials, trapped people needing
  extrication, water/flood rescue, collapsed structures.
- medical_required (ambulance): someone is injured, ill, unconscious, not breathing, bleeding, or in medical distress.
  False when nobody is hurt.
- police_required: crime, violence, threats, suspicious or following persons, weapons, theft, missing persons,
  traffic/crowd control at road accidents, scene security at large incidents.
- hospital_required: someone needs hospital treatment.
Examples:
- "Two cars collided, driver bleeding" → medical + police; fire only if fire/fuel leak or someone pinned inside.
- "Some men are following me" → police only; medical and fire false; estimated victims 0 unless someone is hurt.
- "People stuck in a collapsed house" → fire + medical + police.
- "My father collapsed and isn't breathing" → medical only.
- "Kitchen fire, everyone got out" → fire only.
- estimated_victims counts people injured or physically harmed, not people merely at risk.
- transcript: transcribe the voice recording verbatim in its original language (empty string if no audio).
- Do not invent facts. If the report is unclear, use OTHER with lower confidence.
- You do not dispatch anyone. You only interpret.`;

export class AiUnavailableError extends Error {}

/**
 * Models tried in order, falling through on overload (503), rate limits (429),
 * retirement (404) or timeout. Ordered by measured latency on a ~12 s voice
 * report and free-tier daily quota: 3.1 Flash Lite answered in ~5 s with a
 * 500 req/day quota; the larger Flash models were slower or often overloaded.
 * Override with GEMINI_MODEL="model-a,model-b".
 */
const DEFAULT_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash"];
const RETRYABLE_STATUS = new Set([404, 429, 500, 503, 504]);
const TOTAL_BUDGET_MS = 45_000;
const PER_CALL_TIMEOUT_MS = 15_000;

export function geminiModels(): string[] {
  const configured = process.env.GEMINI_MODEL?.split(",").map((m) => m.trim()).filter(Boolean);
  return configured?.length ? configured : DEFAULT_MODELS;
}

export async function analyzeEmergency(input: AnalysisInput): Promise<{ analysis: AiAnalysis; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiUnavailableError("GEMINI_API_KEY is not configured");

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const failures: string[] = [];
  for (const model of geminiModels()) {
    const remaining = deadline - Date.now();
    if (remaining < 3_000) break;
    const timeoutMs = Math.min(PER_CALL_TIMEOUT_MS, remaining);
    try {
      try {
        return { analysis: await callGemini(apiKey, model, input, true, timeoutMs), model };
      } catch (err) {
        // Some audio encodings can be rejected; retry this model with text + image only.
        if (input.audio && err instanceof GeminiHttpError && err.status === 400) {
          return { analysis: await callGemini(apiKey, model, input, false, timeoutMs), model };
        }
        throw err;
      }
    } catch (err) {
      failures.push(`${model}: ${(err as Error).message.slice(0, 160)}`);
      const retryable =
        (err instanceof GeminiHttpError && RETRYABLE_STATUS.has(err.status)) || err instanceof AiUnavailableError;
      if (!retryable) break;
      console.warn(`[gemini] ${model} failed, trying next model`, (err as Error).message.slice(0, 160));
    }
  }
  throw new AiUnavailableError(`All Gemini models failed — ${failures.join(" | ")}`);
}

class GeminiHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function callGemini(
  apiKey: string,
  model: string,
  input: AnalysisInput,
  includeAudio: boolean,
  timeoutMs: number,
): Promise<AiAnalysis> {
  const parts: Record<string, unknown>[] = [
    {
      text: [
        `Citizen text description: ${input.description?.trim() || "(none provided)"}`,
        `Citizen-reported approximate number of victims: ${input.citizenVictims ?? "(not provided)"}`,
        `GPS accuracy: ${input.gpsAccuracy != null ? `${Math.round(input.gpsAccuracy)} m` : "unknown"}`,
        includeAudio && input.audio ? "A voice recording from the citizen is attached." : "No voice recording is available.",
        input.image ? "A photo from the scene is attached." : "No photo is available.",
      ].join("\n"),
    },
  ];
  if (includeAudio && input.audio) {
    parts.push({ inline_data: { mime_type: input.audio.mimeType, data: input.audio.data.toString("base64") } });
  }
  if (input.image) {
    parts.push({ inline_data: { mime_type: input.image.mimeType, data: input.image.data.toString("base64") } });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: geminiResponseSchema,
          },
        }),
        signal: controller.signal,
      },
    );
  } catch (err) {
    throw new AiUnavailableError(`Gemini request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GeminiHttpError(res.status, `Gemini HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new AiUnavailableError("Gemini returned invalid JSON");
  }
  const result = aiAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    throw new AiUnavailableError(`Gemini response failed validation: ${result.error.issues[0]?.message ?? "unknown"}`);
  }
  return result.data;
}
