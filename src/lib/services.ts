import { RESPONDER_TYPES, type Category, type ResponderType, type Severity } from "./constants";

export interface ServiceSignals {
  category: Category;
  severity: Severity;
  victims: number;
  fireRequired: boolean;
  policeRequired: boolean;
  medicalRequired: boolean;
  trappedPossible: boolean;
  fireRisk: boolean;
}

/**
 * Minimum response per category — only what that kind of emergency always needs.
 * Everything else is added by RULES from the specific signals of the report, so a
 * stalking report gets police only and a crash with injuries gets an ambulance
 * without a fire engine. Extend here — the UI never hard-codes combinations.
 */
const BASELINE: Record<Category, ResponderType[]> = {
  FIRE: ["FIRE"],
  ROAD_ACCIDENT: ["POLICE"],
  MEDICAL_EMERGENCY: ["AMBULANCE"],
  FLOOD: ["POLICE"],
  BUILDING_COLLAPSE: ["FIRE", "AMBULANCE", "POLICE"],
  NATURAL_DISASTER: ["FIRE", "POLICE", "AMBULANCE"],
  SECURITY_THREAT: ["POLICE"],
  OTHER: [],
};

/** Categories where a victim count means physical casualties, not just people at risk. */
const CASUALTY_CATEGORIES = new Set<Category>(["FIRE", "ROAD_ACCIDENT", "FLOOD", "BUILDING_COLLAPSE", "NATURAL_DISASTER"]);

/** Additional rules layered on top of the baseline. Each returns the services it adds. */
const RULES: ((s: ServiceSignals) => ResponderType[])[] = [
  (s) => (s.fireRequired || s.fireRisk ? ["FIRE"] : []),
  // Fire services double as technical rescue for trapped victims (vehicles, floods, debris).
  (s) => (s.trappedPossible ? ["FIRE"] : []),
  (s) => (s.policeRequired ? ["POLICE"] : []),
  (s) => (s.medicalRequired ? ["AMBULANCE"] : []),
  // Safety net: casualties at a physical incident always get an ambulance, even if the AI missed it.
  (s) => (s.victims > 0 && CASUALTY_CATEGORIES.has(s.category) ? ["AMBULANCE"] : []),
  // Large or serious fires need scene control.
  (s) => (s.category === "FIRE" && (s.severity === "HIGH" || s.severity === "CRITICAL" || s.victims >= 5) ? ["POLICE"] : []),
];

export function requiredServices(signals: ServiceSignals): ResponderType[] {
  const set = new Set<ResponderType>(BASELINE[signals.category]);
  for (const rule of RULES) rule(signals).forEach((t) => set.add(t));
  // Never dispatch nobody: an unclassified report still gets a police unit to assess the scene.
  if (set.size === 0) set.add("POLICE");
  return RESPONDER_TYPES.filter((t) => set.has(t));
}
