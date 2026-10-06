"use client";

import type { IncidentBundle, Responder } from "@/lib/types";
import { incidentMapData, MapView } from "./map-view";

/** Client wrapper so server pages can render an incident map. */
export function MapPanel({
  bundle,
  highlightResponderId,
  nearby,
  incidentLabel,
  className,
}: {
  bundle: IncidentBundle;
  highlightResponderId?: string;
  /** Other units to show if they are close to the incident. */
  nearby?: Responder[];
  incidentLabel?: string;
  className?: string;
}) {
  const { points, lines } = incidentMapData(bundle, { highlightResponderId, nearby, incidentLabel });
  return <MapView points={points} lines={lines} focusKey={bundle.incident.id} className={className} />;
}
