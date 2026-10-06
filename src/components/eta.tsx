"use client";

import { useEffect, useState } from "react";
import { assignmentTravel, formatDistance, formatEta } from "@/lib/geo";
import type { ResponderAssignment } from "@/lib/types";

type EtaAssignment = Pick<
  ResponderAssignment,
  "status" | "distance_km" | "route_distance_km" | "eta_seconds" | "dispatched_at" | "en_route_at"
>;

/** Seconds until arrival. Counts down once the unit is en route; null once it has arrived. */
export function remainingEtaSeconds(a: EtaAssignment, now: number): number | null {
  const { durationSec } = assignmentTravel(a);
  if (a.status === "DISPATCHED" || a.status === "ACCEPTED") return durationSec;
  if (a.status === "EN_ROUTE") {
    const elapsed = a.en_route_at ? (now - new Date(a.en_route_at).getTime()) / 1000 : 0;
    return Math.max(0, durationSec - elapsed);
  }
  return null;
}

function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "4.2 km by road · arriving in ~9 min", updated live. */
export function EtaText({ assignment, className }: { assignment: EtaAssignment; className?: string }) {
  const now = useNow();
  const travel = assignmentTravel(assignment);
  const remaining = remainingEtaSeconds(assignment, now);
  const dist = `${formatDistance(travel.distanceKm)} ${travel.source === "ROAD" ? "by road" : "(est.)"}`;

  let eta: string;
  if (assignment.status === "COMPLETED") eta = "response completed";
  else if (remaining == null) eta = "on scene";
  else if (assignment.status === "EN_ROUTE") eta = remaining < 30 ? "arriving now" : `arriving in ~${formatEta(remaining)}`;
  else eta = `~${formatEta(remaining)} drive`;

  return (
    <span className={className} suppressHydrationWarning>
      {dist} · {eta}
    </span>
  );
}

/** Compact ETA value for stat tiles. */
export function EtaValue({ assignment }: { assignment: EtaAssignment }) {
  const now = useNow();
  const remaining = remainingEtaSeconds(assignment, now);
  return <span suppressHydrationWarning>{remaining == null ? "On scene" : formatEta(remaining)}</span>;
}
