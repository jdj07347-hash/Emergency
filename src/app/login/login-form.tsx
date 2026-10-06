"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { demoLogin, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import type { Hospital, Responder } from "@/lib/types";

const ROLES = [
  { value: "FIRE", label: "🚒 Fire Responder" },
  { value: "POLICE", label: "👮 Police Responder" },
  { value: "AMBULANCE", label: "🚑 Ambulance Responder" },
  { value: "HOSPITAL", label: "🏥 Hospital" },
  { value: "CONTROL", label: "🖥️ Control Center" },
];

export function LoginForm({ defaultRole, defaultId }: { defaultRole?: string; defaultId?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(demoLogin, {});
  const [role, setRole] = useState(ROLES.some((r) => r.value === defaultRole) ? defaultRole! : "FIRE");

  return (
    <form action={action} className="space-y-5 rounded-3xl border border-ops-700 bg-ops-900 p-6 shadow-2xl shadow-black/40">
      <div>
        <Label htmlFor="role" className="text-slate-300">
          Role
        </Label>
        <Select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value)} className="border-ops-600 bg-ops-800 text-white">
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </div>

      {role !== "CONTROL" && (
        <div>
          <Label htmlFor="demoId" className="text-slate-300">
            {role === "HOSPITAL" ? "Hospital" : "Responder"} ID
          </Label>
          <Input
            id="demoId"
            name="demoId"
            inputMode="numeric"
            pattern="\d{1,2}"
            defaultValue={defaultId ?? "1"}
            required
            className="border-ops-600 bg-ops-800 text-lg font-semibold text-white"
          />
          <p className="mt-2 text-xs text-slate-500">IDs: 1, 2 or 3</p>
        </div>
      )}

      {state.error && <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300">{state.error}</p>}

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
        Enter
      </Button>
    </form>
  );
}

const QUICK_GROUPS = [
  { type: "AMBULANCE", title: "🚑 Ambulance" },
  { type: "FIRE", title: "🚒 Fire" },
  { type: "POLICE", title: "👮 Police" },
] as const;

/** One-tap sign-in for every demo unit, hospital and the Control Center. */
export function QuickAccess({ responders, hospitals }: { responders: Responder[]; hospitals: Hospital[] }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(demoLogin, {});
  const tile =
    "w-full rounded-xl border border-ops-700 bg-ops-800 px-3 py-2.5 text-left transition hover:border-brand-500 hover:bg-ops-700 disabled:opacity-50";

  return (
    <form action={action} className="space-y-4 rounded-3xl border border-ops-700 bg-ops-900 p-5 shadow-2xl shadow-black/40">
      <button type="submit" name="quick" value="CONTROL" disabled={pending} className={`${tile} flex items-center gap-3`}>
        <span className="text-2xl">🖥️</span>
        <span>
          <span className="block font-semibold text-white">Control Center</span>
          <span className="block text-xs text-slate-400">Live map of every incident, unit and hospital</span>
        </span>
      </button>

      <div className="grid gap-4 sm:grid-cols-3">
        {QUICK_GROUPS.map((g) => (
          <div key={g.type} className="space-y-2">
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">{g.title}</p>
            {responders
              .filter((r) => r.type === g.type)
              .map((r) => (
                <button key={r.id} type="submit" name="quick" value={`${r.type}-${r.demo_number}`} disabled={pending} className={tile}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-white">{r.callsign}</span>
                    <span
                      className={`size-2 shrink-0 rounded-full ${r.status === "AVAILABLE" ? "bg-emerald-400" : r.status === "BUSY" ? "bg-slate-500" : "bg-sky-400"}`}
                      title={r.status}
                    />
                  </span>
                  <span className="block truncate text-xs text-slate-400">{r.station}</span>
                </button>
              ))}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">🏥 Hospitals</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {hospitals.map((h) => (
            <button key={h.id} type="submit" name="quick" value={`HOSPITAL-${h.demo_number}`} disabled={pending} className={tile}>
              <span className="block font-semibold text-white">{h.short_name}</span>
              <span className="block truncate text-xs text-slate-400">{h.name.replace(`${h.short_name} · `, "")}</span>
            </button>
          ))}
        </div>
      </div>

      {pending && (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-400">
          <LoaderCircle className="size-4 animate-spin" /> Signing in…
        </p>
      )}
      {state.error && <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300">{state.error}</p>}
      <p className="text-center text-xs text-slate-500">Tap any unit to open its dashboard.</p>
    </form>
  );
}
