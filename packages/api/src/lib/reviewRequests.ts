import { randomBytes } from "node:crypto";
import type { Client, ReviewCampaign, ReviewRequest } from "@pulse/db";
import { getSupabase } from "./supabase.js";

/** URL-safe one-time token for a review request's rating links. */
export function generateToken(): string {
  return randomBytes(18).toString("base64url");
}

/** A review request joined with its campaign + client (one round-trip via PostgREST). */
export interface ResolvedRequest {
  request: ReviewRequest;
  campaign: ReviewCampaign;
  client: Client;
}

export async function getByToken(token: string): Promise<ResolvedRequest | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("review_requests")
    .select("*, review_campaigns(*), clients(*)")
    .eq("token", token)
    .maybeSingle<ReviewRequest & { review_campaigns: ReviewCampaign; clients: Client }>();

  if (error || !data || !data.review_campaigns || !data.clients) return null;

  const { review_campaigns, clients, ...request } = data;
  return { request: request as ReviewRequest, campaign: review_campaigns, client: clients };
}

/** Record a star rating + mark the request clicked. Returns false if already rated. */
export async function recordRating(
  request: ReviewRequest,
  stars: number,
  ip: string | null,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  if (request.stars_given != null) return false; // one-time use

  const { error } = await supabase
    .from("review_requests")
    .update({
      stars_given: stars,
      status: "clicked",
      clicked_at: new Date().toISOString(),
      rated_ip: ip,
    })
    .eq("id", request.id)
    .is("stars_given", null); // guard against double-submit races

  return !error;
}

export async function recordFeedback(requestId: string, feedback: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase
    .from("review_requests")
    .update({ feedback_text: feedback, status: "completed" })
    .eq("id", requestId);
  return !error;
}

export async function markUnsubscribed(token: string): Promise<Client | null> {
  const resolved = await getByToken(token);
  if (!resolved) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  await supabase
    .from("review_requests")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("id", resolved.request.id);
  return resolved.client;
}
