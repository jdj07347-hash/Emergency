import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-4xl">🧭</p>
      <h1 className="mt-4 text-xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-500">That page or account doesn&apos;t exist.</p>
      <div className="mt-6 flex gap-4 font-semibold">
        <Link href="/" className="text-brand-600">
          Report an emergency
        </Link>
        <Link href="/login" className="text-slate-600">
          Staff sign-in
        </Link>
      </div>
    </main>
  );
}
