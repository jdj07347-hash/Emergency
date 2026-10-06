import type {
  AssignmentStatus,
  Category,
  HospitalCoverageStatus,
  HospitalRequestStatus,
  IncidentStatus,
  ResponderStatus,
  ResponderType,
  Severity,
} from "./constants";

export interface Responder {
  id: string;
  type: ResponderType;
  demo_number: number;
  name: string;
  callsign: string;
  station: string;
  latitude: number;
  longitude: number;
  offset_north_km: number;
  offset_east_km: number;
  status: ResponderStatus;
  updated_at: string;
}

export interface Hospital {
  id: string;
  demo_number: number;
  name: string;
  short_name: string;
  latitude: number;
  longitude: number;
  offset_north_km: number;
  offset_east_km: number;
  is_available: boolean;
  emergency_capacity: number;
  updated_at: string;
}

export interface PriorityBreakdown {
  severity: number;
  victims: number;
  life_threat: number;
  trapped: number;
  additional_risk: number;
}

export interface Incident {
  id: string;
  number: number;
  code: string;
  status: IncidentStatus;
  description: string | null;
  transcript: string | null;
  ai_status: "PENDING" | "COMPLETED" | "FAILED" | "MANUAL";
  ai_error: string | null;
  ai_severity: Severity | null;
  ai_severity_score: number | null;
  ai_confidence: number | null;
  ai_summary: string | null;
  ai_reasoning: string[];
  ai_victims_min: number | null;
  ai_victims_max: number | null;
  category: Category | null;
  severity: Severity | null;
  priority_score: number | null;
  priority_breakdown: PriorityBreakdown | null;
  trapped_possible: boolean;
  fire_risk: boolean;
  life_threatening: boolean;
  required_services: ResponderType[];
  citizen_victims: number | null;
  hospital_required: boolean;
  patients_to_allocate: number;
  hospital_status: HospitalCoverageStatus;
  latitude: number;
  longitude: number;
  gps_accuracy: number | null;
  gps_captured_at: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface IncidentMedia {
  id: string;
  incident_id: string;
  kind: "AUDIO" | "IMAGE" | "VIDEO";
  storage_path: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface ResponderAssignment {
  id: string;
  incident_id: string;
  responder_id: string;
  responder_type: ResponderType;
  status: AssignmentStatus;
  /** Straight-line distance at dispatch time. */
  distance_km: number;
  /** Road distance / drive time / path from OSRM; null when routing was unavailable. */
  route_distance_km: number | null;
  eta_seconds: number | null;
  route_geometry: [number, number][] | null;
  dispatched_at: string;
  accepted_at: string | null;
  en_route_at: string | null;
  arrived_at: string | null;
  responding_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  updated_at: string;
}

export interface HospitalRequest {
  id: string;
  incident_id: string;
  hospital_id: string;
  sequence: number;
  status: HospitalRequestStatus;
  requested_patients: number;
  offered_capacity: number | null;
  distance_km: number;
  notified_at: string;
  responded_at: string | null;
  confirmed_at: string | null;
}

export interface HospitalAllocation {
  id: string;
  incident_id: string;
  hospital_id: string;
  request_id: string;
  patients: number;
  created_at: string;
}

export interface IncidentEvent {
  id: number;
  incident_id: string;
  type: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Everything the UI needs to render one incident. */
export interface IncidentBundle {
  incident: Incident;
  media: IncidentMedia[];
  assignments: (ResponderAssignment & { responder: Responder })[];
  hospitalRequests: (HospitalRequest & { hospital: Hospital })[];
  allocations: HospitalAllocation[];
  events: IncidentEvent[];
}

export interface GpsFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}
