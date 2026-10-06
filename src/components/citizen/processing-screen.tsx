"use client";

import { Check, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface StepState {
  label: string;
  state: "pending" | "active" | "done" | "skipped";
}

export function ProcessingScreen({
  steps,
  error,
  result,
  onRetry,
}: {
  steps: StepState[];
  error: string | null;
  result: { code: string; token: string; aiStatus: string } | null;
  onRetry: () => void;
}) {
  const aiFailed = result?.aiStatus === "FAILED";
  const done = result && !aiFailed;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <div
          className={cn(
            "mx-auto mb-5 grid size-20 place-items-center rounded-full text-3xl",
            error ? "bg-amber-100" : done ? "bg-emerald-100" : "bg-slate-900 animate-pulse-ring",
          )}
        >
          {error ? "⚠️" : done ? "✅" : "🚨"}
        </div>
        <h1 className="text-xl font-bold tracking-[0.18em] text-slate-900">
          {error ? "NOT SENT YET" : done ? "HELP IS BEING COORDINATED" : aiFailed ? "EMERGENCY RECEIVED" : "ANALYZING EMERGENCY"}
        </h1>
        {result && <p className="mt-2 font-mono text-sm text-slate-500">Emergency ID {result.code}</p>}
      </div>

      <ol className="space-y-3">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/70">
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors",
                s.state === "done" && "bg-emerald-600 text-white",
                s.state === "active" && "bg-slate-900 text-white",
                s.state === "pending" && "bg-slate-100 text-slate-400",
                s.state === "skipped" && "bg-amber-100 text-amber-700",
              )}
            >
              {s.state === "done" ? <Check className="size-4" /> : s.state === "active" ? <LoaderCircle className="size-4 animate-spin" /> : s.state === "skipped" ? "!" : "○"}
            </span>
            <span className={cn("font-medium", s.state === "pending" ? "text-slate-400" : "text-slate-800")}>{s.label}</span>
          </li>
        ))}
      </ol>

      {error && (
        <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">{error}</p>
          <p className="mt-1 text-sm">Your details are still filled in. If you are in danger, also contact local emergency services directly.</p>
          <Button className="mt-3 w-full" size="lg" onClick={onRetry}>
            Back to report
          </Button>
        </div>
      )}

      {aiFailed && result && (
        <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">AI analysis temporarily unavailable.</p>
          <p className="mt-1 text-sm">Your emergency report has been received and is waiting for manual assessment.</p>
          <Link href={`/track/${result.token}`} className={cn(buttonVariants({ size: "lg" }), "mt-3 w-full")}>
            Track your emergency
          </Link>
        </div>
      )}
    </div>
  );
}
