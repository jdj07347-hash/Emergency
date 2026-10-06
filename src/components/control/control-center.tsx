"use client";

import { LogOut } from "lucide-react";
import { useMemo, useState } from "react";
import { demoLogout } from "@/app/actions/auth";
import { coverageOf } from "@/components/coverage";
import { MapView } from "@/components/map/map-view";
import type { MapLine, MapPoint } from "@/components/map/types";
import { LiveBadge, useRealtimeRefresh } from "@/components/realtime";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/card";
import { CATEGORY_LABEL, RESPONDER_TYPE_ICON } from "@/lib/constants";
import { formatDistance, haversineKm } from "@/lib/geo";
import type { Hospital, IncidentBundle, Responder } from "@/lib/types";
import { DemoTools } from "./demo-tools";
import { IncidentDetail } from "./incident-detail";
import { IncidentList } from "./incident-list";
import { ResponseBoard } from "./response-board";

const ALL_TABLES = [
  "incidents",
  "responder_assignments",
  "hospital_requests",
  "hospital_allocations",
  "incident_events",
  "responders",
  "hospitals",
].map((table) => ({ table }));

export function ControlCenter({ bundles, responders, hospitals }: { bundles: IncidentBundle[]; responders: Responder[]; hospitals: Hospital[] }) {
  const live = useRealtimeRefresh("control-center", ALL_TABLES);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const active = bundles.filter((b) => b.incident.status !== "RESOLVED");
  // Default selection: highest-priority active incident, else most recent.
  const selected =
    bundles.find((b) => b.incident.id === selectedId) ??
    [...active].sort((a, b) => (b.incident.priority_score ?? 0) - (a.incident.priority_score ?? 0))[0] ??
    bundles[0] ??
    null;

  const metrics = useMemo(() => {
    const uncovered = active.reduce((s, b) => s + (b.incident.hospital_required ? coverageOf(b).remaining : 0), 0);
    return {
      active: active.length,
      critical: active.filter((b) => b.incident.severity === "CRITICAL").length,
      review: active.filter((b) => b.incident.status === "PENDING_REVIEW").length,
      unitsAvailable: responders.filter((r) => r.status === "AVAILABLE").length,
      unitsDeployed: responders.filter((r) => !["AVAILABLE", "BUSY"].includes(r.status)).length,
      bedCapacity: hospitals.filter((h) => h.is_available).reduce((s, h) => s + h.emergency_capacity, 0),
      uncovered,
      resolved: bundles.filter((b) => b.incident.status === "RESOLVED").length,
    };
  }, [active, bundles, responders, hospitals]);

  const { points, lines } = useMemo(() => buildMap(bundles, responders, hospitals, selected), [bundles, responders, hospitals, selected]);

  return (
    <div className="flex min-h-dvh flex-col bg-ops-950 text-slate-200 lg:h-dvh lg:overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-ops-700 bg-ops-900 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-red-600 text-lg">🚨</span>
          <div>
            <p className="text-sm font-black tracking-[0.2em] text-white">SMART RESCUE</p>
            <p className="text-[11px] font-semibold tracking-[0.25em] text-slate-500">LIVE COMMAND CENTER</p>
          </div>
          <LiveBadge status={live} tone="dark" className="ml-2" />
        </div>

        <dl className="flex flex-1 flex-wrap items-center gap-2">
          <Metric label="Active" value={metrics.active} />
          <Metric label="Critical" value={metrics.critical} tone={metrics.critical ? "red" : undefined} />
          {metrics.review > 0 && <Metric label="Needs review" value={metrics.review} tone="amber" />}
          <Metric label="Units available" value={`${metrics.unitsAvailable}/${responders.length}`} tone="green" />
          <Metric label="Deployed" value={metrics.unitsDeployed} />
          <Metric label="Hospital capacity" value={metrics.bedCapacity} tone="purple" />
          {metrics.uncovered > 0 && <Metric label="Uncovered patients" value={metrics.uncovered} tone="amber" />}
          <Metric label="Resolved" value={metrics.resolved} />
        </dl>

        <div className="flex items-center gap-2">
          <DemoTools selected={selected?.incident ?? null} />
          <form action={demoLogout.bind(null, "CONTROL")}>
            <Button variant="dark-ghost" size="icon" aria-label="Sign out">
              <LogOut />
            </Button>
          </form>
        </div>
      </header>

      <div className="grid flex-1 gap-3 p-3 lg:min-h-0 lg:grid-cols-[300px_minmax(0,1fr)_380px] lg:grid-rows-[minmax(0,1fr)_minmax(0,270px)]">
        <Panel className="flex min-h-0 flex-col lg:row-span-2">
          <PanelHeader>
            <span>Incidents</span>
            <span className="rounded-full bg-ops-800 px-2 py-0.5 text-[10px] text-slate-300">{bundles.length}</span>
          </PanelHeader>
          <IncidentList bundles={bundles} selectedId={selected?.incident.id ?? null} onSelect={setSelectedId} />
        </Panel>

        <Panel className="relative h-[55vh] min-h-0 overflow-hidden lg:h-auto">
          <MapView points={points} lines={lines} dark focusKey={selected?.incident.id ?? "all"} onSelect={setSelectedId} className="h-full" />
          <MapLegend />
        </Panel>

        <Panel className="flex min-h-0 flex-col lg:row-span-2">
          <PanelHeader>
            <span>Incident details</span>
            {selected && <span className="font-mono text-slate-300">{selected.incident.code}</span>}
          </PanelHeader>
          {selected ? (
            <IncidentDetail key={selected.incident.id} bundle={selected} />
          ) : (
            <EmptyState />
          )}
        </Panel>

        <ResponseBoard bundle={selected} responders={responders} />
      </div>
    </div>
  );
}

function buildMap(bundles: IncidentBundle[], responders: Responder[], hospitals: Hospital[], selected: IncidentBundle | null) {
  const points: MapPoint[] = [];
  const lines: MapLine[] = [];
  const sel = selected?.incident;

  for (const b of bundles) {
    const i = b.incident;
    const isSel = i.id === sel?.id;
    if (i.status === "RESOLVED" && !isSel) continue;
    points.push({
      id: i.id,
      kind: "incident",
      latitude: i.latitude,
      longitude: i.longitude,
      label: `${i.code} · ${i.category ? CATEGORY_LABEL[i.category] : "Unassessed"}`,
      sublabel: `${i.severity ?? "Pending"}${i.priority_score != null ? ` · priority ${i.priority_score}` : ""}`,
      highlighted: isSel && i.status !== "RESOLVED",
      dimmed: !isSel,
      focus: isSel,
      selectable: true,
    });
  }

  const engaged = new Set(selected?.assignments.filter((a) => a.status !== "REJECTED").map((a) => a.responder_id));
  for (const r of responders) {
    points.push({
      id: r.id,
      kind: r.type,
      latitude: r.latitude,
      longitude: r.longitude,
      label: `${RESPONDER_TYPE_ICON[r.type]} ${r.name} (${r.callsign}) · ${r.station}`,
      sublabel: `${r.status.replace("_", " ")}${sel ? ` · ${formatDistance(haversineKm(r, sel))} from ${sel.code}` : ""}`,
      dimmed: r.status === "BUSY",
      focus: engaged.has(r.id),
    });
  }
  for (const h of hospitals) {
    points.push({
      id: h.id,
      kind: "hospital",
      latitude: h.latitude,
      longitude: h.longitude,
      label: h.short_name,
      sublabel: `${h.is_available ? `${h.emergency_capacity} emergency capacity` : "Not accepting"}`,
      dimmed: !h.is_available,
    });
  }

  if (selected && sel && sel.status !== "RESOLVED") {
    for (const a of selected.assignments) {
      if (a.status === "REJECTED" || a.status === "COMPLETED") continue;
      lines.push({
        id: a.id,
        from: [a.responder.latitude, a.responder.longitude],
        to: [sel.latitude, sel.longitude],
        path: a.status === "ARRIVED" || a.status === "RESPONDING" ? null : a.route_geometry,
        color: { FIRE: "#f97316", POLICE: "#3b82f6", AMBULANCE: "#22c55e" }[a.responder_type],
        dashed: a.status === "DISPATCHED" || !a.route_geometry?.length,
      });
    }
    for (const r of selected.hospitalRequests) {
      if (r.status !== "CONFIRMED") continue;
      lines.push({ id: r.id, from: [sel.latitude, sel.longitude], to: [r.hospital.latitude, r.hospital.longitude], color: "#a855f7", dashed: true });
    }
  }
  return { points, lines };
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: "red" | "amber" | "green" | "purple" }) {
  const color = {
    red: "text-red-400",
    amber: "text-amber-300",
    green: "text-emerald-300",
    purple: "text-purple-300",
  }[tone ?? "red"];
  return (
    <div className="rounded-xl border border-ops-700 bg-ops-850 px-3 py-1.5">
      <dt className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">{label}</dt>
      <dd className={`text-lg leading-tight font-bold tabular-nums ${tone ? color : "text-white"}`}>{value}</dd>
    </div>
  );
}

function MapLegend() {
  const items = [
    ["#ef4444", "Emergency"],
    ["#ea580c", "Fire"],
    ["#2563eb", "Police"],
    ["#16a34a", "Ambulance"],
    ["#9333ea", "Hospital"],
  ];
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap gap-3 rounded-xl border border-ops-700 bg-ops-900/90 px-3 py-2 text-[11px] text-slate-300 backdrop-blur">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="mb-3 text-4xl">🛰️</div>
      <p className="font-semibold text-slate-200">No incidents yet</p>
      <p className="mt-1 text-sm text-slate-500">Reports submitted from the citizen app appear here in real time.</p>
    </div>
  );
}
