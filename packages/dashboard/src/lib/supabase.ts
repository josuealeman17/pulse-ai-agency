import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaced in the console if the root .env is missing Supabase values.
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (set in repo-root .env).");
}

export const supabase = createClient(url, anonKey);

export const API_URL: string = import.meta.env.VITE_API_URL || "http://localhost:8787";
export const WIDGET_URL: string = import.meta.env.VITE_WIDGET_URL || "http://localhost:5173";
