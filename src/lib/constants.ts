// Centralized domain definitions. Every status, category and label lives here.

export const CATEGORIES = [
  "FIRE",
  "ROAD_ACCIDENT",
  "MEDICAL_EMERGENCY",
  "FLOOD",
  "BUILDING_COLLAPSE",
  "NATURAL_DISASTER",
  "SECURITY_THREAT",
  "OTHER",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  FIRE: "Fire",
  ROAD_ACCIDENT: "Road Accident",
  MEDICAL_EMERGENCY: "Medical Emergency",
  FLOOD: "Flood",
  BUILDING_COLLAPSE: "Building Collapse",
  NATURAL_DISASTER: "Natural Disaster",
  SECURITY_THREAT: "Crime / Security Threat",
  OTHER: "Other Emergency",
};

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const RESPONDER_TYPES = ["FIRE", "POLICE", "AMBULANCE"] as const;
export type ResponderType = (typeof RESPONDER_TYPES)[number];

export const RESPONDER_TYPE_LABEL: Record<ResponderType, string> = {
  FIRE: "Fire",
  POLICE: "Police",
  AMBULANCE: "Ambulance",
};

export const RESPONDER_TYPE_ICON: Record<ResponderType, string> = {
  FIRE: "🚒",
  POLICE: "👮",
  AMBULANCE: "🚑",
};

export const RESPONDER_STATUSES = [
  "AVAILABLE",
  "ASSIGNED",
  "EN_ROUTE",
  "ARRIVED",
  "RESPONDING",
  "COMPLETED",
  "BUSY",
] as const;
export type ResponderStatus = (typeof RESPONDER_STATUSES)[number];

export const ASSIGNMENT_STATUSES = [
  "DISPATCHED",
  "ACCEPTED",
  "EN_ROUTE",
  "ARRIVED",
  "RESPONDING",
  "COMPLETED",
  "REJECTED",
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

/** Assignment state machine. Anything not listed here is an invalid transition. */
export const ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  DISPATCHED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["EN_ROUTE"],
  EN_ROUTE: ["ARRIVED"],
  ARRIVED: ["RESPONDING"],
  RESPONDING: ["COMPLETED"],
  COMPLETED: [],
  REJECTED: [],
};

export const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  "DISPATCHED",
  "ACCEPTED",
  "EN_ROUTE",
  "ARRIVED",
  "RESPONDING",
];

/** What the unit itself is doing while an assignment is in a given state. */
export const RESPONDER_STATUS_FOR_ASSIGNMENT: Record<AssignmentStatus, ResponderStatus> = {
  DISPATCHED: "ASSIGNED",
  ACCEPTED: "ASSIGNED",
  EN_ROUTE: "EN_ROUTE",
  ARRIVED: "ARRIVED",
  RESPONDING: "RESPONDING",
  COMPLETED: "AVAILABLE",
  REJECTED: "AVAILABLE",
};

/** Timestamp column written when an assignment enters a state. */
export const ASSIGNMENT_TIMESTAMP_COLUMN: Record<AssignmentStatus, string> = {
  DISPATCHED: "dispatched_at",
  ACCEPTED: "accepted_at",
  EN_ROUTE: "en_route_at",
  ARRIVED: "arrived_at",
  RESPONDING: "responding_at",
  COMPLETED: "completed_at",
  REJECTED: "rejected_at",
};

export const ASSIGNMENT_ACTION_LABEL: Partial<Record<AssignmentStatus, string>> = {
  ACCEPTED: "Accept emergency",
  EN_ROUTE: "Mark en route",
  ARRIVED: "Mark arrived",
  RESPONDING: "Start response",
  COMPLETED: "Mark completed",
  REJECTED: "Reject",
};

export const INCIDENT_STATUSES = [
  "ANALYZING",
  "PENDING_REVIEW",
  "DISPATCHING",
  "IN_PROGRESS",
  "RESOLVED",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const HOSPITAL_REQUEST_STATUSES = ["PENDING", "ACCEPTED", "CONFIRMED", "REJECTED"] as const;
export type HospitalRequestStatus = (typeof HOSPITAL_REQUEST_STATUSES)[number];

export const HOSPITAL_COVERAGE_STATUSES = ["NOT_REQUIRED", "COORDINATING", "COVERED", "UNCOVERED"] as const;
export type HospitalCoverageStatus = (typeof HOSPITAL_COVERAGE_STATUSES)[number];

export const EVENT_TYPES = [
  "INCIDENT_CREATED",
  "LOCATION_CAPTURED",
  "UNITS_POSITIONED",
  "MEDIA_RECEIVED",
  "AI_ANALYSIS_COMPLETED",
  "AI_ANALYSIS_FAILED",
  "MANUAL_ASSESSMENT",
  "PRIORITY_ASSIGNED",
  "RESPONDER_DISPATCHED",
  "NO_UNITS_AVAILABLE",
  "RESPONDER_ACCEPTED",
  "RESPONDER_REJECTED",
  "RESPONDER_EN_ROUTE",
  "RESPONDER_ARRIVED",
  "RESPONDER_RESPONDING",
  "RESPONDER_COMPLETED",
  "HOSPITAL_NOTIFIED",
  "HOSPITAL_ACCEPTED",
  "HOSPITAL_REJECTED",
  "CAPACITY_CONFIRMED",
  "VICTIMS_ALLOCATED",
  "MEDICAL_CAPACITY_COVERED",
  "MEDICAL_CAPACITY_EXHAUSTED",
  "INCIDENT_RESOLVED",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ASSIGNMENT_EVENT: Partial<Record<AssignmentStatus, EventType>> = {
  ACCEPTED: "RESPONDER_ACCEPTED",
  REJECTED: "RESPONDER_REJECTED",
  EN_ROUTE: "RESPONDER_EN_ROUTE",
  ARRIVED: "RESPONDER_ARRIVED",
  RESPONDING: "RESPONDER_RESPONDING",
  COMPLETED: "RESPONDER_COMPLETED",
};

export const STORAGE_BUCKET = "incident-media";
