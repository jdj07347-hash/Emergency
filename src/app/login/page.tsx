import type { Metadata } from "next";
import { connection } from "next/server";
import { listHospitals, listResponders } from "@/lib/server/queries";
import type { Hospital, Responder } from "@/lib/types";
import { LoginForm, QuickAccess } from "./login-form";

export const metadata: Metadata = { title: "Responder sign-in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection();
  const sp = await searchParams;
  const role = typeof sp.role === "string" ? sp.role : undefined;
  const id = typeof sp.id === "string" ? sp.id : undefined;
  const [responders, hospitals] = await Promise.all([listResponders(), listHospitals()]).catch((): [Responder[], Hospital[]] => [[], []]);

  return (
    <>
      <main className="flex flex-1 items-center justify-center bg-ops-950 bg-[radial-gradient(ellipse_at_top,rgb(37_99_235/0.18),transparent_60%)] px-4 py-12">
        <div className="w-full max-w-2xl">
          <div className="mb-8 text-center">
            <p className="text-xs font-semibold tracking-[0.3em] text-slate-500">SMART RESCUE</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Operations sign-in</h1>
            <p className="mt-2 text-slate-400">Responders, hospitals and the Control Center.</p>
          </div>
          <QuickAccess responders={responders} hospitals={hospitals} />
          <details className="mx-auto mt-6 max-w-md">
            <summary className="cursor-pointer text-center text-sm text-slate-500 hover:text-slate-300">Sign in with role &amp; ID instead</summary>
            <div className="mt-4">
              <LoginForm defaultRole={role} defaultId={id} />
            </div>
          </details>
        </div>
      </main>
    </>
  );
}
