import type { GoogleReview } from "@pulse/db";
import { API_URL, supabase } from "./supabase.js";

/** Build request headers including the caller's Supabase access token, so the
 *  API can verify identity + role. Admin API endpoints require this. */
async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export interface SendReport {
  added: number;
  sent: number;
  failed: number;
  skipped: number;
  deduped: number;
  error?: string;
}

/** Upload recipients (CSV) to a campaign and fire the initial emails (server-side). */
export async function uploadRecipients(campaignId: string, csv: string): Promise<SendReport> {
  const res = await fetch(`${API_URL}/api/campaigns/${campaignId}/recipients`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ csv }),
  });
  const json = await res.json();
  if (!res.ok) return { added: 0, sent: 0, failed: 0, skipped: 0, deduped: 0, error: json.error ?? "Upload failed" };
  return json as SendReport;
}

/** The public, token-gated trigger URL a client's CRM/Sheet posts to on job-done. */
export function webhookUrl(campaignId: string): string {
  return `${API_URL}/api/webhooks/review/${campaignId}`;
}

/** (Re)generate a campaign's trigger token. Returns the new token once. */
export async function rotateWebhookToken(
  campaignId: string,
): Promise<{ ok?: boolean; webhookToken?: string; error?: string }> {
  const res = await fetch(`${API_URL}/api/campaigns/${campaignId}/webhook-token`, {
    method: "POST",
    headers: await authHeaders(),
  });
  return res.json();
}

/** Permanently delete a client and all their data. Admin only. */
export async function deleteClient(clientId: string): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  return res.json();
}

export interface CalcomEventType {
  id: string;
  title: string;
  slug: string;
  lengthInMinutes: number | null;
}

export interface CalcomStatus {
  connected: boolean;
  bookingMode: string;
  eventTypeId: string | null;
  eventTypes: CalcomEventType[];
  listError?: string;
  error?: string;
}

/** Connection status for a client's Cal.com account. The API key is never returned. */
export async function getCalcomStatus(clientId: string): Promise<CalcomStatus> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}/calcom`, { headers: await authHeaders() });
  const json = await res.json();
  if (!res.ok) {
    return { connected: false, bookingMode: "capture", eventTypeId: null, eventTypes: [], error: json.error };
  }
  return json as CalcomStatus;
}

/** Validate + store the client's Cal.com API key; auto-selects the event type if there's only one. */
export async function connectCalcom(
  clientId: string,
  apiKey: string,
): Promise<{ ok?: boolean; eventTypes?: CalcomEventType[]; selectedEventTypeId?: string | null; error?: string }> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}/calcom/connect`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ apiKey }),
  });
  return res.json();
}

/** Choose which event type the bot books into (and that the client embeds on their site). */
export async function setCalcomEventType(clientId: string, eventTypeId: string): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}/calcom/event-type`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ eventTypeId }),
  });
  return res.json();
}

export async function disconnectCalcom(clientId: string): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}/calcom/disconnect`, {
    method: "POST",
    headers: await authHeaders(),
  });
  return res.json();
}

/** Invite (or link) a business owner's login for this client. */
export async function inviteClientLogin(
  clientId: string,
  email: string,
): Promise<{ ok?: boolean; email?: string; existing?: boolean; emailSent?: boolean; error?: string }> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}/invite`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email }),
  });
  return res.json();
}

export interface GoogleStatus {
  /** server has GOOGLE_CLIENT_ID/SECRET set */
  configured: boolean;
  connected: boolean;
  connectedAt: string | null;
  accountId: string | null;
  locationId: string | null;
  error?: string;
}

/** Google Business Profile connection state. The refresh token is never returned. */
export async function getGoogleStatus(clientId: string): Promise<GoogleStatus> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}/google/status`, { headers: await authHeaders() });
  const json = await res.json();
  if (!res.ok) {
    return { configured: false, connected: false, connectedAt: null, accountId: null, locationId: null, error: json.error };
  }
  return json as GoogleStatus;
}

/** Start the GBP OAuth flow — returns Google's consent URL to navigate to.
 *  `returnTo` is where Google bounces back after consent (validated server-side). */
export async function connectGoogle(clientId: string, returnTo: string): Promise<{ authUrl?: string; error?: string }> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}/google/connect`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ returnTo }),
  });
  return res.json();
}

export async function disconnectGoogle(clientId: string): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}/google/disconnect`, {
    method: "POST",
    headers: await authHeaders(),
  });
  return res.json();
}

/** Re-discover the GBP account + location (e.g. after Google approves API access). */
export async function syncGoogleLocation(
  clientId: string,
): Promise<{ ok?: boolean; accountId?: string | null; locationId?: string | null; debug?: string; accounts?: string[]; error?: string }> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}/google/sync-location`, {
    method: "POST",
    headers: await authHeaders(),
  });
  return res.json();
}

/** Stored Google reviews + our reply state for a client. */
export async function getGoogleReviews(clientId: string): Promise<{ reviews: GoogleReview[]; error?: string }> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}/google/reviews`, { headers: await authHeaders() });
  const json = await res.json();
  if (!res.ok) return { reviews: [], error: json.error ?? "Could not load reviews" };
  return json as { reviews: GoogleReview[] };
}

/** Post an (approved/edited) reply to Google. */
export async function postReviewReply(
  clientId: string,
  reviewId: string,
  text: string,
): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}/google/reviews/${reviewId}/reply`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ text }),
  });
  return res.json();
}

export async function skipReviewReply(clientId: string, reviewId: string): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}/google/reviews/${reviewId}/skip`, {
    method: "POST",
    headers: await authHeaders(),
  });
  return res.json();
}

/** Ask the AI for a fresh draft (does not post). */
export async function regenerateReviewReply(
  clientId: string,
  reviewId: string,
): Promise<{ ok?: boolean; text?: string; error?: string }> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}/google/reviews/${reviewId}/regenerate`, {
    method: "POST",
    headers: await authHeaders(),
  });
  return res.json();
}
