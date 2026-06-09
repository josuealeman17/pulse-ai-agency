import { Hono, type Context } from "hono";
import type { Client, GoogleReview } from "@pulse/db";
import { getSupabase } from "../lib/supabase.js";
import { listEventTypes } from "../lib/calcom.js";
import { requireAdmin, requireAdminOrOwner } from "../lib/auth.js";
import { env, googleEnabled } from "../env.js";
import { baseUrl } from "../lib/baseUrl.js";
import {
  buildAuthUrl,
  exchangeCode,
  listAccounts,
  listLocations,
  refreshAccessToken,
  replyToReview,
  signState,
  verifyState,
} from "../lib/google.js";
import { draftReply } from "../lib/reviewResponder.js";

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
// Google Business Profile connect/status/disconnect: admin or owner. The OAuth
// CALLBACK is intentionally NOT under this guard (Google's redirect carries no JWT)
// — it lives at the static path /google/callback and authenticates via signed state.
clientsRoute.use("/:id/google", requireAdminOrOwner);
clientsRoute.use("/:id/google/*", requireAdminOrOwner);
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

  // Where the invite / set-password link returns to. Must be allowed in Supabase
  // Auth → URL Configuration → Redirect URLs. Blank → Supabase uses its Site URL.
  const redirectTo = env.publicDashboardUrl || undefined;

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
    // Existing account: can't re-invite a user that already exists, so send a
    // password-recovery email instead. It lands on the same set-password screen
    // (type=recovery), giving them a working way in even if they never set one.
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
      addr,
      redirectTo ? { redirectTo } : {},
    );
    return c.json({ ok: true, email: addr, existing: true, emailSent: !resetErr });
  }

  // Brand-new user: send the Supabase invite (lets them set a password) and link as client.
  const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    addr,
    redirectTo ? { redirectTo } : undefined,
  );
  if (inviteErr) return c.json({ error: inviteErr.message }, 400);
  const userId = invited?.user?.id;
  if (!userId) return c.json({ error: "Could not resolve the invited user" }, 500);

  const fail = await linkAsClient(userId);
  if (fail) return fail;
  return c.json({ ok: true, email: addr, existing: false, emailSent: true });
});

// ─────────────────────────────────────────────────────────────
// Google Business Profile OAuth
// ─────────────────────────────────────────────────────────────

/** The redirect URI Google calls back. Must match a value registered in the
 *  Google Cloud OAuth client. Prefers the explicit env, else the live host. */
function googleRedirectUri(c: Context): string {
  return env.googleRedirectUri || `${baseUrl(c)}/api/clients/google/callback`;
}

/** Only bounce back to a dashboard URL whose origin is in our CORS allowlist
 *  (prevents the callback being used as an open redirect). */
function allowedReturnTo(url: string): string {
  try {
    const origin = new URL(url).origin;
    const allowed = env.allowedOrigins.split(",").map((o) => o.trim());
    return allowed.includes("*") || allowed.includes(origin) ? url : "";
  } catch {
    return "";
  }
}

function withFlag(url: string, value: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("google", value);
    return u.toString();
  } catch {
    return url;
  }
}

const callbackHtml = (ok: boolean) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>Google Business Profile</title>
     <body style="font-family:-apple-system,Segoe UI,sans-serif;max-width:420px;margin:80px auto;text-align:center;color:#1f2937">
       <h1 style="font-size:20px">${ok ? "✅ Connected" : "⚠️ Connection failed"}</h1>
       <p style="color:#6b7280">${ok ? "Google Business Profile is connected. You can close this tab and return to Pulse." : "We couldn't complete the Google connection. Please try again from Pulse."}</p>
     </body>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

/** Best-effort: discover the client's single GBP account + location after consent
 *  and store them (one-location model). No-ops cleanly until Google approves API
 *  access (the list calls return empty). Safe to re-run via /google/sync-location. */
async function discoverAndStoreLocation(clientId: string, refreshToken: string): Promise<void> {
  const accessToken = await refreshAccessToken(refreshToken);
  if (!accessToken) return;
  const account = (await listAccounts(accessToken))[0];
  if (!account) return;
  const location = (await listLocations(accessToken, account.name))[0];
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase
    .from("clients")
    .update({
      google_account_id: account.name,
      // v1 location.name is "locations/456"; prefix with the account for v4 review calls.
      google_location_id: location ? `${account.name}/${location.name}` : null,
    })
    .eq("id", clientId);
}

/** POST /api/clients/:id/google/connect  { returnTo? }
 *  Returns the Google consent URL. The signed state binds the client id + the
 *  (validated) dashboard URL to bounce back to after the callback. */
clientsRoute.post("/:id/google/connect", async (c) => {
  if (!googleEnabled) {
    return c.json({ error: "Google isn't configured on the server (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)." }, 503);
  }
  const id = c.req.param("id");
  const { returnTo } = await c.req.json<{ returnTo?: string }>().catch(() => ({ returnTo: undefined }));
  const rt = returnTo ? allowedReturnTo(returnTo) : "";
  const state = signState({ cid: id, rt, exp: Date.now() + 10 * 60_000 });
  return c.json({ authUrl: buildAuthUrl(googleRedirectUri(c), state) });
});

/** GET /api/clients/google/callback?code=&state=  — Google redirects the browser
 *  here. Auth is the signed state (no JWT on a top-level redirect). Stores the
 *  refresh token, then bounces back to the dashboard. */
clientsRoute.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state") ?? "";
  const oauthError = c.req.query("error");
  const payload = verifyState(state);

  if (oauthError || !code || !payload) {
    return payload?.rt ? c.redirect(withFlag(payload.rt, "error"), 302) : callbackHtml(false);
  }

  const tokens = await exchangeCode(code, googleRedirectUri(c));
  if (!tokens?.refresh_token) {
    // No refresh token means we can't act on the account later (Google only issues
    // one on a fresh consent) — treat as a failed connection.
    return payload.rt ? c.redirect(withFlag(payload.rt, "error"), 302) : callbackHtml(false);
  }

  const supabase = getSupabase();
  if (supabase) {
    await supabase
      .from("clients")
      .update({
        google_oauth_refresh_token: tokens.refresh_token,
        google_connected_at: new Date().toISOString(),
      })
      .eq("id", payload.cid);
    // Try to resolve the business location now (best-effort; retryable later).
    try {
      await discoverAndStoreLocation(payload.cid, tokens.refresh_token);
    } catch (e) {
      console.error("[google] location discovery failed (retry via sync-location):", e);
    }
  }

  return payload.rt ? c.redirect(withFlag(payload.rt, "connected"), 302) : callbackHtml(true);
});

/** GET /api/clients/:id/google/status — connection state. Never returns the token. */
clientsRoute.get("/:id/google/status", async (c) => {
  const id = c.req.param("id");
  const supabase = getSupabase();
  if (!supabase) return c.json({ error: "Database not configured" }, 503);

  const { data } = await supabase
    .from("clients")
    .select("google_oauth_refresh_token, google_account_id, google_location_id, google_connected_at")
    .eq("id", id)
    .maybeSingle<{
      google_oauth_refresh_token: string | null;
      google_account_id: string | null;
      google_location_id: string | null;
      google_connected_at: string | null;
    }>();
  if (!data) return c.json({ error: "Client not found" }, 404);

  return c.json({
    configured: googleEnabled,
    connected: Boolean(data.google_oauth_refresh_token),
    connectedAt: data.google_connected_at,
    accountId: data.google_account_id,
    locationId: data.google_location_id,
  });
});

/** POST /api/clients/:id/google/disconnect — clear the stored grant. */
clientsRoute.post("/:id/google/disconnect", async (c) => {
  const id = c.req.param("id");
  const supabase = getSupabase();
  if (!supabase) return c.json({ error: "Database not configured" }, 503);

  const { error } = await supabase
    .from("clients")
    .update({
      google_oauth_refresh_token: null,
      google_account_id: null,
      google_location_id: null,
      google_connected_at: null,
    })
    .eq("id", id);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

/** POST /api/clients/:id/google/sync-location — (re)discover the account + location.
 *  Useful after Google approves API access (discovery on connect would have no-op'd). */
clientsRoute.post("/:id/google/sync-location", async (c) => {
  const id = c.req.param("id");
  const supabase = getSupabase();
  if (!supabase) return c.json({ error: "Database not configured" }, 503);

  const { data } = await supabase
    .from("clients")
    .select("google_oauth_refresh_token")
    .eq("id", id)
    .maybeSingle<{ google_oauth_refresh_token: string | null }>();
  if (!data?.google_oauth_refresh_token) return c.json({ error: "Not connected to Google" }, 400);

  await discoverAndStoreLocation(id, data.google_oauth_refresh_token);

  const { data: after } = await supabase
    .from("clients")
    .select("google_account_id, google_location_id")
    .eq("id", id)
    .maybeSingle<{ google_account_id: string | null; google_location_id: string | null }>();
  return c.json({ ok: true, accountId: after?.google_account_id ?? null, locationId: after?.google_location_id ?? null });
});

/** GET /api/clients/:id/google/reviews — stored reviews + our reply state. */
clientsRoute.get("/:id/google/reviews", async (c) => {
  const id = c.req.param("id");
  const supabase = getSupabase();
  if (!supabase) return c.json({ error: "Database not configured" }, 503);
  const { data } = await supabase
    .from("google_reviews")
    .select("*")
    .eq("client_id", id)
    .order("review_created_at", { ascending: false, nullsFirst: false });
  return c.json({ reviews: data ?? [] });
});

/** Load a client + one of its stored reviews, shared by the reply/skip/regenerate routes. */
async function loadReviewContext(
  c: Context,
): Promise<{ client: Client; review: GoogleReview } | { error: Response }> {
  const id = c.req.param("id");
  const reviewRowId = c.req.param("reviewId");
  const supabase = getSupabase();
  if (!supabase) return { error: c.json({ error: "Database not configured" }, 503) };

  const { data: client } = await supabase.from("clients").select("*").eq("id", id).maybeSingle<Client>();
  if (!client) return { error: c.json({ error: "Client not found" }, 404) };
  const { data: review } = await supabase
    .from("google_reviews")
    .select("*")
    .eq("id", reviewRowId)
    .eq("client_id", id)
    .maybeSingle<GoogleReview>();
  if (!review) return { error: c.json({ error: "Review not found" }, 404) };
  return { client, review };
}

/** POST /api/clients/:id/google/reviews/:reviewId/reply  { text }
 *  Post an (approved/edited) reply to Google and mark it posted. */
clientsRoute.post("/:id/google/reviews/:reviewId/reply", async (c) => {
  const { text } = await c.req.json<{ text?: string }>().catch(() => ({ text: undefined }));
  if (!text?.trim()) return c.json({ error: "Reply text is required" }, 400);

  const ctx = await loadReviewContext(c);
  if ("error" in ctx) return ctx.error;
  const { client, review } = ctx;

  if (!client.google_oauth_refresh_token || !client.google_location_id) {
    return c.json({ error: "Client isn't connected to Google" }, 400);
  }
  const accessToken = await refreshAccessToken(client.google_oauth_refresh_token);
  if (!accessToken) return c.json({ error: "Could not authenticate with Google" }, 502);

  const ok = await replyToReview(accessToken, client.google_location_id, review.google_review_id, text.trim());
  if (!ok) return c.json({ error: "Google rejected the reply" }, 502);

  const supabase = getSupabase()!;
  await supabase
    .from("google_reviews")
    .update({
      reply_text: text.trim(),
      reply_status: "posted",
      reply_posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", review.id);
  return c.json({ ok: true });
});

/** POST /api/clients/:id/google/reviews/:reviewId/skip — don't reply to this one. */
clientsRoute.post("/:id/google/reviews/:reviewId/skip", async (c) => {
  const ctx = await loadReviewContext(c);
  if ("error" in ctx) return ctx.error;
  const supabase = getSupabase()!;
  await supabase
    .from("google_reviews")
    .update({ reply_status: "skipped", updated_at: new Date().toISOString() })
    .eq("id", ctx.review.id);
  return c.json({ ok: true });
});

/** POST /api/clients/:id/google/reviews/:reviewId/regenerate — re-draft (no posting). */
clientsRoute.post("/:id/google/reviews/:reviewId/regenerate", async (c) => {
  const ctx = await loadReviewContext(c);
  if ("error" in ctx) return ctx.error;
  const { client, review } = ctx;

  const draft = await draftReply(client, {
    reviewerName: review.reviewer_name,
    stars: review.star_rating,
    comment: review.comment,
  });
  if (!draft) return c.json({ error: "Could not generate a draft" }, 502);

  const supabase = getSupabase()!;
  await supabase
    .from("google_reviews")
    .update({ reply_text: draft, reply_status: "pending_approval", updated_at: new Date().toISOString() })
    .eq("id", review.id);
  return c.json({ ok: true, text: draft });
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
