import type { Client, ReviewCampaign } from "@pulse/db";
import { getSupabase } from "./supabase.js";
import { generateToken } from "./reviewRequests.js";
import { fromWithName, sendEmail } from "./email.js";
import { renderReviewEmail, renderSubject } from "../config/reviewEmails.js";

export interface Recipient {
  name: string;
  email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse a CSV of customers. Accepts "name,email" (with or without a header row),
 * quoted fields, and is forgiving about column order (detects which column is the
 * email). Returns valid recipients + the count skipped.
 */
export function parseRecipientsCsv(csv: string): { recipients: Recipient[]; skipped: number } {
  const rows = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(splitCsvLine);

  let skipped = 0;
  const recipients: Recipient[] = [];

  for (const cols of rows) {
    // Skip a header row.
    if (cols.some((c) => /^name$/i.test(c)) && cols.some((c) => /^e-?mail$/i.test(c))) continue;

    const email = cols.find((c) => EMAIL_RE.test(c));
    if (!email) {
      skipped++;
      continue;
    }
    const name = cols.find((c) => c !== email && c.length > 0) ?? "";
    recipients.push({ name: name.replace(/^"|"$/g, ""), email: email.toLowerCase() });
  }
  return { recipients, skipped };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export async function createCampaign(
  clientId: string,
  name: string,
  satisfactionThreshold?: number,
): Promise<ReviewCampaign | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("review_campaigns")
    .insert({
      client_id: clientId,
      name,
      status: "active",
      ...(satisfactionThreshold ? { satisfaction_threshold: satisfactionThreshold } : {}),
    })
    .select("*")
    .single<ReviewCampaign>();
  if (error) {
    console.error("[campaigns] create failed:", error.message);
    return null;
  }
  return data;
}

export interface SendReport {
  added: number;
  sent: number;
  failed: number;
  skipped: number;
  /** Recipients dropped because the same email was already requested for this
   *  campaign recently (or appeared twice in the same batch). */
  deduped: number;
}

export interface AddRecipientsOptions {
  /** Skip an email already requested for this campaign within `dedupeWindowDays`.
   *  Always on for the trigger webhook so a re-fired job-done event can't double-email. */
  dedupe?: boolean;
  /** How far back to look for a prior request when deduping. Default 14 days. */
  dedupeWindowDays?: number;
}

/**
 * Create review_requests for each recipient and send the initial email.
 * firstName is derived from the recipient name for personalization.
 */
export async function addRecipientsAndSend(
  campaign: ReviewCampaign,
  client: Client,
  recipients: Recipient[],
  apiUrl: string,
  options: AddRecipientsOptions = {},
): Promise<SendReport> {
  const supabase = getSupabase();
  if (!supabase) return { added: 0, sent: 0, failed: 0, skipped: recipients.length, deduped: 0 };

  const report: SendReport = { added: 0, sent: 0, failed: 0, skipped: 0, deduped: 0 };
  const subject = renderSubject(campaign.email_subject_1, client);
  const from = fromWithName(client.name);

  // Build the set of emails already requested for this campaign in the window, so
  // a re-fired trigger (or a re-pasted list) doesn't email the same person twice.
  const dedupe = options.dedupe ?? false;
  const recentlyRequested = new Set<string>();
  if (dedupe) {
    const windowDays = options.dedupeWindowDays ?? 14;
    const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
    const emails = [...new Set(recipients.map((r) => r.email.toLowerCase()))];
    const { data: existing } = await supabase
      .from("review_requests")
      .select("customer_email")
      .eq("campaign_id", campaign.id)
      .gte("created_at", since)
      .in("customer_email", emails);
    for (const e of existing ?? []) recentlyRequested.add(e.customer_email.toLowerCase());
  }
  // Always guard against the same email appearing twice within one batch.
  const batchSeen = new Set<string>();

  for (const r of recipients) {
    if (!EMAIL_RE.test(r.email)) {
      report.skipped++;
      continue;
    }
    const emailLc = r.email.toLowerCase();
    if (batchSeen.has(emailLc) || recentlyRequested.has(emailLc)) {
      report.deduped++;
      continue;
    }
    batchSeen.add(emailLc);
    const token = generateToken();

    const { data: row, error } = await supabase
      .from("review_requests")
      .insert({
        campaign_id: campaign.id,
        client_id: client.id,
        customer_name: r.name || r.email,
        customer_email: r.email,
        token,
        status: "pending",
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !row) {
      report.failed++;
      continue;
    }
    report.added++;

    const firstName = (r.name || "").split(/\s+/)[0] ?? "";
    const sendRes = await sendEmail({
      to: r.email,
      subject,
      from,
      replyTo: client.email ?? undefined,
      html: renderReviewEmail("initial", {
        client,
        customerFirstName: firstName,
        token,
        apiUrl,
        campaignType: campaign.campaign_type,
        bodyTemplate: campaign.email_body_1,
        incentive: campaign.incentive,
      }),
    });

    if (sendRes.ok) {
      report.sent++;
      await supabase
        .from("review_requests")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", row.id);
    } else if (!sendRes.skipped) {
      report.failed++;
    }
  }
  return report;
}

export interface CampaignStats {
  campaign: ReviewCampaign;
  total: number;
  sent: number;
  clicked: number;
  reviews: number; // ratings >= threshold
  feedback: number; // ratings < threshold (private)
}

export async function getCampaignStats(campaignId: string): Promise<CampaignStats | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: campaign } = await supabase
    .from("review_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle<ReviewCampaign>();
  if (!campaign) return null;

  const { data: requests } = await supabase
    .from("review_requests")
    .select("status, stars_given")
    .eq("campaign_id", campaignId);

  const rows = requests ?? [];
  const threshold = campaign.satisfaction_threshold;
  return {
    campaign,
    total: rows.length,
    sent: rows.filter((r) => r.status !== "pending").length,
    clicked: rows.filter((r) => r.stars_given != null).length,
    reviews: rows.filter((r) => (r.stars_given ?? 0) >= threshold).length,
    feedback: rows.filter((r) => r.stars_given != null && r.stars_given < threshold).length,
  };
}
