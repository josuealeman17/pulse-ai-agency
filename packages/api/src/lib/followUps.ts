import type { Client, ReviewCampaign, ReviewRequest } from "@pulse/db";
import { getSupabase } from "./supabase.js";
import { fromWithName, sendEmail } from "./email.js";
import { renderReviewEmail, renderSubject, type ReviewEmailStep } from "../config/reviewEmails.js";

/** Whether `sent_at` is at least `delayHours` in the past relative to `now`. */
function due(sentAt: string | null, delayHours: number, now: number): boolean {
  if (!sentAt) return false;
  return now - new Date(sentAt).getTime() >= delayHours * 3600 * 1000;
}

export interface FollowUpReport {
  reminders_sent: number;
  finals_sent: number;
  errors: number;
}

type JoinedRequest = ReviewRequest & {
  review_campaigns: ReviewCampaign;
  clients: Client;
};

/**
 * Send follow-ups for un-clicked review requests (PRD §5.5). Idempotent — driven
 * by the reminder_*_sent flags, so it's safe to run hourly (Vercel Cron / pg_cron).
 * Requests that were clicked have status 'clicked' (excluded), and unsubscribed
 * ones are skipped explicitly.
 */
export async function runFollowUps(apiUrl: string): Promise<FollowUpReport> {
  const supabase = getSupabase();
  const report: FollowUpReport = { reminders_sent: 0, finals_sent: 0, errors: 0 };
  if (!supabase) return report;

  const now = Date.now();
  const select = "*, review_campaigns(*), clients(*)";

  // 1) Reminder — per-campaign delay (reminder_1_delay_hours). We fetch all un-reminded
  // sent requests and gate on each campaign's own cadence in code, since the delay varies
  // per campaign and can't be a single SQL constant. Volume is low (small businesses).
  const { data: reminderCandidates } = await supabase
    .from("review_requests")
    .select(select)
    .eq("status", "sent")
    .eq("reminder_1_sent", false)
    .is("unsubscribed_at", null)
    .returns<JoinedRequest[]>();

  for (const req of reminderCandidates ?? []) {
    if (!due(req.sent_at, req.review_campaigns.reminder_1_delay_hours, now)) continue;
    const ok = await sendFollowUp(req, "reminder", req.review_campaigns.email_subject_2, apiUrl);
    if (ok) {
      await supabase
        .from("review_requests")
        .update({ reminder_1_sent: true, reminder_1_at: new Date().toISOString() })
        .eq("id", req.id);
      report.reminders_sent++;
    } else {
      report.errors++;
    }
  }

  // 2) Final — per-campaign delay (reminder_2_delay_hours), same gating approach.
  const { data: finalCandidates } = await supabase
    .from("review_requests")
    .select(select)
    .eq("status", "sent")
    .eq("reminder_2_sent", false)
    .is("unsubscribed_at", null)
    .returns<JoinedRequest[]>();

  for (const req of finalCandidates ?? []) {
    if (!due(req.sent_at, req.review_campaigns.reminder_2_delay_hours, now)) continue;
    const ok = await sendFollowUp(req, "final", req.review_campaigns.email_subject_3, apiUrl);
    if (ok) {
      await supabase
        .from("review_requests")
        .update({ reminder_2_sent: true, reminder_2_at: new Date().toISOString() })
        .eq("id", req.id);
      report.finals_sent++;
    } else {
      report.errors++;
    }
  }

  return report;
}

async function sendFollowUp(
  req: JoinedRequest,
  step: ReviewEmailStep,
  subjectTemplate: string,
  apiUrl: string,
): Promise<boolean> {
  const client = req.clients;
  const campaign = req.review_campaigns;
  const firstName = (req.customer_name || "").split(/\s+/)[0] ?? "";
  const bodyTemplate = step === "final" ? campaign.email_body_3 : campaign.email_body_2;
  const res = await sendEmail({
    to: req.customer_email,
    subject: renderSubject(subjectTemplate, client),
    from: fromWithName(client.name),
    replyTo: client.email ?? undefined,
    html: renderReviewEmail(step, {
      client,
      customerFirstName: firstName,
      token: req.token,
      apiUrl,
      campaignType: campaign.campaign_type,
      bodyTemplate,
      incentive: campaign.incentive,
    }),
  });
  return res.ok || Boolean(res.skipped); // count "skipped" (resend disabled) as handled, not an error
}
