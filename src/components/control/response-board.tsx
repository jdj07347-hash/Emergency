"use client";

import { coverageOf, CoverageMeter } from "@/components/coverage";
import { UnitStatusChip } from "@/components/status";
import { Timeline } from "@/components/timeline";
import { Panel, PanelHeader } from "@/components/ui/card";
import { RESPONDER_TYPE_ICON } from "@/lib/constants";
import { EtaText } from "@/components/eta";
import type { IncidentBundle, Responder } from "@/lib/types";

/** Bottom strip: response status, hospital allocation and live timeline for the selected incident. */
export function ResponseBoard({ bundle, responders }: { bundle: IncidentBundle | null; responders: Responder[] }) {
  const assignments = bundle?.assignments.filter((a) => a.status !== "REJECTED") ?? [];
  const declined = bundle?.assignments.filter((a) => a.status === "REJECTED") ?? [];
  const engaged = new Set(bundle?.assignments.map((a) => a.responder_id));
  const idle = responders.filter((r) => !engaged.has(r.id));

  return (
    <div className="grid min-h-0 gap-3 md:grid-cols-[1.15fr_0.85fr_1.2fr]">
      <Panel className="flex min-h-0 flex-col">
        <PanelHeader>Response status</PanelHeader>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {assignments.length === 0 && <p className="py-3 text-center text-sm text-slate-500">No units dispatched for this incident.</p>}
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-ops-800">
              <span className="text-lg">{RESPONDER_TYPE_ICON[a.responder_type]}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">{a.responder.name}</span>
              <UnitStatusChip status={a.status} tone="dark" />
              <EtaText assignment={a} className="text-right text-xs text-slate-400 tabular-nums" />
            </div>
          ))}
          {declined.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-2 py-1 opacity-60">
              <span className="text-lg grayscale">{RESPONDER_TYPE_ICON[a.responder_type]}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-400 line-through">{a.responder.name}</span>
              <UnitStatusChip status="REJECTED" tone="dark" />
            </div>
          ))}
          {idle.length > 0 && (
            <div className="mt-3 border-t border-ops-700 pt-2">
              <p className="mb-1 px-2 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Other units</p>
              <div className="flex flex-wrap gap-1.5 px-2">
                {idle.map((r) => (
                  <span key={r.id} className="inline-flex items-center gap-1 rounded-md bg-ops-800 px-2 py-0.5 text-[11px] text-slate-400" title={r.status}>
                    {RESPONDER_TYPE_ICON[r.type]} {r.callsign}
                    <span className={r.status === "AVAILABLE" ? "text-emerald-400" : r.status === "BUSY" ? "text-slate-500" : "text-sky-400"}>●</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col">
        <PanelHeader>
          <span>Hospital allocation</span>
          {bundle?.incident.hospital_required && (
            <span className="text-slate-300 normal-case">{coverageOf(bundle).remaining} remaining</span>
          )}
        </PanelHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {bundle ? <CoverageMeter bundle={bundle} tone="dark" /> : <p className="text-sm text-slate-500">Select an incident.</p>}
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col">
        <PanelHeader>
          <span>Incident timeline</span>
          {bundle && <span className="font-mono text-slate-300">{bundle.incident.code}</span>}
        </PanelHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {bundle ? <Timeline events={bundle.events} tone="dark" newestFirst /> : <p className="text-sm text-slate-500">Select an incident.</p>}
        </div>
      </Panel>
    </div>
  );
}
