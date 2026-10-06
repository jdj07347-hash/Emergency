"use client";

import { LogOut, Navigation } from "lucide-react";
import { useState, useTransition } from "react";
import { demoLogout } from "@/app/actions/auth";
import { setResponderAvailability, updateAssignmentStatus } from "@/app/actions/responder";
import { MapPanel } from "@/components/map/map-panel";
import { EvidenceGallery, VoiceReport } from "@/components/media";
import { LiveBadge, useRealtimeRefresh } from "@/components/realtime";
import { CategoryIcon, categoryText, SeverityBadge, ServiceTag, UnitStatusChip } from "@/components/status";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  ASSIGNMENT_ACTION_LABEL,
  ASSIGNMENT_TRANSITIONS,
  RESPONDER_TYPE_ICON,
  type AssignmentStatus,
} from "@/lib/constants";
import { EtaValue } from "@/components/eta";
import { assignmentTravel, formatDistance, googleMapsNavigationUrl } from "@/lib/geo";
import type { IncidentBundle, Responder, ResponderAssignment } from "@/lib/types";
import { cn, formatRelative, formatVictimRange } from "@/lib/utils";

const SEVERITY_BANNER: Record<string, string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH: "bg-orange-500 text-white",
  MEDIUM: "bg-yellow-400 text-slate-900",
  LOW: "bg-emerald-600 text-white",
};

export function ResponderDashboard({
  responder,
  bundles,
  typeSlug,
  number,
}: {
  responder: Responder;
  bundles: IncidentBundle[];
  typeSlug: string;
  number: string;
}) {
  const live = useRealtimeRefresh(`responder-${responder.id}`, [
    { table: "responder_assignments", filter: `responder_id=eq.${responder.id}` },
    { table: "responders", filter: `id=eq.${responder.id}` },
    { table: "incidents" },
  ]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const mine = (b: IncidentBundle) => b.assignments.filter((a) => a.responder_id === responder.id).at(-1)!;
  const active = bundles.find((b) => ACTIVE_ASSIGNMENT_STATUSES.includes(mine(b).status));
  const history = bundles.filter((b) => b !== active);

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
    });

  const offDutyToggle = responder.status === "AVAILABLE" || responder.status === "BUSY";

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <header className="sticky top-0 z-[1100] border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <span className="grid size-11 place-items-center rounded-xl bg-slate-900 text-2xl">{RESPONDER_TYPE_ICON[responder.type]}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-slate-900">{responder.name}</p>
            <p className="truncate text-xs text-slate-500">
              {responder.callsign} · {responder.station}
            </p>
          </div>
          <LiveBadge status={live} />
          <form action={demoLogout.bind(null, `${responder.type}-${responder.demo_number}`)}>
            <Button variant="ghost" size="icon" aria-label="Sign out">
              <LogOut />
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-4 pb-36">
        <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            Unit status <UnitStatusChip status={responder.status} />
          </div>
          {offDutyToggle && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => setResponderAvailability(typeSlug, number, responder.status === "BUSY"))}
            >
              {responder.status === "BUSY" ? "Set available" : "Set busy"}
            </Button>
          )}
        </div>

        {error && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200">{error}</p>}

        {active ? (
          <ActiveIncident
            bundle={active}
            responder={responder}
            status={mine(active).status}
            assignment={mine(active)}
            pending={pending}
            onTransition={(next) => {
              if (next === "REJECTED" && !window.confirm("Decline this emergency? The next nearest unit will be dispatched.")) return;
              run(() => updateAssignmentStatus(typeSlug, number, mine(active).id, next));
            }}
          />
        ) : (
          <Card className="px-6 py-14 text-center">
            <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-emerald-50 text-3xl">🛰️</div>
            <p className="text-lg font-semibold text-slate-900">Standing by</p>
            <p className="mt-1 text-slate-500">
              {responder.status === "BUSY" ? "Unit is marked busy and will not receive new incidents." : "New emergencies will appear here instantly."}
            </p>
          </Card>
        )}

        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent assignments</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-slate-100">
              {history.map((b) => (
                <div key={b.incident.id} className="flex items-center gap-3 py-3">
                  <CategoryIcon category={b.incident.category} className="text-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800">
                      {b.incident.code} · {categoryText(b.incident.category)}
                    </p>
                    <p className="text-xs text-slate-500">{formatRelative(b.incident.created_at)}</p>
                  </div>
                  <UnitStatusChip status={mine(b).status} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function ActiveIncident({
  bundle,
  responder,
  status,
  assignment,
  pending,
  onTransition,
}: {
  bundle: IncidentBundle;
  responder: Responder;
  status: AssignmentStatus;
  assignment: ResponderAssignment;
  pending: boolean;
  onTransition: (next: AssignmentStatus) => void;
}) {
  const { incident } = bundle;
  const severity = incident.severity ?? "MEDIUM";
  const next = ASSIGNMENT_TRANSITIONS[status].filter((s) => s !== "REJECTED");
  const travel = assignmentTravel(assignment);
  const others = bundle.assignments.filter((a) => a.responder_id !== responder.id && a.status !== "REJECTED");

  return (
    <div className="space-y-4 animate-fade-up">
      <Card className="overflow-hidden">
        {/* 1. Severity */}
        <div className={cn("flex items-center justify-between px-5 py-3", SEVERITY_BANNER[severity])}>
          <span className="text-sm font-extrabold tracking-[0.15em]">🚨 {severity} INCIDENT</span>
          <span className="font-mono text-sm font-semibold opacity-90">{incident.code}</span>
        </div>
        <div className="space-y-5 p-5">
          {/* 2. Type */}
          <div className="flex items-center gap-3">
            <CategoryIcon category={incident.category} className="text-4xl" />
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{categoryText(incident.category).toUpperCase()}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <UnitStatusChip status={status} />
                <span className="text-xs text-slate-500">Dispatched {formatRelative(bundle.assignments.find((a) => a.responder_id === responder.id)!.dispatched_at)}</span>
              </div>
            </div>
          </div>

          {/* 3–5. Location, distance, victims, priority */}
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="ETA" value={<EtaValue assignment={assignment} />} hint={travel.source === "ROAD" ? "road route" : "estimate"} />
            <Stat label="Distance" value={formatDistance(travel.distanceKm)} hint={travel.source === "ROAD" ? "by road" : "est. road"} />
            <Stat label="Victims" value={formatVictimRange(incident.ai_victims_min, incident.ai_victims_max)} hint={incident.citizen_victims != null ? `${incident.citizen_victims} reported` : "AI estimate"} />
            <Stat label="Priority" value={incident.priority_score != null ? `${incident.priority_score}` : "—"} hint="/ 100" />
          </dl>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Location</p>
              <p className="truncate font-mono text-sm text-slate-800">
                {incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}
              </p>
              {incident.gps_accuracy != null && <p className="text-xs text-slate-500">GPS ±{Math.round(incident.gps_accuracy)} m</p>}
            </div>
            <a href={googleMapsNavigationUrl(incident.latitude, incident.longitude)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "primary", size: "md" })}>
              <Navigation /> Navigate
            </a>
          </div>

          {(incident.trapped_possible || incident.fire_risk || incident.life_threatening) && (
            <div className="flex flex-wrap gap-2">
              {incident.life_threatening && <Flag>Life-threatening</Flag>}
              {incident.trapped_possible && <Flag>Possible trapped victims</Flag>}
              {incident.fire_risk && <Flag>Fire risk</Flag>}
            </div>
          )}

          {/* 6. Voice report */}
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">🔊 Original report</p>
            <VoiceReport media={bundle.media} />
            {(incident.transcript || incident.description) && (
              <blockquote className="mt-3 rounded-xl border-l-4 border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 italic">
                “{incident.transcript || incident.description}”
              </blockquote>
            )}
          </div>
        </div>

        {/* 7. Map */}
        <MapPanel bundle={bundle} highlightResponderId={responder.id} className="h-72 border-t border-slate-200" />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI analysis</CardTitle>
          {incident.ai_confidence != null && incident.ai_status === "COMPLETED" && (
            <span className="text-xs text-slate-500">{Math.round(incident.ai_confidence * 100)}% confidence</span>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            {incident.ai_status === "MANUAL" && <span className="text-xs text-slate-500">Manual assessment</span>}
          </div>
          {incident.ai_summary && <p className="text-slate-700">{incident.ai_summary}</p>}
          {incident.ai_reasoning.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
              {incident.ai_reasoning.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {incident.description && incident.transcript && (
            <p className="text-sm text-slate-500">
              <span className="font-semibold">Citizen note:</span> {incident.description}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Required response</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {incident.required_services.map((t) => (
              <ServiceTag key={t} type={t} />
            ))}
          </div>
          {others.map((a) => (
            <div key={a.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">
                {RESPONDER_TYPE_ICON[a.responder_type]} {a.responder.name}
              </span>
              <UnitStatusChip status={a.status} />
            </div>
          ))}
        </CardContent>
      </Card>

      {bundle.media.some((m) => m.kind !== "AUDIO") && (
        <Card>
          <CardHeader>
            <CardTitle>Scene evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <EvidenceGallery media={bundle.media} />
          </CardContent>
        </Card>
      )}

      {/* 9. Status controls — always within thumb reach */}
      <div className="fixed inset-x-0 bottom-0 z-[1100] border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-3">
          {status === "DISPATCHED" && (
            <Button variant="outline" size="xl" className="px-5" disabled={pending} onClick={() => onTransition("REJECTED")}>
              Decline
            </Button>
          )}
          {next.map((s) => (
            <Button
              key={s}
              variant={s === "ACCEPTED" ? "emergency" : s === "COMPLETED" ? "success" : "default"}
              size="xl"
              className="flex-1"
              disabled={pending}
              onClick={() => onTransition(s)}
            >
              {ASSIGNMENT_ACTION_LABEL[s]?.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3 text-center">
      <dt className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{value}</dd>
      {hint && <dd className="text-[11px] text-slate-400">{hint}</dd>}
    </div>
  );
}

function Flag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">⚠ {children}</span>;
}
