"use client";

import dynamic from "next/dynamic";
import { RESPONDER_TYPE_ICON } from "@/lib/constants";
import { assignmentTravel, formatDistance, formatEta, haversineKm } from "@/lib/geo";
import type { IncidentBundle, Responder } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { MapLine, MapPoint, MapViewProps } from "./types";

// Leaflet touches `window`, so it is only ever rendered in the browser.
const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

function MapSkeleton() {
  return (
    <div className="flex h-full w-full animate-pulse items-center justify-center bg-slate-200/60 text-sm text-slate-500">
      Loading map…
    </div>
  );
}

export function MapView({ className, ...props }: MapViewProps) {
  return (
    <div className={cn("h-full w-full", className)}>
      <LeafletMap {...props} className="h-full w-full" />
    </div>
  );
}

const ROUTE_COLOR = { FIRE: "#f97316", POLICE: "#3b82f6", AMBULANCE: "#22c55e" } as const;

/** Units that are not part of this incident are shown only if they are this close (km). */
const NEARBY_KM = 15;

/**
 * Incident (exact GPS + accuracy circle) + its assigned units with road routes +
 * hospitals involved, and optionally other nearby units. Used on responder & tracking pages.
 */
export function incidentMapData(
  bundle: IncidentBundle,
  opts: { highlightResponderId?: string; nearby?: Responder[]; incidentLabel?: string } = {},
) {
  const { incident } = bundle;
  const points: MapPoint[] = [
    {
      id: incident.id,
      kind: "incident",
      latitude: incident.latitude,
      longitude: incident.longitude,
      label: opts.incidentLabel ?? `🚨 Emergency location · ${incident.code}`,
      sublabel: incident.gps_accuracy
        ? `${incident.latitude.toFixed(5)}, ${incident.longitude.toFixed(5)} · GPS ±${Math.round(incident.gps_accuracy)} m`
        : undefined,
      highlighted: incident.status !== "RESOLVED",
      focus: true,
      accuracyM: incident.gps_accuracy && incident.gps_accuracy <= 2000 ? incident.gps_accuracy : undefined,
    },
  ];
  const lines: MapLine[] = [];
  const shown = new Set<string>();
  for (const a of bundle.assignments) {
    if (a.status === "REJECTED") continue;
    const r = a.responder;
    const mine = r.id === opts.highlightResponderId;
    const travel = assignmentTravel(a);
    shown.add(r.id);
    points.push({
      id: r.id,
      kind: r.type,
      latitude: r.latitude,
      longitude: r.longitude,
      label: `${RESPONDER_TYPE_ICON[r.type]} ${r.name} · ${r.callsign}`,
      sublabel: `${r.station} · ${formatDistance(travel.distanceKm)}${travel.source === "ROAD" ? " by road" : ""} · ~${formatEta(travel.durationSec)}`,
      focus: true,
      highlighted: mine,
    });
    if (a.status !== "COMPLETED" && a.status !== "ARRIVED" && a.status !== "RESPONDING") {
      lines.push({
        id: a.id,
        from: [r.latitude, r.longitude],
        to: [incident.latitude, incident.longitude],
        path: a.route_geometry,
        color: opts.highlightResponderId && !mine ? "#64748b" : ROUTE_COLOR[a.responder_type],
        dashed: !a.route_geometry?.length || a.status === "DISPATCHED",
      });
    }
  }
  for (const r of opts.nearby ?? []) {
    if (shown.has(r.id)) continue;
    const km = haversineKm(r, incident);
    if (km > NEARBY_KM) continue;
    points.push({
      id: r.id,
      kind: r.type,
      latitude: r.latitude,
      longitude: r.longitude,
      label: `${RESPONDER_TYPE_ICON[r.type]} ${r.name} · ${r.callsign}`,
      sublabel: `${r.station} · ${formatDistance(km)} away · ${r.status.replace("_", " ").toLowerCase()}`,
      dimmed: true,
    });
  }
  for (const req of bundle.hospitalRequests) {
    const alloc = bundle.allocations.find((x) => x.request_id === req.id);
    points.push({
      id: req.hospital.id,
      kind: "hospital",
      latitude: req.hospital.latitude,
      longitude: req.hospital.longitude,
      label: req.hospital.short_name,
      sublabel: alloc ? `${alloc.patients} patients allocated` : req.status.toLowerCase(),
      dimmed: req.status === "REJECTED",
    });
  }
  return { points, lines };
}
