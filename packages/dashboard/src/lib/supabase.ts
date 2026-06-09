import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaced in the console if the root .env is missing Supabase values.
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (set in repo-root .env).");
}

export const supabase = createClient(url, anonKey);

/**
 * When a user arrives from a Supabase invite or password-recovery email, the link
 * carries `type=invite` / `type=recovery` in the URL hash. supabase-js consumes
 * (and clears) that hash on init, so we read it ONCE at module load — before any
 * auth call runs — to know we must show the "set a password" screen.
 */
export const authCallbackType: "invite" | "recovery" | null = (() => {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  const type = new URLSearchParams(raw).get("type");
  return type === "invite" || type === "recovery" ? type : null;
})();

export const API_URL: string = import.meta.env.VITE_API_URL || "http://localhost:8787";
export const WIDGET_URL: string = import.meta.env.VITE_WIDGET_URL || "http://localhost:5173";
