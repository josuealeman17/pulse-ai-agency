import type { Client } from "@pulse/db";
import { getSupabase } from "./supabase.js";
import { type GbpReview, listReviews, refreshAccessToken, replyToReview, starToInt } from "./google.js";
import { draftReply } from "./reviewResponder.js";

export interface ReviewSyncReport {
  clients: number;
  new_reviews: number;
  auto_posted: number;
  queued: number;
  errors: number;
}

/** Auto-post replies at/above this rating; below it, queue for owner approval. */
const AUTO_POST_MIN_STARS = 4;

/**
 * Poll every connected client's GBP reviews, draft replies for new ones, auto-post
 * 4–5★ and queue 1–3★ for approval. Idempotent (UNIQUE(client_id, google_review_id)
 * + an existence check), so it's safe to run on a schedule. No-ops until Google
 * approves API access (listReviews returns nothing without it).
 */
export async function runReviewSync(): Promise<ReviewSyncReport> {
  const report: ReviewSyncReport = { clients: 0, new_reviews: 0, auto_posted: 0, queued: 0, errors: 0 };
  const supabase = getSupabase();
  if (!supabase) return report;

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .not("google_oauth_refresh_token", "is", null)
    .not("google_location_id", "is", null)
    .returns<Client[]>();

  async function insert(
    clientId: string,
    r: GbpReview,
    stars: number,
    reviewerName: string | null,
    replyText: string | null,
    status: string,
    postedAt: string | null,
  ): Promise<void> {
    await supabase!.from("google_reviews").insert({
      client_id: clientId,
      google_review_id: r.reviewId,
      reviewer_name: reviewerName,
      star_rating: stars,
      comment: r.comment ?? null,
      review_created_at: r.createTime ?? null,
      reply_text: replyText,
      reply_status: status,
      reply_posted_at: postedAt,
    });
  }

  for (const client of clients ?? []) {
    report.clients++;
    const refreshToken = client.google_oauth_refresh_token;
    const locationPath = client.google_location_id;
    if (!refreshToken || !locationPath) continue;

    const accessToken = await refreshAccessToken(refreshToken);
    if (!accessToken) {
      report.errors++;
      continue;
    }

    const reviews = await listReviews(accessToken, locationPath);
    for (const r of reviews) {
      if (!r.reviewId) continue;

      const { data: existing } = await supabase
        .from("google_reviews")
        .select("id")
        .eq("client_id", client.id)
        .eq("google_review_id", r.reviewId)
        .maybeSingle();
      if (existing) continue;

      const stars = starToInt(r.starRating);
      const reviewerName = r.reviewer?.displayName ?? null;
      report.new_reviews++;

      // Owner already replied on Google → record as posted, don't redraft/overwrite.
      if (r.reviewReply?.comment) {
        await insert(client.id, r, stars, reviewerName, r.reviewReply.comment, "posted", r.reviewReply.updateTime ?? null);
        continue;
      }

      const draft = await draftReply(client, { reviewerName, stars, comment: r.comment });
      if (!draft) {
        await insert(client.id, r, stars, reviewerName, null, "failed", null);
        report.errors++;
        continue;
      }

      if (stars >= AUTO_POST_MIN_STARS) {
        const ok = await replyToReview(accessToken, locationPath, r.reviewId, draft);
        await insert(client.id, r, stars, reviewerName, draft, ok ? "posted" : "failed", ok ? new Date().toISOString() : null);
        if (ok) report.auto_posted++;
        else report.errors++;
      } else {
        await insert(client.id, r, stars, reviewerName, draft, "pending_approval", null);
        report.queued++;
      }
    }
  }

  return report;
}
