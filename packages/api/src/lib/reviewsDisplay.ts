import { getSupabase } from "./supabase.js";
import { resolveClientConfig } from "./clientConfig.js";

/** A single review as shown publicly on a client's website. */
export interface PublicReview {
  id: string;
  reviewerName: string;
  starRating: number;
  comment: string;
  /** ISO date the customer left the review, if known. */
  reviewedAt: string | null;
  /** The business's (AI-drafted or owner) reply, only when it's live on Google. */
  reply: string | null;
}

export interface ReviewsDisplayData {
  businessName: string;
  /** "Leave us a review" deep link, when the client has one configured. */
  googleReviewUrl: string | null;
  /** Average of the returned reviews, rounded to 1 decimal (0 when none). */
  averageRating: number;
  total: number;
  reviews: PublicReview[];
}

/** Demo reviews so the embed renders end-to-end before Supabase/Google are live. */
const DEMO_REVIEWS: PublicReview[] = [
  {
    id: "demo-1",
    reviewerName: "Marcus T.",
    starRating: 5,
    comment:
      "Booked through their chat in under a minute and the team showed up right on time. My car looks better than the day I bought it. Highly recommend.",
    reviewedAt: "2026-05-28T17:00:00Z",
    reply: "Thanks Marcus — it was a pleasure detailing your car! See you at the next service. 🚗✨",
  },
  {
    id: "demo-2",
    reviewerName: "Priya N.",
    starRating: 5,
    comment: "Professional, fast, and fairly priced. The ceramic coating is incredible.",
    reviewedAt: "2026-05-21T15:30:00Z",
    reply: null,
  },
  {
    id: "demo-3",
    reviewerName: "Dani R.",
    starRating: 4,
    comment: "Great interior detail. Came back looking spotless. Only wish they had more weekend slots.",
    reviewedAt: "2026-05-14T19:10:00Z",
    reply: "Appreciate the feedback, Dani! We're adding more Saturday slots soon — hope to see you then.",
  },
];

/** Show only genuinely positive reviews on a client's marketing site. */
const DEFAULT_MIN_STARS = 4;
const DEFAULT_LIMIT = 12;

function average(reviews: PublicReview[]): number {
  if (reviews.length === 0) return 0;
  const sum = reviews.reduce((acc, r) => acc + r.starRating, 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

/**
 * Public, read-only reviews for a client's website embed. Returns 4–5★ reviews
 * that have a comment, newest first. Without Supabase (Phase 1) it serves demo
 * reviews so the widget works locally. Returns null for an unknown client.
 */
export async function getDisplayReviews(
  clientId: string,
  opts: { minStars?: number; limit?: number } = {},
): Promise<ReviewsDisplayData | null> {
  const minStars = opts.minStars ?? DEFAULT_MIN_STARS;
  const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, 50);

  const config = await resolveClientConfig(clientId);
  if (!config) return null;

  const supabase = getSupabase();
  if (!supabase || config.source === "fallback") {
    const reviews = DEMO_REVIEWS.filter((r) => r.starRating >= minStars).slice(0, limit);
    return {
      businessName: config.client.name,
      googleReviewUrl: config.client.google_review_url,
      averageRating: average(reviews),
      total: reviews.length,
      reviews,
    };
  }

  const { data, error } = await supabase
    .from("google_reviews")
    .select("id, reviewer_name, star_rating, comment, review_created_at, reply_text, reply_status")
    .eq("client_id", config.client.id)
    .gte("star_rating", minStars)
    .not("comment", "is", null)
    .order("review_created_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) return null;

  const reviews: PublicReview[] = (data ?? [])
    .filter((r) => (r.comment ?? "").trim().length > 0)
    .map((r) => ({
      id: r.id as string,
      reviewerName: (r.reviewer_name as string | null) ?? "Verified customer",
      starRating: r.star_rating as number,
      comment: (r.comment as string).trim(),
      reviewedAt: (r.review_created_at as string | null) ?? null,
      // Only surface a reply once it's actually live on Google.
      reply: r.reply_status === "posted" ? ((r.reply_text as string | null) ?? null) : null,
    }));

  return {
    businessName: config.client.name,
    googleReviewUrl: config.client.google_review_url,
    averageRating: average(reviews),
    total: reviews.length,
    reviews,
  };
}
