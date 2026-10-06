"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browser: SupabaseClient | null | undefined;

/** Anon-key client for Realtime subscriptions and signed uploads. Returns null if unconfigured. */
export function supabaseBrowser(): SupabaseClient | null {
  if (browser !== undefined) return browser;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  browser = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return browser;
}
