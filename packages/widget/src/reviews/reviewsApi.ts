/** Public shape returned by GET /chat/reviews (mirrors the API's ReviewsDisplayData). */
export interface PublicReview {
  id: string;
  reviewerName: string;
  starRating: number;
  comment: string;
  reviewedAt: string | null;
  reply: string | null;
}

export interface ReviewsData {
  businessName: string;
  googleReviewUrl: string | null;
  averageRating: number;
  total: number;
  reviews: PublicReview[];
}

export interface ReviewsSettings {
  clientId: string;
  apiUrl: string;
  theme: "light" | "dark";
  accent: string;
  /** Minimum star rating to display (1–5). */
  minStars?: number;
  /** Max reviews to request. */
  limit?: number;
}

export async function fetchReviews(s: ReviewsSettings): Promise<ReviewsData> {
  const params = new URLSearchParams({ clientId: s.clientId });
  if (s.minStars) params.set("min", String(s.minStars));
  if (s.limit) params.set("limit", String(s.limit));

  const res = await fetch(`${s.apiUrl}/chat/reviews?${params.toString()}`);
  if (!res.ok) throw new Error(`reviews ${res.status}`);
  return res.json();
}
