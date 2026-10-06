"use server";

import { redirect } from "next/navigation";
import { addIdentity, DEMO_ROLES, identityKey, identityPath, removeIdentity, type DemoRole } from "@/lib/server/demo-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

export async function demoLogin(_prev: LoginState, form: FormData): Promise<LoginState> {
  // One-tap buttons send "ROLE-NUMBER" (or "CONTROL") instead of the role/id fields.
  const quick = String(form.get("quick") ?? "");
  if (quick) {
    const [r, n] = quick.split("-");
    form.set("role", r);
    form.set("demoId", n ?? "");
  }
  const role = String(form.get("role") ?? "") as DemoRole;
  if (!DEMO_ROLES.includes(role)) return { error: "Choose a role." };

  if (role === "CONTROL") {
    await addIdentity("CONTROL");
    redirect("/control");
  }

  const raw = String(form.get("demoId") ?? "").trim();
  if (!/^\d{1,2}$/.test(raw)) return { error: "Enter a numeric demo ID (1–3)." };
  const number = Number(raw);

  const db = supabaseAdmin();
  const { data } =
    role === "HOSPITAL"
      ? await db.from("hospitals").select("id").eq("demo_number", number).maybeSingle()
      : await db.from("responders").select("id").eq("type", role).eq("demo_number", number).maybeSingle();
  if (!data) return { error: `No account for ${role.toLowerCase()} #${number}. Try 1, 2 or 3.` };

  await addIdentity(identityKey(role, number));
  redirect(identityPath(role, number));
}

export async function demoLogout(key: string) {
  await removeIdentity(key);
  redirect("/login");
}
