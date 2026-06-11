import type { BookingMode, ChatConfig, Client, ToolName } from "@pulse/db";
import { getSupabase } from "./supabase.js";
import { env } from "../env.js";
import { renderSystemPrompt } from "../config/systemPrompt.js";
import type { CalcomConfig } from "./calcom.js";

export interface BookingSettings {
  mode: BookingMode;
  /** Resolved Cal.com config, or null when live booking isn't available for this client. */
  calcom: CalcomConfig | null;
}

export interface ResolvedClientConfig {
  client: Client;
  greeting: string;
  systemPrompt: string;
  toolsEnabled: ToolName[];
  maxMessagesPerSession: number;
  booking: BookingSettings;
  source: "supabase" | "fallback";
}

/**
 * Resolve a client's booking settings. Live Cal.com requires booking_mode='calcom',
 * an event type, AND the client's OWN connected API key.
 *
 * We intentionally do NOT fall back to the global agency key (env.calcomApiKey)
 * here: doing so silently books a tenant's customers into the AGENCY's own Cal.com
 * calendar instead of the client's. A client that is in 'calcom' mode but hasn't
 * connected their own key is a misconfiguration — we drop to 'capture' mode (record
 * the request + notify the client) rather than book into the wrong account.
 *
 * (The demo client carries the env key on its row so local/Phase-1 demos still work.)
 */
function resolveBooking(client: Client): BookingSettings {
  if (client.booking_mode === "calcom" && client.calcom_event_type_id && client.calcom_api_key) {
    return {
      mode: "calcom",
      calcom: {
        apiKey: client.calcom_api_key,
        eventTypeId: client.calcom_event_type_id,
        timezone: client.calcom_timezone || env.calcomTimezone,
      },
    };
  }
  return { mode: "capture", calcom: null };
}

/**
 * Demo client used when Supabase is not configured (Phase 1) or when an
 * unknown clientId is requested in fallback mode. Lets the widget run end-to-end
 * before any database exists. Edit freely for local testing.
 */
const DEMO_CLIENT: Client = {
  id: "demo",
  name: "Pulse Demo Co.",
  business_type: "home services company",
  city: "Salt Lake City",
  state: "UT",
  phone: "(801) 555-0123",
  email: "hello@example.com",
  website_url: "https://example.com",
  google_review_url: "https://g.page/r/example/review",
  logo_url: null,
  accent_color: "#2563EB",
  // Demo books into the global Cal.com event type via the env key (Model B mechanics).
  // It carries the agency key directly so the demo keeps working now that
  // resolveBooking no longer falls back to env.calcomApiKey for real clients.
  booking_mode: "calcom",
  calcom_event_type_id: env.calcomEventTypeId || null,
  calcom_api_key: env.calcomApiKey || null,
  calcom_timezone: env.calcomTimezone,
  google_oauth_refresh_token: null,
  google_account_id: null,
  google_location_id: null,
  google_connected_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const DEMO_BUSINESS_INFO = {
  business_info: "Pulse Demo Co. is a family-owned home services company serving the Salt Lake City metro area since 2015.",
  services_list: "- HVAC repair & installation\n- Plumbing\n- Electrical work\n- Annual maintenance plans",
  hours: "Mon-Fri: 7am-6pm, Sat: 8am-2pm, Sun: Closed. 24/7 emergency line available.",
  pricing_info: "Service call: $89 (waived if you book a repair). Estimates are free.",
  policies: "100% satisfaction guarantee. Licensed and insured. Same-day service when booked before noon.",
  faqs: "Q: Do you offer emergency service? A: Yes, 24/7 for existing customers.\nQ: What areas do you serve? A: All of Salt Lake County.",
};

const DEMO_CONFIG: ResolvedClientConfig = {
  client: DEMO_CLIENT,
  greeting: "Hi there! 👋 I'm here to help with questions or to book a service. What can I do for you?",
  systemPrompt: renderSystemPrompt(DEMO_CLIENT, DEMO_BUSINESS_INFO),
  toolsEnabled: ["book_appointment", "get_available_slots", "transfer_to_human"],
  maxMessagesPerSession: 50,
  booking: resolveBooking(DEMO_CLIENT),
  source: "fallback",
};

/**
 * Resolve a client's chat configuration by clientId.
 * - With Supabase configured: loads the client + chat_config rows.
 *   If the stored system_prompt is non-empty it is used verbatim; otherwise the
 *   template is rendered from structured business_info.
 * - Without Supabase (or unknown id in fallback mode): returns the demo config.
 */
export async function resolveClientConfig(clientId: string): Promise<ResolvedClientConfig | null> {
  const supabase = getSupabase();
  if (!supabase) {
    return DEMO_CONFIG;
  }

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single<Client>();

  if (clientErr || !client) {
    return null;
  }

  const { data: config } = await supabase
    .from("chat_configs")
    .select("*")
    .eq("client_id", clientId)
    .single<ChatConfig>();

  if (!config || !config.is_active) {
    return null;
  }

  const systemPrompt =
    config.system_prompt && config.system_prompt.trim().length > 0
      ? config.system_prompt
      : renderSystemPrompt(client, config.business_info);

  return {
    client,
    greeting: config.greeting_message,
    systemPrompt,
    toolsEnabled: config.tools_enabled,
    maxMessagesPerSession: config.max_messages_per_session,
    booking: resolveBooking(client),
    source: "supabase",
  };
}
