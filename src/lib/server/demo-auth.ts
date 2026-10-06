import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { RESPONDER_TYPES, type ResponderType } from "../constants";
import { supabaseAdmin } from "../supabase/server";
import type { Hospital, Responder } from "../types";

/*
 * DEMO MODE authentication.
 * A "sign-in" is just a role + demo number, remembered in a cookie so the
 * presenter can hold several identities in different tabs of one browser.
 * This is intentionally NOT real authentication.
 */

const COOKIE = "sr_demo_ids";

export type DemoRole = ResponderType | "HOSPITAL" | "CONTROL";
export const DEMO_ROLES: DemoRole[] = [...RESPONDER_TYPES, "HOSPITAL", "CONTROL"];

export function identityKey(role: DemoRole, number?: number) {
  return role === "CONTROL" ? "CONTROL" : `${role}-${number}`;
}

export function identityPath(role: DemoRole, number?: number) {
  if (role === "CONTROL") return "/control";
  if (role === "HOSPITAL") return `/hospital/${number}`;
  return `/responder/${role.toLowerCase()}/${number}`;
}

async function readIdentities(): Promise<string[]> {
  const raw = (await cookies()).get(COOKIE)?.value ?? "";
  return raw.split(",").filter((s) => /^(CONTROL|(FIRE|POLICE|AMBULANCE|HOSPITAL)-\d{1,2})$/.test(s));
}

export async function addIdentity(key: string) {
  const ids = new Set(await readIdentities());
  ids.add(key);
  (await cookies()).set(COOKIE, [...ids].join(","), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function removeIdentity(key: string) {
  const ids = (await readIdentities()).filter((k) => k !== key);
  (await cookies()).set(COOKIE, ids.join(","), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
}

function parseNumber(raw: string): number {
  if (!/^\d{1,2}$/.test(raw)) notFound();
  return Number(raw);
}

/** Role guard for responder pages and actions. */
export async function requireResponder(typeSlug: string, numberRaw: string): Promise<Responder> {
  const type = typeSlug.toUpperCase() as ResponderType;
  if (!RESPONDER_TYPES.includes(type)) notFound();
  const number = parseNumber(numberRaw);
  if (!(await readIdentities()).includes(identityKey(type, number))) {
    redirect(`/login?role=${type}&id=${number}`);
  }
  const { data } = await supabaseAdmin()
    .from("responders")
    .select("*")
    .eq("type", type)
    .eq("demo_number", number)
    .maybeSingle<Responder>();
  if (!data) notFound();
  return data;
}

/** Role guard for hospital pages and actions. */
export async function requireHospital(numberRaw: string): Promise<Hospital> {
  const number = parseNumber(numberRaw);
  if (!(await readIdentities()).includes(identityKey("HOSPITAL", number))) {
    redirect(`/login?role=HOSPITAL&id=${number}`);
  }
  const { data } = await supabaseAdmin().from("hospitals").select("*").eq("demo_number", number).maybeSingle<Hospital>();
  if (!data) notFound();
  return data;
}

/** Role guard for the Control Center. */
export async function requireControl() {
  if (!(await readIdentities()).includes("CONTROL")) redirect("/login?role=CONTROL");
}
