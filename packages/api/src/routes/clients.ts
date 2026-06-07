import { Hono } from "hono";
import { getSupabase } from "../lib/supabase.js";
import { listEventTypes } from "../lib/calcom.js";
import { requireAdmin, requireAdminOrOwner } from "../lib/auth.js";

/**
 * Admin endpoints for connecting a client's OWN Cal.com account.
 *
 * The Cal.com API key is a secret: it is written here (service-role) and is
 * NEVER returned to the browser. GET only reports whether a key is present plus
 * the (non-secret) event types it can see.
 *
 * Gated by JWT middleware below: Cal.com endpoints allow an admin OR the owning
 * client (self-service); inviting a login is admin-only. The service-role client
 * bypasses RLS, so this middleware is what protects these endpoints.
 */
export const clientsRoute = new Hono();

// Cal.com connection: admin, or the business owner managing their own account.
clientsRoute.use("/:id/calcom", requireAdminOrOwner);
clientsRoute.use("/:id/calcom/*", requireAdminOrOwner);
// Inviting a client login is admin-only.
clientsRoute.use("/:id/invite", requireAdmin);

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

/** POST /api/clients/:id/invite  { email }
 *  Create (or find) a Supabase auth user and link it to this client as a
 *  role='client' user, so the business owner can log into a scoped dashboard.
 *  Sends a Supabase invite email so they set their own password. Admin-only in
 *  practice — see the auth-gating note above. */
clientsRoute.post("/:id/invite", async (c) => {
  const id = c.req.param("id");
  const { email } = await c.req.json<{ email?: string }>();
  const addr = email?.trim().toLowerCase();
  if (!addr) return c.json({ error: "email is required" }, 400);

  const supabase = getSupabase();
  if (!supabase) return c.json({ error: "Database not configured" }, 503);

  const { data: client } = await supabase.from("clients").select("id").eq("id", id).maybeSingle();
  if (!client) return c.json({ error: "Client not found" }, 404);

  // Look up any existing auth user FIRST, so we never clobber an admin or another
  // business's client by blindly upserting a role (that once demoted the only admin).
  const { data: list } = await supabase.auth.admin.listUsers();
  const users = (list?.users ?? []) as Array<{ id: string; email?: string | null }>;
  const existingUser = users.find((u) => u.email?.toLowerCase() === addr);

  async function linkAsClient(userId: string): Promise<Response | null> {
    const { error: roleErr } = await supabase!
      .from("admin_users")
      .upsert({ id: userId, role: "client", client_id: id }, { onConflict: "id" });
    return roleErr ? c.json({ error: roleErr.message }, 500) : null;
  }

  if (existingUser) {
    const { data: role } = await supabase
      .from("admin_users")
      .select("role, client_id")
      .eq("id", existingUser.id)
      .maybeSingle<{ role: string; client_id: string | null }>();

    // Guardrails: don't demote an admin, and don't steal a client from another business.
    if (role?.role === "admin") {
      return c.json({ error: "That email is an admin account — refusing to convert it into a client login." }, 409);
    }
    if (role?.role === "client" && role.client_id && role.client_id !== id) {
      return c.json({ error: "That email is already a client login for a different business." }, 409);
    }

    const fail = await linkAsClient(existingUser.id);
    if (fail) return fail;
    // Existing account: no invite email is sent — they keep their current password
    // (or use "forgot password"). Surfaced via `existing` so the UI can say so.
    return c.json({ ok: true, email: addr, existing: true });
  }

  // Brand-new user: send the Supabase invite (lets them set a password) and link as client.
  const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(addr);
  if (inviteErr) return c.json({ error: inviteErr.message }, 400);
  const userId = invited?.user?.id;
  if (!userId) return c.json({ error: "Could not resolve the invited user" }, 500);

  const fail = await linkAsClient(userId);
  if (fail) return fail;
  return c.json({ ok: true, email: addr, existing: false });
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
