import { API_URL } from "./supabase.js";

export interface SendReport {
  added: number;
  sent: number;
  failed: number;
  skipped: number;
  error?: string;
}

/** Upload recipients (CSV) to a campaign and fire the initial emails (server-side). */
export async function uploadRecipients(campaignId: string, csv: string): Promise<SendReport> {
  const res = await fetch(`${API_URL}/api/campaigns/${campaignId}/recipients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv }),
  });
  const json = await res.json();
  if (!res.ok) return { added: 0, sent: 0, failed: 0, skipped: 0, error: json.error ?? "Upload failed" };
  return json as SendReport;
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
  const res = await fetch(`${API_URL}/api/clients/${clientId}/calcom`);
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  return res.json();
}

/** Choose which event type the bot books into (and that the client embeds on their site). */
export async function setCalcomEventType(clientId: string, eventTypeId: string): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}/calcom/event-type`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventTypeId }),
  });
  return res.json();
}

export async function disconnectCalcom(clientId: string): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(`${API_URL}/api/clients/${clientId}/calcom/disconnect`, { method: "POST" });
  return res.json();
}
