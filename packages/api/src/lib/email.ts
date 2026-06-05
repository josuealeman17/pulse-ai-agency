import { env, resendEnabled } from "../env.js";

/**
 * Email sending via Resend (shared-domain model). RESEND_FROM holds the single
 * verified sending identity (e.g. "Pulse <reviews@youragency.com>"). For client
 * mail we keep that address but swap the display NAME to the client's business
 * and set Reply-To to the client's own inbox — so customers see the client's
 * name and replies reach the client, while only one domain is ever verified.
 */

/** Extract the bare address from a "Name <addr>" or "addr" string. */
export function fromAddress(): string {
  const m = /<([^>]+)>/.exec(env.resendFrom);
  return (m ? m[1] : env.resendFrom).trim();
}

/** Build a From header that shows `displayName` over the shared sending address. */
export function fromWithName(displayName: string): string {
  // Strip characters that would break the header.
  const safe = displayName.replace(/["<>\r\n]/g, "").trim();
  return `${safe} <${fromAddress()}>`;
}

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  from?: string; // defaults to RESEND_FROM
  replyTo?: string;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
}

export async function sendEmail({ to, subject, html, from, replyTo }: SendArgs): Promise<SendResult> {
  if (!resendEnabled) {
    console.log(`[email] (resend disabled) would send to ${to}: ${subject}`);
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from ?? env.resendFrom,
        to,
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    const json = (await res.json()) as { id?: string; message?: string };
    if (!res.ok) {
      console.error(`[email] resend ${res.status}: ${json.message ?? "unknown"}`);
      return { ok: false, error: json.message ?? `resend_${res.status}` };
    }
    return { ok: true, id: json.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : "send_failed";
    console.error("[email] send failed:", error);
    return { ok: false, error };
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
