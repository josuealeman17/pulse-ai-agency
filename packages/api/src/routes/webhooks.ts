import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import type { Client, ReviewCampaign } from "@pulse/db";
import { getSupabase } from "../lib/supabase.js";
import { baseUrl } from "../lib/baseUrl.js";
import { addRecipientsAndSend, type Recipient } from "../lib/reviewCampaigns.js";

/**
 * The trigger spine: an unauthenticated, per-campaign token-gated endpoint that a
 * client's CRM / job-management system / Google Sheet hits when a job is marked
 * "done", firing the review request automatically (no admin paste). This mirrors
 * the cron-secret pattern (cron.ts) but the secret is scoped to one campaign
 * (review_campaigns.webhook_token) — a Sheet can't mint the admin JWT the
 * /api/campaigns routes require.
 *
 * Always dedupes (a re-fired job-done event / retried Zap must not double-email).
 */
export const webhooksRoute = new Hono();

/** Constant-time token compare (avoids leaking length/match via timing). */
function tokenMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST /api/webhooks/review/:campaignId
 * Auth: `Authorization: Bearer <token>`, `x-webhook-token: <token>`, or `?token=`.
 * Body: { name, email } (single, the common job-done case),
 *       or { recipients: [{ name, email }] } (batch).
 */
webhooksRoute.post("/review/:campaignId", async (c) => {
  const campaignId = c.req.param("campaignId");
  const supabase = getSupabase();
  if (!supabase) return c.json({ error: "Database not configured" }, 503);

  const { data: campaign } = await supabase
    .from("review_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle<ReviewCampaign>();
  if (!campaign) return c.json({ error: "Campaign not found" }, 404);

  const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = (bearer ?? c.req.header("x-webhook-token") ?? c.req.query("token") ?? "").trim();
  if (!campaign.webhook_token || !tokenMatches(provided, campaign.webhook_token)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Don't fire for paused/draft/completed campaigns — the token still works, but
  // a paused campaign means "stop sending".
  if (campaign.status !== "active") {
    return c.json({ error: `Campaign is ${campaign.status}, not active` }, 409);
  }

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", campaign.client_id)
    .maybeSingle<Client>();
  if (!client) return c.json({ error: "Client not found" }, 404);

  const body = await c.req
    .json<{ name?: string; email?: string; recipients?: Recipient[] }>()
    .catch(() => ({} as { name?: string; email?: string; recipients?: Recipient[] }));

  let recipients: Recipient[] = [];
  if (Array.isArray(body.recipients)) recipients = body.recipients;
  else if (body.email) recipients = [{ name: body.name ?? "", email: body.email }];

  if (recipients.length === 0) {
    return c.json({ error: "Provide { name, email } or { recipients: [...] }" }, 400);
  }

  const report = await addRecipientsAndSend(campaign, client, recipients, baseUrl(c), { dedupe: true });
  return c.json(report);
});
