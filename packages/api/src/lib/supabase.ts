import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, supabaseEnabled } from "../env.js";

/**
 * Service-role Supabase client. Bypasses RLS — server-side only, never expose to the browser.
 * Returns null when Supabase is not configured (Phase 1 in-memory fallback mode).
 */
let cached: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  cached = supabaseEnabled
    ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
  return cached;
}

export { supabaseEnabled };
