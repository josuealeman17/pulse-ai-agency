/**
 * Seed a real client into Supabase (clients + chat_config).
 * Run once Supabase env vars are set:  npx tsx packages/api/src/seed.ts
 *
 * Edit CLIENT below with the real business details. Re-running updates the same
 * client (matched by name). Prints the client id to paste into the widget embed
 * as data-client-id.
 *
 * This is a stopgap until the Phase 4 admin dashboard does this via UI.
 */
import { getSupabase } from "./lib/supabase.js";
import { renderSystemPrompt } from "./config/systemPrompt.js";
import type { BusinessInfo, Client } from "@pulse/db";

// ── EDIT THIS ────────────────────────────────────────────────────────────────
const CLIENT = {
  name: "Beehive Auto Spa",
  business_type: "auto detailing shop",
  city: "Salt Lake City",
  state: "UT",
  phone: "(801) 555-0188",
  email: "eljossam@hotmail.com", // where transfer/booking notices go
  website_url: "https://beehiveautospa.example.com",
  google_review_url: "https://g.page/r/beehive-auto-spa/review", // used by the review engine (Phase 3)
  logo_url: null as string | null,
  accent_color: "#0EA5E9",

  // Booking: each client connects their OWN Cal.com account. Live booking requires
  // the client's own calcom_api_key + an event type on THAT account. Leave these
  // null here and have the client connect via the dashboard (POST /calcom/connect),
  // OR paste the client's own key + event type id below. A null api key no longer
  // falls back to the global agency key — it means 'capture' mode (record + notify).
  booking_mode: "capture" as const,
  calcom_event_type_id: null as string | null,
  calcom_api_key: null as string | null,
  calcom_timezone: "America/Denver",
};

const BUSINESS_INFO: BusinessInfo = {
  business_info:
    "Beehive Auto Spa is a premium auto detailing shop in Salt Lake City, family-owned since 2018. We make your car look showroom-new, inside and out.",
  services_list:
    "- Express Wash & Wax ($45)\n- Full Interior Detail ($150)\n- Exterior Paint Correction ($300)\n- Ceramic Coating ($800)\n- The Works (full interior + exterior, $250)",
  hours: "Mon-Fri: 8am-6pm, Sat: 9am-4pm, Sun: Closed.",
  pricing_info:
    "Express Wash & Wax $45 · Full Interior Detail $150 · Paint Correction from $300 · Ceramic Coating from $800 · The Works $250. Free estimates.",
  policies:
    "Appointments recommended; walk-ins welcome when slots are open. 100% satisfaction guarantee — if you're not happy, we re-detail free. We come to you for an extra $25 mobile fee within 15 miles.",
  faqs:
    "Q: How long does a full detail take? A: Usually 2-3 hours.\nQ: Do you offer mobile service? A: Yes, within 15 miles for a $25 fee.\nQ: What payment do you take? A: Cash, card, and Apple Pay.",
};

const GREETING =
  "Hi! 👋 Welcome to Beehive Auto Spa. I can answer questions about our detailing services or book you an appointment — what can I do for you?";
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const supabase = getSupabase();
  if (!supabase) {
    console.error("Supabase is not configured. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.");
    process.exit(1);
  }

  // Upsert the client (match by name).
  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("name", CLIENT.name)
    .maybeSingle<{ id: string }>();

  let clientId: string;
  if (existing) {
    const { error } = await supabase.from("clients").update(CLIENT).eq("id", existing.id);
    if (error) throw error;
    clientId = existing.id;
    console.log(`Updated existing client "${CLIENT.name}" (${clientId})`);
  } else {
    const { data, error } = await supabase
      .from("clients")
      .insert(CLIENT)
      .select("*")
      .single<Client>();
    if (error) throw error;
    clientId = data.id;
    console.log(`Created client "${CLIENT.name}" (${clientId})`);
  }

  // Render the system prompt from the structured business info + client fields.
  const clientRow = { ...CLIENT, id: clientId } as unknown as Client;
  const systemPrompt = renderSystemPrompt(clientRow, BUSINESS_INFO);

  const chatConfig = {
    client_id: clientId,
    system_prompt: systemPrompt,
    greeting_message: GREETING,
    business_info: BUSINESS_INFO,
    is_active: true,
  };

  const { error: cfgErr } = await supabase
    .from("chat_configs")
    .upsert(chatConfig, { onConflict: "client_id" });
  if (cfgErr) throw cfgErr;

  console.log("Chat config saved.");
  console.log(`\n  Embed this client's widget with:  data-client-id="${clientId}"\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
