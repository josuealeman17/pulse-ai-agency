import type { Client } from "@pulse/db";
import { escapeHtml } from "../lib/email.js";

/** Minimal, mobile-friendly HTML pages served by the rating flow (no separate frontend). */
function page(accent: string, title: string, body: string): string {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root{--accent:${accent}}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f4f7;color:#1f2937;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}
  .card{background:#fff;border:1px solid #ececf0;border-radius:16px;max-width:460px;width:100%;padding:32px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.06)}
  h1{font-size:22px;margin:0 0 8px}
  p{color:#4b5563;line-height:1.55;margin:8px 0}
  textarea{width:100%;min-height:120px;border:1px solid #d1d5db;border-radius:10px;padding:12px;font-size:15px;font-family:inherit;margin-top:12px;resize:vertical}
  button{margin-top:16px;background:var(--accent);color:#fff;border:none;border-radius:10px;padding:13px 22px;font-size:16px;font-weight:600;cursor:pointer;width:100%}
  .biz{font-weight:700;color:var(--accent);margin-bottom:18px;font-size:18px}
  .muted{color:#9ca3af;font-size:12px;margin-top:20px}
</style></head>
<body><div class="card">${body}<div class="muted">Powered by Pulse</div></div></body></html>`;
}

const accentOf = (c: Client) => c.accent_color || "#2563EB";
const bizHeader = (c: Client) => `<div class="biz">${escapeHtml(c.name)}</div>`;

/**
 * A secondary, always-available link to the client's public Google review page.
 * Google's review-gating policy prohibits *steering* only happy customers to the
 * public platform; our private-feedback path must therefore never *prevent* an
 * unhappy customer from posting publicly. We keep recovery the default action,
 * but always leave the public option openly reachable (just not the loud CTA).
 */
function publicReviewLink(client: Client): string {
  if (!client.google_review_url) return "";
  return `<p class="muted" style="margin-top:18px">
    You're also welcome to
    <a href="${client.google_review_url}" target="_blank" rel="noopener"
       style="color:${accentOf(client)};font-weight:600">share your review publicly on Google</a>.
  </p>`;
}

export function feedbackFormPage(client: Client, token: string, apiUrl: string): string {
  return page(
    accentOf(client),
    `Share your feedback`,
    `${bizHeader(client)}
     <h1>How was your experience?</h1>
     <p>Thanks for letting us know. Your feedback goes straight to our team so we can make things right — what could we have done better?</p>
     <form method="POST" action="${apiUrl}/feedback/${encodeURIComponent(token)}">
       <textarea name="feedback" placeholder="Tell us what happened…" required></textarea>
       <button type="submit">Send feedback</button>
     </form>
     ${publicReviewLink(client)}`,
  );
}

export function thanksPage(client: Client, highRating: boolean): string {
  return page(
    accentOf(client),
    "Thank you!",
    `${bizHeader(client)}
     <h1>Thank you! 🙏</h1>
     <p>${
       highRating
         ? "We're thrilled you had a great experience. Redirecting you to leave a review…"
         : "Thank you for sharing your feedback — it means a lot and helps us improve."
     }</p>
     ${highRating ? "" : publicReviewLink(client)}`,
  );
}

export function alreadySubmittedPage(client: Client): string {
  return page(
    accentOf(client),
    "Already submitted",
    `${bizHeader(client)}
     <h1>You're all set ✅</h1>
     <p>Looks like you've already shared your feedback. Thank you!</p>`,
  );
}

export function unsubscribedPage(client: Client): string {
  return page(
    accentOf(client),
    "Unsubscribed",
    `${bizHeader(client)}
     <h1>You've been unsubscribed</h1>
     <p>You won't receive any more review requests from ${escapeHtml(client.name)}. Sorry for the inconvenience.</p>`,
  );
}

export function errorPage(message: string): string {
  return page(
    "#2563EB",
    "Oops",
    `<h1>Hmm, something's off</h1><p>${escapeHtml(message)}</p>`,
  );
}
