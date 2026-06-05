import type { Client } from "@pulse/db";
import { escapeHtml } from "../lib/email.js";

/**
 * Review-request email templates (PRD §5.4). Plain inline-styled HTML so they
 * render reliably across mail clients (Gmail/Outlook/Apple Mail). Mobile-first:
 * the star row is large and thumb-tappable, since the whole email exists to get
 * one tap. Each star is a link to the rate endpoint, which routes by score.
 */

export interface ReviewEmailParams {
  client: Client;
  customerFirstName: string;
  token: string;
  apiUrl: string;
}

export type ReviewEmailStep = "initial" | "reminder" | "final";

const STAR_GOLD = "#F5B301";

function starRow(apiUrl: string, token: string): string {
  const stars = [1, 2, 3, 4, 5]
    .map(
      (n) => `<a href="${apiUrl}/api/rate?token=${encodeURIComponent(token)}&stars=${n}"
        style="text-decoration:none;color:${STAR_GOLD};font-size:46px;line-height:1;padding:0 4px;display:inline-block"
        target="_blank" aria-label="${n} star${n > 1 ? "s" : ""}">★</a>`,
    )
    .join("");
  return `<div style="text-align:center;margin:8px 0 4px">${stars}</div>
    <div style="text-align:center;color:#9ca3af;font-size:12px">Tap a star to rate us</div>`;
}

function layout(params: ReviewEmailParams, inner: string): string {
  const { client, apiUrl, token } = params;
  const accent = client.accent_color || "#2563EB";
  const header = client.logo_url
    ? `<img src="${client.logo_url}" alt="${escapeHtml(client.name)}" height="44" style="height:44px;display:block;margin:0 auto" />`
    : `<div style="font-size:20px;font-weight:700;color:${accent};text-align:center">${escapeHtml(client.name)}</div>`;

  return `<!doctype html><html><body style="margin:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #ececf0">
        <tr><td style="padding:28px 28px 8px">${header}</td></tr>
        <tr><td style="padding:8px 28px 24px;color:#1f2937;font-size:16px;line-height:1.55">${inner}</td></tr>
        <tr><td style="padding:0 28px 24px">${starRow(apiUrl, token)}</td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f0f0f3;text-align:center;color:#9ca3af;font-size:11px">
          <a href="${apiUrl}/api/unsubscribe?token=${encodeURIComponent(token)}" style="color:#9ca3af">Unsubscribe</a>
          &nbsp;·&nbsp; Powered by <a href="https://pulse.ai" style="color:#9ca3af;font-weight:600">Pulse</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function renderReviewEmail(step: ReviewEmailStep, params: ReviewEmailParams): string {
  const name = escapeHtml(params.customerFirstName || "there");
  const biz = escapeHtml(params.client.name);

  const bodies: Record<ReviewEmailStep, string> = {
    initial: `<p>Hi ${name},</p>
      <p>Thanks for choosing <strong>${biz}</strong>! We'd love to hear how it went.</p>
      <p>It takes just one tap — how was your experience?</p>`,
    reminder: `<p>Hi ${name},</p>
      <p>Just a quick reminder — we'd really value your feedback on your recent visit to <strong>${biz}</strong>.</p>
      <p>One tap is all it takes:</p>`,
    final: `<p>Hi ${name},</p>
      <p>Last chance to share your experience with <strong>${biz}</strong>! Your feedback helps our small business and your community more than you know.</p>
      <p>How did we do?</p>`,
  };

  return layout(params, bodies[step]);
}

/** Fill {{business_name}} in a campaign subject line. */
export function renderSubject(subject: string, client: Client): string {
  return subject.replace(/\{\{business_name\}\}/g, client.name);
}
