"use client";

import { useState } from "react";
import { coverageOf } from "@/components/coverage";
import { CategoryIcon, categoryText, IncidentStatusChip, SeverityBadge } from "@/components/status";
import { SEVERITIES } from "@/lib/constants";
import type { IncidentBundle } from "@/lib/types";
import { cn, formatRelative } from "@/lib/utils";

export function IncidentList({
  bundles,
  selectedId,
  onSelect,
}: {
  bundles: IncidentBundle[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"active" | "all">("active");
  const rank = (b: IncidentBundle) =>
    b.incident.status === "PENDING_REVIEW" ? 100 : b.incident.severity ? SEVERITIES.indexOf(b.incident.severity) * 10 + (b.incident.priority_score ?? 0) / 100 : -1;

  const list = bundles
    .filter((b) => filter === "all" || b.incident.status !== "RESOLVED")
    .sort((a, b) => {
      const resolvedA = a.incident.status === "RESOLVED" ? 1 : 0;
      const resolvedB = b.incident.status === "RESOLVED" ? 1 : 0;
      return resolvedA - resolvedB || rank(b) - rank(a) || b.incident.created_at.localeCompare(a.incident.created_at);
    });

  return (
    <>
      <div className="flex gap-1 border-b border-ops-700 p-2">
        {(["active", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-xs font-semibold tracking-wide uppercase transition",
              filter === f ? "bg-ops-700 text-white" : "text-slate-500 hover:text-slate-300",
            )}
          >
            {f}
          </button>
        ))}
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {list.length === 0 && <li className="py-10 text-center text-sm text-slate-500">No {filter === "active" ? "active " : ""}incidents.</li>}
        {list.map((b) => {
          const i = b.incident;
          const sel = i.id === selectedId;
          const cov = coverageOf(b);
          const critical = i.severity === "CRITICAL" && i.status !== "RESOLVED";
          return (
            <li key={i.id}>
              <button
                onClick={() => onSelect(i.id)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition animate-fade-up",
                  sel ? "border-brand-500/70 bg-ops-800 shadow-lg shadow-brand-600/10" : "border-ops-700 bg-ops-850 hover:border-ops-600 hover:bg-ops-800",
                  critical && !sel && "border-l-4 border-l-red-500",
                  i.status === "RESOLVED" && "opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-bold text-white">#{i.code}</span>
                  <SeverityBadge severity={i.severity} tone="dark" />
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-200">
                  <CategoryIcon category={i.category} />
                  <span className="truncate font-medium">{categoryText(i.category)}</span>
                  {i.priority_score != null && <span className="ml-auto text-xs font-semibold text-slate-400 tabular-nums">P{i.priority_score}</span>}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <IncidentStatusChip status={i.status} tone="dark" />
                  <span className="text-[11px] text-slate-500">{formatRelative(i.created_at)}</span>
                </div>
                {i.hospital_required && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-ops-700" title={`${cov.allocated}/${cov.total} patients allocated`}>
                    <div className={cn("h-full", cov.remaining === 0 ? "bg-emerald-500" : "bg-purple-500")} style={{ width: `${cov.total ? (cov.allocated / cov.total) * 100 : 0}%` }} />
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
