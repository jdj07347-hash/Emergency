import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { CoverageMeter } from "@/components/coverage";
import { MapPanel } from "@/components/map/map-panel";
import { LiveSync } from "@/components/realtime";
import { CategoryIcon, categoryText, SeverityBadge, UnitStatusChip } from "@/components/status";
import { Timeline } from "@/components/timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RESPONDER_TYPE_ICON, RESPONDER_TYPE_LABEL } from "@/lib/constants";
import { EtaText } from "@/components/eta";
import { getBundleByTrackingToken, listResponders } from "@/lib/server/queries";
import type { IncidentBundle } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Emergency status", robots: { index: false } };

export default async function TrackPage({ params }: PageProps<"/track/[token]">) {
  await connection();
  const { token } = await params;
  const [bundle, responders] = await Promise.all([getBundleByTrackingToken(token), listResponders()]);

  if (!bundle) {
    return (
      <>
        <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-4xl">🔎</p>
          <h1 className="mt-4 text-xl font-bold text-slate-900">Tracking link not found</h1>
          <p className="mt-2 text-slate-500">This link is invalid or has expired.</p>
          <Link href="/" className="mt-6 font-semibold text-brand-600">
            Back to Smart Rescue
          </Link>
        </main>
      </>
    );
  }

  const { incident } = bundle;
  const id = incident.id;

  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-slate-500">EMERGENCY STATUS</p>
            <h1 className="font-mono text-3xl font-bold text-slate-900">{incident.code}</h1>
          </div>
          <LiveSync
            name={`track-${id}`}
            subscriptions={[
              { table: "incidents", filter: `id=eq.${id}` },
              { table: "responder_assignments", filter: `incident_id=eq.${id}` },
              { table: "hospital_requests", filter: `incident_id=eq.${id}` },
              { table: "hospital_allocations", filter: `incident_id=eq.${id}` },
              { table: "incident_events", filter: `incident_id=eq.${id}` },
              { table: "responders" },
            ]}
          />
        </header>

        <StatusHero bundle={bundle} />

        <Card>
          <CardContent className="pt-5">
            <Milestones bundle={bundle} />
          </CardContent>
        </Card>

        {incident.required_services.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Responding units</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {incident.required_services.map((type) => {
                const a = bundle.assignments.filter((x) => x.responder_type === type && x.status !== "REJECTED").at(-1);
                return (
                  <div key={type} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                    <span className="text-2xl">{RESPONDER_TYPE_ICON[type]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{RESPONDER_TYPE_LABEL[type]}</p>
                      {a ? (
                        <>
                          <p className="truncate text-sm text-slate-500">
                            {a.responder.callsign} · {a.responder.station}
                          </p>
                          <EtaText assignment={a} className="text-sm font-medium text-slate-700" />
                        </>
                      ) : (
                        <p className="text-sm text-slate-500">All units currently unavailable</p>
                      )}
                    </div>
                    {a ? <UnitStatusChip status={a.status} /> : <span className="text-xs font-semibold text-amber-700">WAITING</span>}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {incident.hospital_required && (
          <Card>
            <CardHeader>
              <CardTitle>🏥 Medical capacity</CardTitle>
            </CardHeader>
            <CardContent>
              <CoverageMeter bundle={bundle} />
            </CardContent>
          </Card>
        )}

        <Card className="overflow-hidden">
          <MapPanel bundle={bundle} nearby={responders} incidentLabel="🚨 Emergency location (your GPS position)" className="h-80" />
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            Coloured lines show each unit&apos;s road route to you. Faded markers are other nearby units.
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <Timeline events={bundle.events} newestFirst />
          </CardContent>
        </Card>

        <p className="px-2 text-center text-xs text-slate-400">
          Keep this page open or bookmark it — it updates automatically. If you are in immediate danger, move to a safe place.
        </p>
      </main>
    </>
  );
}

function StatusHero({ bundle }: { bundle: IncidentBundle }) {
  const { incident } = bundle;
  const message: Record<string, string> = {
    ANALYZING: "We're analyzing your report.",
    PENDING_REVIEW: "AI analysis temporarily unavailable. Your emergency report has been received and is waiting for manual assessment.",
    DISPATCHING: "Responders are being dispatched to your location.",
    IN_PROGRESS: "Help is on the way.",
    RESOLVED: "This emergency has been resolved.",
  };
  return (
    <Card className={cn("p-5", incident.status === "RESOLVED" && "border-emerald-200 bg-emerald-50/50")}>
      <div className="flex items-center gap-4">
        <CategoryIcon category={incident.category} className="text-4xl" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-slate-900">{categoryText(incident.category)}</p>
          <p className="text-sm text-slate-600">{message[incident.status]}</p>
        </div>
        {incident.severity && <SeverityBadge severity={incident.severity} />}
      </div>
    </Card>
  );
}

function Milestones({ bundle }: { bundle: IncidentBundle }) {
  const { incident, assignments, hospitalRequests } = bundle;
  const live = assignments.filter((a) => a.status !== "REJECTED");
  const items: { label: string; state: "done" | "pending" | "warn" }[] = [{ label: "Emergency received", state: "done" }];

  if (incident.ai_status === "COMPLETED") items.push({ label: "AI analysis completed", state: "done" });
  else if (incident.ai_status === "MANUAL") items.push({ label: "Assessed by Control Center", state: "done" });
  else if (incident.ai_status === "FAILED") items.push({ label: "Waiting for manual assessment", state: "warn" });
  else items.push({ label: "AI analysis in progress", state: "pending" });

  for (const type of incident.required_services) {
    const a = live.filter((x) => x.responder_type === type).at(-1);
    const label = RESPONDER_TYPE_LABEL[type];
    if (!a) items.push({ label: `${label}: all units currently unavailable`, state: "warn" });
    else if (a.status === "DISPATCHED") items.push({ label: `${label} dispatched`, state: "done" });
    else items.push({ label: `${label} accepted`, state: "done" });
  }

  if (incident.hospital_required) {
    items.push({ label: "Hospitals notified", state: hospitalRequests.length ? "done" : "pending" });
  }
  if (incident.status === "RESOLVED") items.push({ label: "Emergency resolved", state: "done" });

  return (
    <ul className="space-y-2.5">
      {items.map((m) => (
        <li key={m.label} className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
              m.state === "done" && "bg-emerald-600 text-white",
              m.state === "pending" && "bg-slate-200 text-slate-500",
              m.state === "warn" && "bg-amber-100 text-amber-700",
            )}
          >
            {m.state === "done" ? "✓" : m.state === "warn" ? "!" : "…"}
          </span>
          <span className={cn("font-medium", m.state === "pending" ? "text-slate-400" : "text-slate-800")}>{m.label}</span>
        </li>
      ))}
    </ul>
  );
}
