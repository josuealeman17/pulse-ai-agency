import type { Client, ReviewCampaign, ReviewRequest } from "@pulse/db";
import { getSupabase } from "./supabase.js";
import { fromWithName, sendEmail } from "./email.js";
import { renderReviewEmail, renderSubject, type ReviewEmailStep } from "../config/reviewEmails.js";
import { env } from "../env.js";

const HOURS_48 = 48 * 3600 * 1000;
const DAYS_5 = 5 * 24 * 3600 * 1000;

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
export async function runFollowUps(): Promise<FollowUpReport> {
  const supabase = getSupabase();
  const report: FollowUpReport = { reminders_sent: 0, finals_sent: 0, errors: 0 };
  if (!supabase) return report;

  const now = Date.now();
  const select = "*, review_campaigns(*), clients(*)";

  // 1) 48h reminder
  const { data: reminderDue } = await supabase
    .from("review_requests")
    .select(select)
    .eq("status", "sent")
    .eq("reminder_1_sent", false)
    .is("unsubscribed_at", null)
    .lt("sent_at", new Date(now - HOURS_48).toISOString())
    .returns<JoinedRequest[]>();

  for (const req of reminderDue ?? []) {
    const ok = await sendFollowUp(req, "reminder", req.review_campaigns.email_subject_2);
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

  // 2) 5-day final
  const { data: finalDue } = await supabase
    .from("review_requests")
    .select(select)
    .eq("status", "sent")
    .eq("reminder_2_sent", false)
    .is("unsubscribed_at", null)
    .lt("sent_at", new Date(now - DAYS_5).toISOString())
    .returns<JoinedRequest[]>();

  for (const req of finalDue ?? []) {
    const ok = await sendFollowUp(req, "final", req.review_campaigns.email_subject_3);
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
): Promise<boolean> {
  const client = req.clients;
  const firstName = (req.customer_name || "").split(/\s+/)[0] ?? "";
  const res = await sendEmail({
    to: req.customer_email,
    subject: renderSubject(subjectTemplate, client),
    from: fromWithName(client.name),
    replyTo: client.email ?? undefined,
    html: renderReviewEmail(step, {
      client,
      customerFirstName: firstName,
      token: req.token,
      apiUrl: env.publicApiUrl,
    }),
  });
  return res.ok || Boolean(res.skipped); // count "skipped" (resend disabled) as handled, not an error
}
