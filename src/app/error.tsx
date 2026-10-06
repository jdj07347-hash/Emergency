"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const config = /not configured/i.test(error.message);
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-4xl">⚠️</p>
      <h1 className="mt-4 text-xl font-bold text-slate-900">{config ? "Setup incomplete" : "Something went wrong"}</h1>
      <p className="mt-2 text-slate-500">
        {config
          ? "The database connection is not configured. Add the Supabase environment variables and restart."
          : "We couldn't load this page. The system may be temporarily unavailable."}
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className="inline-flex h-11 items-center px-4 font-semibold text-slate-600">
          Home
        </Link>
      </div>
      {error.digest && <p className="mt-6 font-mono text-xs text-slate-400">ref {error.digest}</p>}
    </main>
  );
}
