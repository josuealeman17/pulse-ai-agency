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
