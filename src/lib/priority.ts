import type { Severity } from "./constants";
import type { PriorityBreakdown } from "./types";

/**
 * Deterministic priority engine. The AI interprets; this function decides.
 *
 *   AI severity               40%
 *   Victim count              20%
 *   Life-threatening signals  20%
 *   Trapped victims           10%
 *   Additional risk factors   10%
 */
export interface PriorityInput {
  aiSeverity: Severity;
  aiSeverityScore: number;
  victims: number;
  lifeThreatening: boolean;
  medicalRequired: boolean;
  trappedPossible: boolean;
  fireRisk: boolean;
  secondaryHazards: number;
}

export const WEIGHTS = {
  severity: 40,
  victims: 20,
  life_threat: 20,
  trapped: 10,
  additional_risk: 10,
} as const;

const SEVERITY_ANCHOR: Record<Severity, number> = {
  LOW: 20,
  MEDIUM: 45,
  HIGH: 70,
  CRITICAL: 92,
};

export function computePriority(input: PriorityInput): {
  score: number;
  severity: Severity;
  breakdown: PriorityBreakdown;
} {
  // Blend the AI's numeric score with its own label so an inconsistent
  // answer (e.g. "LOW" with score 95) cannot dominate the result.
  const rawScore = clamp(input.aiSeverityScore, 0, 100);
  const severityBasis = (rawScore + SEVERITY_ANCHOR[input.aiSeverity]) / 2;

  // Logarithmic victim scale: 1 → ~5, 5 → ~12, 20+ → 20.
  const victims = Math.max(0, input.victims);
  const victimFactor = Math.min(1, Math.log10(victims + 1) / Math.log10(21));

  const lifeFactor = input.lifeThreatening ? 1 : input.medicalRequired ? 0.5 : 0;
  const riskFactor = Math.min(1, (input.fireRisk ? 0.6 : 0) + (input.secondaryHazards > 0 ? 0.4 : 0));

  const breakdown: PriorityBreakdown = {
    severity: round1((severityBasis / 100) * WEIGHTS.severity),
    victims: round1(victimFactor * WEIGHTS.victims),
    life_threat: round1(lifeFactor * WEIGHTS.life_threat),
    trapped: input.trappedPossible ? WEIGHTS.trapped : 0,
    additional_risk: round1(riskFactor * WEIGHTS.additional_risk),
  };

  const score = clamp(
    Math.round(
      breakdown.severity + breakdown.victims + breakdown.life_threat + breakdown.trapped + breakdown.additional_risk,
    ),
    0,
    100,
  );

  // Safety floor: anything life-threatening is never ranked below HIGH, even with one victim.
  let severity = severityFromScore(score);
  if (input.lifeThreatening && (severity === "LOW" || severity === "MEDIUM")) severity = "HIGH";

  return { score, severity, breakdown };
}

export function severityFromScore(score: number): Severity {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 35) return "MEDIUM";
  return "LOW";
}

/**
 * Number of patients hospitals must absorb. The citizen's count is used when
 * given (they are on scene); otherwise the midpoint of the AI estimate.
 */
export function patientsToAllocate(citizenVictims: number | null, aiMin: number, aiMax: number): number {
  if (citizenVictims != null && citizenVictims > 0) return citizenVictims;
  return Math.max(0, Math.round((aiMin + aiMax) / 2));
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
