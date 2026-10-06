import { Siren } from "lucide-react";
import Link from "next/link";

export default function CitizenLanding() {
  return (
    <>
      <main className="relative flex flex-1 flex-col items-center justify-between overflow-hidden px-6 pt-14 pb-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-slate-200/60 to-transparent" />

        <header className="relative text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold tracking-widest text-slate-500 shadow-sm ring-1 ring-slate-200">
            <span className="size-1.5 rounded-full bg-emerald-500" /> SYSTEM ONLINE
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">SMART RESCUE</h1>
          <p className="mt-2 text-lg text-slate-500">AI-Powered Emergency Response</p>
        </header>

        <Link
          href="/report"
          className="group relative my-12 grid size-64 place-items-center rounded-full bg-red-600 text-white shadow-2xl shadow-red-600/40 transition active:scale-95 animate-pulse-ring sm:size-72"
        >
          <span className="absolute inset-3 rounded-full ring-2 ring-white/20" />
          <span className="flex flex-col items-center gap-3">
            <Siren className="size-14" strokeWidth={1.75} />
            <span className="text-center text-2xl leading-tight font-extrabold tracking-wide">
              REPORT
              <br />
              EMERGENCY
            </span>
          </span>
        </Link>

        <footer className="relative max-w-xs text-center text-sm text-slate-500">
          <p className="font-medium text-slate-600">📍 Your location will be required.</p>
          <p className="mt-1">No account needed. Speak, snap a photo, and send.</p>
          <Link
            href="/login"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            🚒 👮 🚑 🏥 Responder &amp; staff sign-in →
          </Link>
        </footer>
      </main>
    </>
  );
}
