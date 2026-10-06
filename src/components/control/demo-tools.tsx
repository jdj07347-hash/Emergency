"use client";

import { Settings2 } from "lucide-react";
import { useState, useTransition } from "react";
import { recenterDemoUnits, resetDemo } from "@/app/actions/control";
import type { Incident } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Presenter utilities. Units/hospitals are positioned by offsets around a center point. */
export function DemoTools({ selected }: { selected: Incident | null }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = (label: string, fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setMessage(null);
      const res = await fn();
      setMessage(res.error ?? `${label} — done`);
    });

  const recenterHere = () => {
    if (!window.isSecureContext) return setMessage("Location needs an https:// connection (or localhost).");
    if (!navigator.geolocation) return setMessage("Geolocation unavailable in this browser.");
    navigator.geolocation.getCurrentPosition(
      (p) => run("Units re-centered on your location", () => recenterDemoUnits(p.coords.latitude, p.coords.longitude)),
      () => setMessage("Location permission denied."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const item = "w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-ops-700 disabled:opacity-40";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn("flex h-9 items-center gap-2 rounded-lg border border-ops-600 bg-ops-800 px-3 text-sm font-medium text-slate-200 hover:bg-ops-700", open && "bg-ops-700")}
      >
        <Settings2 className="size-4" /> Demo tools
      </button>
      {open && (
        <div className="absolute right-0 z-[2000] mt-2 w-80 space-y-1 rounded-xl border border-ops-600 bg-ops-850 p-2 shadow-2xl shadow-black/50">
          <p className="px-3 pt-1 pb-2 text-[11px] text-slate-500">
            Idle units are placed 10–20 km around each new emergency automatically. You can also re-center them manually.
          </p>
          <button className={item} disabled={pending} onClick={recenterHere}>
            📍 Re-center units on my location
          </button>
          <button
            className={item}
            disabled={pending || !selected}
            onClick={() => selected && run(`Units re-centered on ${selected.code}`, () => recenterDemoUnits(selected.latitude, selected.longitude))}
          >
            🎯 Re-center units on selected incident
          </button>
          <div className="my-1 border-t border-ops-700" />
          <button
            className={item}
            disabled={pending}
            onClick={() =>
              window.confirm("Resolve open incidents and reset all units and hospital capacities?") &&
              run("Units and hospitals reset", () => resetDemo(false))
            }
          >
            ♻️ Reset units &amp; hospitals
          </button>
          <button
            className={cn(item, "text-amber-300")}
            disabled={pending}
            onClick={() =>
              window.confirm("Permanently delete ALL incidents and reset the demo? This cannot be undone.") &&
              run("Demo cleared", () => resetDemo(true))
            }
          >
            🧹 Clear all incidents &amp; reset
          </button>
          {(pending || message) && <p className="px-3 py-2 text-xs text-slate-400">{pending ? "Working…" : message}</p>}
        </div>
      )}
    </div>
  );
}
