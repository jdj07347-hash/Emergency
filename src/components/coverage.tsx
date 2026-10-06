import type { IncidentBundle } from "@/lib/types";
import { cn } from "@/lib/utils";

export function coverageOf(bundle: IncidentBundle) {
  const total = bundle.incident.patients_to_allocate;
  const allocated = bundle.allocations.reduce((s, a) => s + a.patients, 0);
  return { total, allocated, remaining: Math.max(0, total - allocated) };
}

/** Medical capacity coverage. Never shows coverage that has not been confirmed. */
export function CoverageMeter({ bundle, tone = "light", showHospitals = true }: { bundle: IncidentBundle; tone?: "light" | "dark"; showHospitals?: boolean }) {
  const { incident } = bundle;
  const dark = tone === "dark";
  if (!incident.hospital_required) {
    return <p className={cn("text-sm", dark ? "text-slate-500" : "text-slate-500")}>Hospital coordination not required.</p>;
  }
  const { total, allocated, remaining } = coverageOf(bundle);
  const pct = total > 0 ? Math.min(100, (allocated / total) * 100) : 0;
  const covered = remaining === 0;
  const exhausted = incident.hospital_status === "UNCOVERED";

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div className={cn("text-2xl font-bold tabular-nums", dark ? "text-white" : "text-slate-900")}>
          {allocated} <span className={cn("text-base font-medium", dark ? "text-slate-500" : "text-slate-400")}>/ {total}</span>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-bold tracking-wide",
            covered
              ? dark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-700"
              : exhausted
                ? dark ? "bg-amber-500/15 text-amber-300" : "bg-amber-50 text-amber-800"
                : dark ? "bg-purple-500/15 text-purple-300" : "bg-purple-50 text-purple-700",
          )}
        >
          {covered ? "COVERED" : exhausted ? "CAPACITY SHORTFALL" : "COORDINATING"}
        </span>
      </div>
      <div className={cn("h-2.5 overflow-hidden rounded-full", dark ? "bg-ops-700" : "bg-slate-100")}>
        <div
          className={cn("h-full rounded-full transition-all duration-700", covered ? "bg-emerald-500" : "bg-purple-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {exhausted && remaining > 0 && (
        <p className={cn("rounded-lg px-3 py-2 text-sm font-semibold", dark ? "bg-amber-500/10 text-amber-300" : "bg-amber-50 text-amber-800")}>
          {remaining} PATIENTS WITHOUT ALLOCATED CAPACITY
        </p>
      )}
      {showHospitals && bundle.hospitalRequests.length > 0 && (
        <ul className="space-y-1.5">
          {bundle.hospitalRequests.map((r) => {
            const alloc = bundle.allocations.find((a) => a.request_id === r.id);
            const state =
              r.status === "CONFIRMED" ? `${alloc?.patients ?? 0} patients` : r.status === "REJECTED" ? "Declined" : r.status === "ACCEPTED" ? "Confirming capacity…" : "Awaiting response…";
            return (
              <li key={r.id} className={cn("flex items-center justify-between text-sm", dark ? "text-slate-300" : "text-slate-600")}>
                <span>🏥 {r.hospital.short_name}</span>
                <span className={cn("font-semibold tabular-nums", r.status === "CONFIRMED" ? (dark ? "text-white" : "text-slate-900") : dark ? "text-slate-500" : "text-slate-400")}>
                  {state}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
