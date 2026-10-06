"use client";

import { Check, LogOut, Minus, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { demoLogout } from "@/app/actions/auth";
import { answerHospitalRequest, updateHospitalStatus } from "@/app/actions/hospital";
import { coverageOf, CoverageMeter } from "@/components/coverage";
import { LiveBadge, useRealtimeRefresh } from "@/components/realtime";
import { CategoryIcon, categoryText, SeverityBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistance } from "@/lib/geo";
import type { Hospital, HospitalRequest, IncidentBundle } from "@/lib/types";
import { cn, formatRelative, formatVictimRange } from "@/lib/utils";

const CAPACITY_HELP = "Capacity = the number of emergency patients your hospital can currently accommodate and begin treating.";

export function HospitalDashboard({ hospital, bundles, number }: { hospital: Hospital; bundles: IncidentBundle[]; number: string }) {
  const live = useRealtimeRefresh(`hospital-${hospital.id}`, [
    { table: "hospital_requests", filter: `hospital_id=eq.${hospital.id}` },
    { table: "hospitals", filter: `id=eq.${hospital.id}` },
    { table: "hospital_allocations" },
    { table: "incidents" },
  ]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const myRequest = (b: IncidentBundle) => b.hospitalRequests.find((r) => r.hospital_id === hospital.id)!;
  const open = bundles.filter((b) => ["PENDING", "ACCEPTED"].includes(myRequest(b).status));
  const done = bundles.filter((b) => !open.includes(b));

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
    });

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <header className="sticky top-0 z-[1100] border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <span className="grid size-11 place-items-center rounded-xl bg-purple-600 text-2xl">🏥</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-slate-900">{hospital.short_name.toUpperCase()}</p>
            <p className="truncate text-xs text-slate-500">{hospital.name}</p>
          </div>
          <LiveBadge status={live} />
          <form action={demoLogout.bind(null, `HOSPITAL-${hospital.demo_number}`)}>
            <Button variant="ghost" size="icon" aria-label="Sign out">
              <LogOut />
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-4xl flex-1 gap-4 px-4 py-4 md:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200">{error}</p>}

          {open.length === 0 ? (
            <Card className="px-6 py-14 text-center">
              <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-purple-50 text-3xl">🛏️</div>
              <p className="text-lg font-semibold text-slate-900">No active requests</p>
              <p className="mt-1 text-slate-500">Incoming patient requests will appear here instantly.</p>
            </Card>
          ) : (
            open.map((b) => (
              <ActiveRequest
                key={b.incident.id}
                bundle={b}
                request={myRequest(b)}
                hospital={hospital}
                pending={pending}
                onAnswer={(patients) => run(() => answerHospitalRequest(number, myRequest(b).id, patients))}
              />
            ))
          )}

          {done.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Request history</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-slate-100">
                {done.map((b) => {
                  const r = myRequest(b);
                  const alloc = b.allocations.find((a) => a.request_id === r.id);
                  const { remaining } = coverageOf(b);
                  return (
                    <div key={b.incident.id} className="flex items-center gap-3 py-3">
                      <CategoryIcon category={b.incident.category} className="text-xl" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800">
                          {b.incident.code} · {categoryText(b.incident.category)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatRelative(r.notified_at)} · system-wide remaining: {remaining}
                        </p>
                      </div>
                      {r.status === "CONFIRMED" ? (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">✓ {alloc?.patients ?? 0} allocated</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500">Declined</span>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <CapacityEditor hospital={hospital} pending={pending} onSave={(c, a) => run(() => updateHospitalStatus(number, c, a))} />
        </aside>
      </main>
    </div>
  );
}

function ActiveRequest({
  bundle,
  request,
  hospital,
  pending,
  onAnswer,
}: {
  bundle: IncidentBundle;
  request: HospitalRequest;
  hospital: Hospital;
  pending: boolean;
  onAnswer: (patients: number) => void;
}) {
  const { incident } = bundle;
  const { remaining } = coverageOf(bundle);
  const massCasualty = incident.patients_to_allocate >= 10;
  const needed = request.requested_patients;
  // Pre-fill with the beds this hospital reports free, capped at what is needed.
  const [take, setTake] = useState(() => Math.min(needed, Math.max(hospital.emergency_capacity, 0)));
  const shortfall = Math.max(0, needed - take);

  return (
    <Card className="overflow-hidden animate-fade-up">
      <div className={cn("flex items-center justify-between px-5 py-3", massCasualty ? "bg-red-600 text-white" : "bg-purple-600 text-white")}>
        <span className="text-sm font-extrabold tracking-[0.15em]">🚨 {massCasualty ? "MASS CASUALTY ALERT" : "INCOMING PATIENTS"}</span>
        <span className="font-mono text-sm font-semibold">#{incident.code}</span>
      </div>
      <div className="space-y-5 p-5">
        <div className="flex items-center gap-3">
          <CategoryIcon category={incident.category} className="text-3xl" />
          <div className="flex-1">
            <p className="text-xl font-bold text-slate-900">{categoryText(incident.category)}</p>
            <p className="text-sm text-slate-500">{formatDistance(request.distance_km)} from your hospital (straight-line)</p>
          </div>
          <SeverityBadge severity={incident.severity} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Estimated victims</p>
            <p className="mt-1 text-4xl font-black tabular-nums text-slate-900">{incident.patients_to_allocate}</p>
            <p className="text-xs text-slate-500">AI range {formatVictimRange(incident.ai_victims_min, incident.ai_victims_max)}</p>
          </div>
          <div className="rounded-2xl bg-purple-50 p-4">
            <p className="text-xs font-semibold tracking-wide text-purple-700 uppercase">Allocation needed</p>
            <p className="mt-1 text-4xl font-black tabular-nums text-purple-900">{request.status === "PENDING" ? request.requested_patients : remaining}</p>
            <p className="text-xs text-purple-700/80">patients still without a hospital</p>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="font-semibold text-slate-900">How many of these {needed} patients can your hospital take?</p>
          <p className="text-xs text-slate-500">
            Partial capacity helps. Take what you can — the remaining patients are routed to the next nearest hospital automatically.
          </p>
          <NumberStepper value={take} onChange={(n) => setTake(Math.min(needed, n))} />
          <div className="flex flex-wrap gap-2">
            {hospital.emergency_capacity > 0 && hospital.emergency_capacity < needed && (
              <Button type="button" variant="outline" size="sm" onClick={() => setTake(hospital.emergency_capacity)}>
                My free beds ({hospital.emergency_capacity})
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setTake(needed)}>
              All {needed}
            </Button>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <Button variant="outline" size="xl" disabled={pending} onClick={() => onAnswer(0)}>
              <X /> Can&apos;t take any
            </Button>
            <Button variant="success" size="xl" disabled={pending || take === 0} onClick={() => onAnswer(take)}>
              <Check /> {take === needed ? `Take all ${needed}` : `Take ${take} of ${needed}`}
            </Button>
          </div>
          {take > 0 && shortfall > 0 && (
            <p className="text-center text-xs text-slate-500">
              The other {shortfall} will be sent to the next nearest hospital.
            </p>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">System-wide allocation</p>
          <CoverageMeter bundle={bundle} />
        </div>
      </div>
    </Card>
  );
}

function CapacityEditor({ hospital, pending, onSave }: { hospital: Hospital; pending: boolean; onSave: (capacity: number, available: boolean) => void }) {
  const [capacity, setCapacity] = useState(hospital.emergency_capacity);
  const [available, setAvailable] = useState(hospital.is_available);
  const [seen, setSeen] = useState(hospital.updated_at);
  // Pick up server-side changes (e.g. after an allocation reduces capacity).
  if (seen !== hospital.updated_at) {
    setSeen(hospital.updated_at);
    setCapacity(hospital.emergency_capacity);
    setAvailable(hospital.is_available);
  }
  const dirty = capacity !== hospital.emergency_capacity || available !== hospital.is_available;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Emergency capacity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <p className="text-5xl font-black tabular-nums text-slate-900">{hospital.emergency_capacity}</p>
          <p className="text-sm text-slate-500">patients you can take now</p>
        </div>
        <NumberStepper value={capacity} onChange={setCapacity} />
        <label className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
          Accepting emergency patients
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} className="size-5 accent-emerald-600" />
        </label>
        <Button className="w-full" disabled={!dirty || pending} onClick={() => onSave(capacity, available)}>
          Update status
        </Button>
        <p className="text-xs text-slate-500">{CAPACITY_HELP}</p>
      </CardContent>
    </Card>
  );
}

function NumberStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" className="size-12" aria-label="Decrease" onClick={() => onChange(Math.max(0, value - 1))}>
        <Minus />
      </Button>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Math.min(1000, Number(e.target.value.replace(/\D/g, "") || 0)))}
        className="h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white text-center text-2xl font-bold tabular-nums outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
      />
      <Button type="button" variant="outline" size="icon" className="size-12" aria-label="Increase" onClick={() => onChange(Math.min(1000, value + 1))}>
        <Plus />
      </Button>
    </div>
  );
}
