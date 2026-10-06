"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export interface RealtimeSubscription {
  table: string;
  /** Postgres-changes filter, e.g. "incident_id=eq.<uuid>" */
  filter?: string;
}

export type LiveStatus = "connecting" | "live" | "offline";

const FALLBACK_REFRESH_MS = 15_000;

/**
 * Subscribe to Supabase Realtime and re-render server data on any change.
 * Server components remain the single source of truth; Realtime is only the
 * trigger. A slow fallback refresh runs only while Realtime is unavailable.
 */
export function useRealtimeRefresh(name: string, subscriptions: RealtimeSubscription[]): LiveStatus {
  const router = useRouter();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const key = JSON.stringify(subscriptions);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const client = supabaseBrowser();
    const subs = JSON.parse(key) as RealtimeSubscription[];
    let fallback: ReturnType<typeof setInterval> | null = null;
    const startFallback = () => {
      if (!fallback) fallback = setInterval(() => router.refresh(), FALLBACK_REFRESH_MS);
    };
    const stopFallback = () => {
      if (fallback) clearInterval(fallback);
      fallback = null;
    };

    if (!client) {
      queueMicrotask(() => setStatus("offline"));
      startFallback();
      return stopFallback;
    }

    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    };

    let disposed = false;
    let channel = client.channel(`${name}-${Math.random().toString(36).slice(2)}`);
    for (const s of subs) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table: s.table, filter: s.filter }, refresh);
    }
    channel.subscribe((state) => {
      // removeChannel() during cleanup reports CLOSED — must not restart the fallback.
      if (disposed) return;
      if (state === "SUBSCRIBED") {
        setStatus("live");
        stopFallback();
        refresh(); // catch anything that changed while connecting
      } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
        setStatus("offline");
        startFallback();
      }
    });

    return () => {
      disposed = true;
      stopFallback();
      if (timer.current) clearTimeout(timer.current);
      client.removeChannel(channel);
    };
  }, [name, key, router]);

  return status;
}

export function LiveBadge({ status, tone = "light", className }: { status: LiveStatus; tone?: "light" | "dark"; className?: string }) {
  const label = status === "live" ? "LIVE" : status === "connecting" ? "CONNECTING" : "RECONNECTING";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wider",
        tone === "dark" ? "bg-ops-800 text-slate-300 ring-1 ring-ops-600" : "bg-white text-slate-600 ring-1 ring-slate-200",
        className,
      )}
      title={status === "offline" ? "Realtime unavailable — refreshing periodically" : undefined}
    >
      <span className="relative flex size-2">
        {status === "live" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
        <span className={cn("relative inline-flex size-2 rounded-full", status === "live" ? "bg-emerald-500" : "bg-amber-400")} />
      </span>
      {label}
    </span>
  );
}

/** Drop-in for server-rendered pages: subscribes and shows a LIVE badge. */
export function LiveSync({ name, subscriptions, tone, className }: { name: string; subscriptions: RealtimeSubscription[]; tone?: "light" | "dark"; className?: string }) {
  const status = useRealtimeRefresh(name, subscriptions);
  return <LiveBadge status={status} tone={tone} className={className} />;
}
