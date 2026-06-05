import { Hono } from "hono";
import type { Client } from "@pulse/db";
import { getSupabase } from "../lib/supabase.js";
import {
  addRecipientsAndSend,
  createCampaign,
  getCampaignStats,
  parseRecipientsCsv,
  type Recipient,
} from "../lib/reviewCampaigns.js";

/**
 * Admin endpoints for review campaigns. NOTE: these are unauthenticated for now —
 * Phase 4 (dashboard + Supabase Auth) will gate them. Do not expose publicly until then.
 */
export const campaignsRoute = new Hono();

async function loadClient(clientId: string): Promise<Client | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle<Client>();
  return data ?? null;
}

/** POST /api/campaigns  { clientId, name, satisfactionThreshold? } */
campaignsRoute.post("/", async (c) => {
  const { clientId, name, satisfactionThreshold } = await c.req.json<{
    clientId?: string;
    name?: string;
    satisfactionThreshold?: number;
  }>();
  if (!clientId || !name) return c.json({ error: "clientId and name are required" }, 400);

  const client = await loadClient(clientId);
  if (!client) return c.json({ error: "Unknown client" }, 404);

  const campaign = await createCampaign(clientId, name, satisfactionThreshold);
  if (!campaign) return c.json({ error: "Could not create campaign" }, 500);
  return c.json({ campaign }, 201);
});

/** GET /api/campaigns?clientId=...  — list campaigns for a client */
campaignsRoute.get("/", async (c) => {
  const clientId = c.req.query("clientId");
  if (!clientId) return c.json({ error: "clientId is required" }, 400);
  const supabase = getSupabase();
  if (!supabase) return c.json({ error: "Database not configured" }, 503);
  const { data } = await supabase
    .from("review_campaigns")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  return c.json({ campaigns: data ?? [] });
});

/** GET /api/campaigns/:id  — stats */
campaignsRoute.get("/:id", async (c) => {
  const stats = await getCampaignStats(c.req.param("id"));
  if (!stats) return c.json({ error: "Campaign not found" }, 404);
  return c.json(stats);
});

/**
 * POST /api/campaigns/:id/recipients — add customers and fire the initial email.
 * Body is either { csv: "name,email\n..." } or { recipients: [{name,email}] }.
 */
campaignsRoute.post("/:id/recipients", async (c) => {
  const campaignId = c.req.param("id");
  const supabase = getSupabase();
  if (!supabase) return c.json({ error: "Database not configured" }, 503);

  const { data: campaign } = await supabase
    .from("review_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return c.json({ error: "Campaign not found" }, 404);

  const client = await loadClient(campaign.client_id);
  if (!client) return c.json({ error: "Client not found" }, 404);

  const body = await c.req.json<{ csv?: string; recipients?: Recipient[] }>();
  let recipients: Recipient[] = [];
  let skipped = 0;

  if (typeof body.csv === "string") {
    const parsed = parseRecipientsCsv(body.csv);
    recipients = parsed.recipients;
    skipped = parsed.skipped;
  } else if (Array.isArray(body.recipients)) {
    recipients = body.recipients;
  } else {
    return c.json({ error: "Provide `csv` or `recipients`" }, 400);
  }

  if (recipients.length === 0) {
    return c.json({ error: "No valid recipients found", skipped }, 400);
  }

  const report = await addRecipientsAndSend(campaign, client, recipients);
  return c.json({ ...report, skipped: report.skipped + skipped });
});
