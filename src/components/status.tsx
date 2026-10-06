import {
  CATEGORY_LABEL,
  RESPONDER_TYPE_ICON,
  RESPONDER_TYPE_LABEL,
  type AssignmentStatus,
  type Category,
  type IncidentStatus,
  type ResponderStatus,
  type ResponderType,
  type Severity,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

type Tone = "light" | "dark";

const SEVERITY_STYLE: Record<Severity, { light: string; dark: string; dot: string }> = {
  LOW: { light: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dark: "bg-emerald-500/10 text-emerald-300 ring-emerald-400/25", dot: "bg-emerald-500" },
  MEDIUM: { light: "bg-yellow-50 text-yellow-800 ring-yellow-600/25", dark: "bg-yellow-400/10 text-yellow-200 ring-yellow-300/25", dot: "bg-yellow-400" },
  HIGH: { light: "bg-orange-50 text-orange-700 ring-orange-600/25", dark: "bg-orange-500/10 text-orange-300 ring-orange-400/30", dot: "bg-orange-500" },
  CRITICAL: { light: "bg-red-50 text-red-700 ring-red-600/25", dark: "bg-red-500/15 text-red-300 ring-red-400/35", dot: "bg-red-500" },
};

export const SEVERITY_HEX: Record<Severity, string> = {
  LOW: "#10b981",
  MEDIUM: "#eab308",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

const chipBase = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ring-1 ring-inset whitespace-nowrap";

export function SeverityBadge({ severity, tone = "light", className, size = "md" }: { severity: Severity | null; tone?: Tone; className?: string; size?: "md" | "lg" }) {
  if (!severity) {
    return <span className={cn(chipBase, tone === "dark" ? "bg-ops-800 text-slate-400 ring-ops-600" : "bg-slate-100 text-slate-500 ring-slate-300", className)}>UNASSESSED</span>;
  }
  const s = SEVERITY_STYLE[severity];
  return (
    <span className={cn(chipBase, s[tone], size === "lg" && "px-3.5 py-1.5 text-sm", className)}>
      <span className={cn("size-2 rounded-full", s.dot, severity === "CRITICAL" && "animate-pulse")} />
      {severity}
    </span>
  );
}

export function SeverityDot({ severity, className }: { severity: Severity | null; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", severity ? SEVERITY_STYLE[severity].dot : "bg-slate-400", className)} />;
}

const INCIDENT_STATUS: Record<IncidentStatus, { label: string; light: string; dark: string }> = {
  ANALYZING: { label: "Analyzing", light: "bg-sky-50 text-sky-700 ring-sky-600/20", dark: "bg-sky-500/10 text-sky-300 ring-sky-400/25" },
  PENDING_REVIEW: { label: "Manual review", light: "bg-amber-50 text-amber-800 ring-amber-600/25", dark: "bg-amber-500/10 text-amber-300 ring-amber-400/30" },
  DISPATCHING: { label: "Dispatching", light: "bg-indigo-50 text-indigo-700 ring-indigo-600/20", dark: "bg-indigo-500/10 text-indigo-300 ring-indigo-400/25" },
  IN_PROGRESS: { label: "In progress", light: "bg-blue-50 text-blue-700 ring-blue-600/20", dark: "bg-blue-500/10 text-blue-300 ring-blue-400/25" },
  RESOLVED: { label: "Resolved", light: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dark: "bg-emerald-500/10 text-emerald-300 ring-emerald-400/25" },
};

export function IncidentStatusChip({ status, tone = "light" }: { status: IncidentStatus; tone?: Tone }) {
  const s = INCIDENT_STATUS[status];
  return <span className={cn(chipBase, s[tone])}>{s.label}</span>;
}

const ASSIGNMENT_STYLE: Record<AssignmentStatus | ResponderStatus, { label: string; light: string; dark: string }> = {
  DISPATCHED: { label: "Dispatched", light: "bg-indigo-50 text-indigo-700 ring-indigo-600/20", dark: "bg-indigo-500/10 text-indigo-300 ring-indigo-400/25" },
  ASSIGNED: { label: "Assigned", light: "bg-indigo-50 text-indigo-700 ring-indigo-600/20", dark: "bg-indigo-500/10 text-indigo-300 ring-indigo-400/25" },
  ACCEPTED: { label: "Accepted", light: "bg-sky-50 text-sky-700 ring-sky-600/20", dark: "bg-sky-500/10 text-sky-300 ring-sky-400/25" },
  EN_ROUTE: { label: "En route", light: "bg-blue-50 text-blue-700 ring-blue-600/20", dark: "bg-blue-500/10 text-blue-300 ring-blue-400/25" },
  ARRIVED: { label: "Arrived", light: "bg-violet-50 text-violet-700 ring-violet-600/20", dark: "bg-violet-500/10 text-violet-300 ring-violet-400/25" },
  RESPONDING: { label: "Responding", light: "bg-amber-50 text-amber-800 ring-amber-600/25", dark: "bg-amber-500/10 text-amber-300 ring-amber-400/30" },
  COMPLETED: { label: "Completed", light: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dark: "bg-emerald-500/10 text-emerald-300 ring-emerald-400/25" },
  REJECTED: { label: "Declined", light: "bg-slate-100 text-slate-500 ring-slate-300", dark: "bg-ops-800 text-slate-400 ring-ops-600" },
  AVAILABLE: { label: "Available", light: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dark: "bg-emerald-500/10 text-emerald-300 ring-emerald-400/25" },
  BUSY: { label: "Busy", light: "bg-slate-100 text-slate-600 ring-slate-300", dark: "bg-ops-800 text-slate-400 ring-ops-600" },
};

export function UnitStatusChip({ status, tone = "light" }: { status: AssignmentStatus | ResponderStatus; tone?: Tone }) {
  const s = ASSIGNMENT_STYLE[status];
  return <span className={cn(chipBase, s[tone])}>{s.label}</span>;
}

const CATEGORY_ICON: Record<Category, string> = {
  FIRE: "🔥",
  ROAD_ACCIDENT: "🚗",
  MEDICAL_EMERGENCY: "🩺",
  FLOOD: "🌊",
  BUILDING_COLLAPSE: "🏚️",
  NATURAL_DISASTER: "🌪️",
  SECURITY_THREAT: "🚨",
  OTHER: "⚠️",
};

export function categoryText(category: Category | null) {
  return category ? CATEGORY_LABEL[category] : "Awaiting assessment";
}

export function CategoryIcon({ category, className }: { category: Category | null; className?: string }) {
  return <span className={className} aria-hidden>{category ? CATEGORY_ICON[category] : "📡"}</span>;
}

export function ServiceTag({ type, tone = "light" }: { type: ResponderType; tone?: Tone }) {
  return (
    <span className={cn(chipBase, tone === "dark" ? "bg-ops-800 text-slate-200 ring-ops-600" : "bg-slate-50 text-slate-700 ring-slate-200")}>
      <span aria-hidden>{RESPONDER_TYPE_ICON[type]}</span>
      {RESPONDER_TYPE_LABEL[type]}
    </span>
  );
}
