import { Hono } from "hono";
import { getSupabase } from "../lib/supabase.js";
import { listEventTypes } from "../lib/calcom.js";

/**
 * Admin endpoints for connecting a client's OWN Cal.com account.
 *
 * The Cal.com API key is a secret: it is written here (service-role) and is
 * NEVER returned to the browser. GET only reports whether a key is present plus
 * the (non-secret) event types it can see.
 *
 * NOTE: unauthenticated for now, matching the rest of the admin API (campaigns).
 * MUST be gated behind Supabase Auth + per-client scoping in Phase 4 before
 * clients can log in — see calendar-architecture-decision.
 */
export const clientsRoute = new Hono();

/** POST /api/clients/:id/calcom/connect  { apiKey }
 *  Validates the key by listing event types, stores it, switches the client to
 *  live ('calcom') booking, and auto-selects the event type when there's only one. */
clientsRoute.post("/:id/calcom/connect", async (c) => {
  const id = c.req.param("id");
  const { apiKey } = await c.req.json<{ apiKey?: string }>();
  if (!apiKey?.trim()) return c.json({ error: "apiKey is required" }, 400);

  const supabase = getSupabase();
  if (!supabase) return c.json({ error: "Database not configured" }, 503);

  const result = await listEventTypes(apiKey.trim());
  if (!result.ok) {
    return c.json({ error: result.error ?? "Could not validate that Cal.com API key" }, 400);
  }

  // Auto-select only when the account has exactly one event type; otherwise the
  // client must pick which one the bot books into (and embeds on their site).
  const autoSelected = result.eventTypes.length === 1 ? result.eventTypes[0].id : null;

  const { error } = await supabase
    .from("clients")
    .update({
      calcom_api_key: apiKey.trim(),
      booking_mode: "calcom",
      ...(autoSelected ? { calcom_event_type_id: autoSelected } : {}),
    })
    .eq("id", id);
  if (error) return c.json({ error: error.message }, 500);

  return c.json({ ok: true, eventTypes: result.eventTypes, selectedEventTypeId: autoSelected });
});

/** POST /api/clients/:id/calcom/event-type  { eventTypeId }  — pick the active event type. */
clientsRoute.post("/:id/calcom/event-type", async (c) => {
  const id = c.req.param("id");
  const { eventTypeId } = await c.req.json<{ eventTypeId?: string | number }>();
  if (eventTypeId == null || String(eventTypeId).trim() === "") {
    return c.json({ error: "eventTypeId is required" }, 400);
  }
  const supabase = getSupabase();
  if (!supabase) return c.json({ error: "Database not configured" }, 503);

  const { error } = await supabase
    .from("clients")
    .update({ calcom_event_type_id: String(eventTypeId) })
    .eq("id", id);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

/** GET /api/clients/:id/calcom — connection status + event types. Never returns the key. */
clientsRoute.get("/:id/calcom", async (c) => {
  const id = c.req.param("id");
  const supabase = getSupabase();
  if (!supabase) return c.json({ error: "Database not configured" }, 503);

  const { data: client } = await supabase
    .from("clients")
    .select("calcom_api_key, calcom_event_type_id, booking_mode")
    .eq("id", id)
    .maybeSingle<{ calcom_api_key: string | null; calcom_event_type_id: string | null; booking_mode: string }>();
  if (!client) return c.json({ error: "Client not found" }, 404);

  const connected = Boolean(client.calcom_api_key);
  let eventTypes: Awaited<ReturnType<typeof listEventTypes>>["eventTypes"] = [];
  let listError: string | undefined;
  if (connected && client.calcom_api_key) {
    const result = await listEventTypes(client.calcom_api_key);
    if (result.ok) eventTypes = result.eventTypes;
    else listError = result.error;
  }

  return c.json({
    connected,
    bookingMode: client.booking_mode,
    eventTypeId: client.calcom_event_type_id,
    eventTypes,
    ...(listError ? { listError } : {}),
  });
});

/** POST /api/clients/:id/calcom/disconnect — clear the connection, revert to 'capture'. */
clientsRoute.post("/:id/calcom/disconnect", async (c) => {
  const id = c.req.param("id");
  const supabase = getSupabase();
  if (!supabase) return c.json({ error: "Database not configured" }, 503);

  const { error } = await supabase
    .from("clients")
    .update({ calcom_api_key: null, calcom_event_type_id: null, booking_mode: "capture" })
    .eq("id", id);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});
