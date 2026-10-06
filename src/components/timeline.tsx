import type { IncidentEvent } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

const EVENT_COLOR: Record<string, string> = {
  INCIDENT_CREATED: "bg-red-500",
  UNITS_POSITIONED: "bg-indigo-500",
  AI_ANALYSIS_FAILED: "bg-amber-500",
  NO_UNITS_AVAILABLE: "bg-amber-500",
  MEDICAL_CAPACITY_EXHAUSTED: "bg-amber-500",
  RESPONDER_REJECTED: "bg-slate-400",
  HOSPITAL_REJECTED: "bg-slate-400",
  MEDICAL_CAPACITY_COVERED: "bg-emerald-500",
  RESPONDER_COMPLETED: "bg-emerald-500",
  INCIDENT_RESOLVED: "bg-emerald-500",
  VICTIMS_ALLOCATED: "bg-purple-500",
  CAPACITY_CONFIRMED: "bg-purple-500",
  HOSPITAL_ACCEPTED: "bg-purple-500",
  HOSPITAL_NOTIFIED: "bg-purple-400",
};

export function Timeline({
  events,
  tone = "light",
  newestFirst = false,
  className,
}: {
  events: IncidentEvent[];
  tone?: "light" | "dark";
  newestFirst?: boolean;
  className?: string;
}) {
  const list = newestFirst ? [...events].reverse() : events;
  if (list.length === 0) {
    return <p className={cn("py-6 text-center text-sm", tone === "dark" ? "text-slate-500" : "text-slate-400")}>No activity yet.</p>;
  }
  return (
    <ol className={cn("relative space-y-3", className)}>
      {list.map((e) => (
        <li key={e.id} className="relative flex gap-3 animate-fade-up">
          <span className={cn("w-16 shrink-0 pt-0.5 font-mono text-xs tabular-nums", tone === "dark" ? "text-slate-500" : "text-slate-400")}>
            {formatTime(e.created_at)}
          </span>
          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", EVENT_COLOR[e.type] ?? (tone === "dark" ? "bg-sky-400" : "bg-sky-500"))} />
          <span className={cn("text-sm leading-snug", tone === "dark" ? "text-slate-200" : "text-slate-700")}>{e.message}</span>
        </li>
      ))}
    </ol>
  );
}
