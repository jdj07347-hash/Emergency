"use client";

import { useState, useTransition } from "react";
import { submitManualAssessment } from "@/app/actions/control";
import { Button } from "@/components/ui/button";
import { CATEGORIES, CATEGORY_LABEL, SEVERITIES, type Category, type Severity } from "@/lib/constants";
import type { Incident } from "@/lib/types";

const field = "h-10 w-full rounded-lg border border-ops-600 bg-ops-800 px-3 text-sm text-white outline-none focus:border-brand-500";

/** Fallback when AI is unavailable: an operator classifies, the backend still decides priority & dispatch. */
export function ManualAssessment({ incident }: { incident: Incident }) {
  const [category, setCategory] = useState<Category>("OTHER");
  const [severity, setSeverity] = useState<Severity>("HIGH");
  const [victims, setVictims] = useState(incident.citizen_victims ?? 1);
  const [trapped, setTrapped] = useState(false);
  const [fireRisk, setFireRisk] = useState(false);
  const [lifeThreatening, setLifeThreatening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-500/5 p-4">
      <div>
        <h3 className="text-sm font-bold text-amber-300">Manual assessment required</h3>
        <p className="text-xs text-slate-400">AI analysis was unavailable. Classify the report to start dispatch.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-400">
          Category
          <select className={field} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Severity
          <select className={field} value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
            {SEVERITIES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="col-span-2 text-xs text-slate-400">
          Victims
          <input
            className={field}
            inputMode="numeric"
            value={victims}
            onChange={(e) => setVictims(Number(e.target.value.replace(/\D/g, "").slice(0, 4) || 0))}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-slate-300">
        {[
          ["Trapped", trapped, setTrapped],
          ["Fire risk", fireRisk, setFireRisk],
          ["Life-threatening", lifeThreatening, setLifeThreatening],
        ].map(([label, value, set]) => (
          <label key={label as string} className="flex items-center gap-2">
            <input type="checkbox" checked={value as boolean} onChange={(e) => (set as (v: boolean) => void)(e.target.checked)} className="size-4 accent-amber-400" />
            {label as string}
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-amber-300">{error}</p>}
      <Button
        variant="primary"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await submitManualAssessment(incident.id, { category, severity, victims, trapped, fireRisk, lifeThreatening });
            if (res.error) setError(res.error);
          })
        }
      >
        {pending ? "Dispatching…" : "Assess & dispatch"}
      </Button>
    </section>
  );
}
