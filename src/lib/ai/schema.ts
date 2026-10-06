import { z } from "zod";
import { CATEGORIES, SEVERITIES } from "../constants";

const boolish = z.preprocess((v) => (typeof v === "string" ? v.toLowerCase() === "true" : v), z.boolean());
const intish = z.coerce.number().finite().transform((n) => Math.round(n));

/** Server-side validation of Gemini output. Anything not matching is rejected. */
export const aiAnalysisSchema = z
  .object({
    category: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toUpperCase().replace(/[\s-]+/g, "_") : v),
      z.enum(CATEGORIES).catch("OTHER"),
    ),
    severity: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() : v), z.enum(SEVERITIES)),
    severity_score: intish.pipe(z.number().min(0).max(100)),
    estimated_victims_min: intish.pipe(z.number().min(0).max(10000)),
    estimated_victims_max: intish.pipe(z.number().min(0).max(10000)),
    trapped_possible: boolish,
    fire_risk: boolish,
    life_threatening: boolish.default(false),
    medical_required: boolish,
    police_required: boolish,
    fire_required: boolish,
    hospital_required: boolish,
    secondary_hazards: z.array(z.string().max(120)).max(10).default([]),
    confidence: z.coerce.number().min(0).max(1),
    transcript: z.string().max(5000).nullish().transform((s) => s?.trim() || null),
    summary: z.string().max(400).nullish().transform((s) => s?.trim() || null),
    reasoning: z.array(z.string().max(300)).max(8).default([]),
  })
  .transform((a) => ({
    ...a,
    // Repair a swapped range rather than discarding the whole analysis.
    estimated_victims_min: Math.min(a.estimated_victims_min, a.estimated_victims_max),
    estimated_victims_max: Math.max(a.estimated_victims_min, a.estimated_victims_max),
  }));

export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;

/** JSON schema handed to Gemini's structured-output mode (OpenAPI subset). */
export const geminiResponseSchema = {
  type: "OBJECT",
  properties: {
    transcript: { type: "STRING", description: "Verbatim transcript of the voice recording, or empty string if none." },
    summary: { type: "STRING", description: "One-sentence operational summary for responders." },
    category: { type: "STRING", enum: [...CATEGORIES] },
    severity: { type: "STRING", enum: [...SEVERITIES] },
    severity_score: { type: "INTEGER", description: "0-100" },
    estimated_victims_min: { type: "INTEGER" },
    estimated_victims_max: { type: "INTEGER" },
    trapped_possible: { type: "BOOLEAN" },
    fire_risk: { type: "BOOLEAN" },
    life_threatening: { type: "BOOLEAN" },
    medical_required: { type: "BOOLEAN" },
    police_required: { type: "BOOLEAN" },
    fire_required: { type: "BOOLEAN" },
    hospital_required: { type: "BOOLEAN" },
    secondary_hazards: { type: "ARRAY", items: { type: "STRING" } },
    confidence: { type: "NUMBER", description: "0-1" },
    reasoning: { type: "ARRAY", items: { type: "STRING" }, description: "2-5 short factual bullet points." },
  },
  required: [
    "transcript",
    "summary",
    "category",
    "severity",
    "severity_score",
    "estimated_victims_min",
    "estimated_victims_max",
    "trapped_possible",
    "fire_risk",
    "life_threatening",
    "medical_required",
    "police_required",
    "fire_required",
    "hospital_required",
    "secondary_hazards",
    "confidence",
    "reasoning",
  ],
} as const;
