import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

// Load .env from the repo root (two levels up from packages/api).
loadDotenv({ path: resolve(process.cwd(), "../../.env") });
// Also try local .env (in case the process runs from packages/api).
loadDotenv();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  // Anthropic — required for chat to function.
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  anthropicModel: optional("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),

  // Supabase — optional in Phase 1. When absent, the API uses an in-memory default config.
  supabaseUrl: optional("SUPABASE_URL"),
  supabaseAnonKey: optional("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),

  // Cal.com (appointment booking) — Phase 2. Falls back to stub when unset.
  calcomApiKey: optional("CALCOM_API_KEY"),
  calcomBaseUrl: optional("CALCOM_BASE_URL", "https://api.cal.com/v2"),
  // Default event type ID used for booking (single-event-type model for launch).
  calcomEventTypeId: optional("CALCOM_EVENT_TYPE_ID"),
  calcomTimezone: optional("CALCOM_TIMEZONE", "America/Denver"),
  // Cal.com API v2 versions its endpoints via this header.
  calcomSlotsVersion: optional("CALCOM_SLOTS_VERSION", "2024-09-04"),
  calcomBookingsVersion: optional("CALCOM_BOOKINGS_VERSION", "2024-08-13"),

  // Resend (transactional email) — used for transfer notifications now, reviews in Phase 3.
  resendApiKey: optional("RESEND_API_KEY"),
  resendFrom: optional("RESEND_FROM", "Pulse <onboarding@resend.dev>"),

  // Server
  port: Number(optional("PORT", "8787")),
  allowedOrigins: optional("ALLOWED_ORIGINS", "*"),
  // Optional shared secret to protect the follow-up cron endpoint.
  cronSecret: optional("CRON_SECRET"),

  // Public URLs
  publicApiUrl: optional("PUBLIC_API_URL", "http://localhost:8787"),
  publicWidgetUrl: optional("PUBLIC_WIDGET_URL", "http://localhost:5173"),
} as const;

export const supabaseEnabled = Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
/** Cal.com is live only when both an API key and a default event type are configured. */
export const calcomEnabled = Boolean(env.calcomApiKey && env.calcomEventTypeId);
export const resendEnabled = Boolean(env.resendApiKey);
