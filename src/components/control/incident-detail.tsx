"use client";

import { CheckCircle2, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { resolveIncidentManually, retryDispatch } from "@/app/actions/control";
import { EvidenceGallery, VoiceReport } from "@/components/media";
import { CategoryIcon, categoryText, IncidentStatusChip, SeverityBadge, ServiceTag } from "@/components/status";
import { Button } from "@/components/ui/button";
import { WEIGHTS } from "@/lib/priority";
import type { IncidentBundle } from "@/lib/types";
import { formatTime, formatVictimRange } from "@/lib/utils";
import { ManualAssessment } from "./manual-assessment";

const FACTOR_LABEL: Record<keyof typeof WEIGHTS, string> = {
  severity: "AI severity",
  victims: "Victim count",
  life_threat: "Life-threatening",
  trapped: "Trapped victims",
  additional_risk: "Additional risk",
};

export function IncidentDetail({ bundle }: { bundle: IncidentBundle }) {
  const { incident } = bundle;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const liveTypes = new Set(bundle.assignments.filter((a) => a.status !== "REJECTED").map((a) => a.responder_type));
  const unfilled = incident.required_services.filter((t) => !liveTypes.has(t));
  const canDispatch = unfilled.length > 0 && (incident.status === "DISPATCHING" || incident.status === "IN_PROGRESS");

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
    });

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      <div>
        <div className="flex items-center gap-2">
          <IncidentStatusChip status={incident.status} tone="dark" />
          <span className="text-xs text-slate-500">Reported {formatTime(incident.created_at)}</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <CategoryIcon category={incident.category} className="text-3xl" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-white">{categoryText(incident.category)}</h2>
            <p className="font-mono text-xs text-slate-500">
              {incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}
              {incident.gps_accuracy != null && ` · ±${Math.round(incident.gps_accuracy)} m`}
            </p>
          </div>
          <SeverityBadge severity={incident.severity} tone="dark" size="lg" />
        </div>
      </div>

      {error && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{error}</p>}

      {incident.status === "PENDING_REVIEW" && <ManualAssessment incident={incident} />}

      {incident.priority_score != null && incident.priority_breakdown && (
        <section className="rounded-xl border border-ops-700 bg-ops-850 p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Priority score</h3>
            <p className="text-3xl font-black text-white tabular-nums">
              {incident.priority_score}
              <span className="text-sm font-medium text-slate-500"> / 100</span>
            </p>
          </div>
          <ul className="mt-3 space-y-2">
            {(Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((k) => {
              const v = incident.priority_breakdown![k];
              return (
                <li key={k} className="grid grid-cols-[110px_1fr_44px] items-center gap-2 text-xs">
                  <span className="text-slate-400">{FACTOR_LABEL[k]}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-ops-700">
                    <span className="block h-full rounded-full bg-sky-400" style={{ width: `${(v / WEIGHTS[k]) * 100}%` }} />
                  </span>
                  <span className="text-right text-slate-300 tabular-nums">
                    {v}/{WEIGHTS[k]}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">Calculated by the backend from AI signals. AI interprets — the system decides.</p>
        </section>
      )}

      <section className="grid grid-cols-3 gap-2">
        <Fact label="Reported" value={incident.citizen_victims ?? "—"} />
        <Fact label="AI estimate" value={formatVictimRange(incident.ai_victims_min, incident.ai_victims_max)} />
        <Fact label="To hospitals" value={incident.hospital_required ? incident.patients_to_allocate : "—"} />
      </section>

      {(incident.ai_summary || incident.ai_reasoning.length > 0) && (
        <section>
          <h3 className="mb-2 flex items-center justify-between text-xs font-semibold tracking-wider text-slate-400 uppercase">
            {incident.ai_status === "MANUAL" ? "Operator assessment" : "AI interpretation"}
            {incident.ai_confidence != null && incident.ai_status === "COMPLETED" && (
              <span className="normal-case text-slate-500">{Math.round(incident.ai_confidence * 100)}% confidence</span>
            )}
          </h3>
          {incident.ai_summary && <p className="text-sm text-slate-200">{incident.ai_summary}</p>}
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-400">
            {incident.ai_reasoning.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {incident.life_threatening && <Flag>Life-threatening</Flag>}
            {incident.trapped_possible && <Flag>Trapped possible</Flag>}
            {incident.fire_risk && <Flag>Fire risk</Flag>}
          </div>
        </section>
      )}

      {incident.ai_status === "FAILED" && incident.ai_error && (
        <p className="rounded-lg bg-ops-850 px-3 py-2 font-mono text-[11px] break-words text-slate-500">AI error: {incident.ai_error}</p>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">Original report</h3>
        <VoiceReport media={bundle.media} tone="dark" />
        {incident.transcript && <p className="mt-2 rounded-lg bg-ops-850 px-3 py-2 text-sm text-slate-300 italic">“{incident.transcript}”</p>}
        {incident.description && (
          <p className="mt-2 text-sm text-slate-300">
            <span className="text-slate-500">Citizen text: </span>
            {incident.description}
          </p>
        )}
      </section>

      {bundle.media.some((m) => m.kind !== "AUDIO") && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">Evidence</h3>
          <EvidenceGallery media={bundle.media} tone="dark" />
        </section>
      )}

      {incident.required_services.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">Required response</h3>
          <div className="flex flex-wrap gap-1.5">
            {incident.required_services.map((t) => (
              <ServiceTag key={t} type={t} tone="dark" />
            ))}
          </div>
          {unfilled.length > 0 && incident.status !== "RESOLVED" && (
            <p className="mt-2 text-sm text-amber-300">All units currently unavailable: {unfilled.map((t) => t.toLowerCase()).join(", ")}</p>
          )}
        </section>
      )}

      {incident.status !== "RESOLVED" && incident.status !== "PENDING_REVIEW" && (
        <section className="flex flex-col gap-2 border-t border-ops-700 pt-4">
          {canDispatch && (
            <Button variant="dark" disabled={pending} onClick={() => run(() => retryDispatch(incident.id))}>
              <RefreshCw /> Retry dispatch for unfilled services
            </Button>
          )}
          <Button
            variant="dark"
            disabled={pending}
            onClick={() => window.confirm(`Resolve ${incident.code}? All attached units will be released.`) && run(() => resolveIncidentManually(incident.id))}
          >
            <CheckCircle2 /> Resolve incident
          </Button>
        </section>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-ops-700 bg-ops-850 px-3 py-2 text-center">
      <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">{label}</p>
      <p className="text-lg font-bold text-white tabular-nums">{value}</p>
    </div>
  );
}

function Flag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300 ring-1 ring-amber-400/25">{children}</span>;
}
