import { Hono } from "hono";
import { getByToken, markUnsubscribed, recordFeedback, recordRating } from "../lib/reviewRequests.js";
import { escapeHtml, sendEmail } from "../lib/email.js";
import {
  alreadySubmittedPage,
  errorPage,
  feedbackFormPage,
  thanksPage,
  unsubscribedPage,
} from "../config/reviewPages.js";
import { env } from "../env.js";

export const reviewsRoute = new Hono();

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

/**
 * GET /api/rate?token=...&stars=1..5  — the satisfaction gate (PRD §5.3).
 * Logs the rating, then routes: >= threshold → client's Google review page;
 * below → private feedback form. One-time use.
 */
reviewsRoute.get("/api/rate", async (c) => {
  const token = c.req.query("token") ?? "";
  const stars = Number(c.req.query("stars"));

  if (!token || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    return html(errorPage("That rating link looks invalid."), 400);
  }

  const resolved = await getByToken(token);
  if (!resolved) return html(errorPage("We couldn't find that rating request."), 404);
  const { request, campaign, client } = resolved;

  // Already rated → don't double-count; send high raters on to Google anyway.
  if (request.stars_given != null) {
    if (request.stars_given >= campaign.satisfaction_threshold && client.google_review_url) {
      return c.redirect(client.google_review_url, 302);
    }
    return html(alreadySubmittedPage(client));
  }

  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await recordRating(request, stars, ip);

  if (stars >= campaign.satisfaction_threshold) {
    if (client.google_review_url) return c.redirect(client.google_review_url, 302);
    return html(thanksPage(client, true));
  }
  // Low rating → private feedback, keep it off the public web.
  return c.redirect(`${env.publicApiUrl}/feedback/${encodeURIComponent(token)}`, 302);
});

/** GET /feedback/:token — private feedback form for low ratings. */
reviewsRoute.get("/feedback/:token", async (c) => {
  const token = c.req.param("token");
  const resolved = await getByToken(token);
  if (!resolved) return html(errorPage("We couldn't find that feedback link."), 404);
  return html(feedbackFormPage(resolved.client, token, env.publicApiUrl));
});

/** POST /feedback/:token — save private feedback + email it to the client. */
reviewsRoute.post("/feedback/:token", async (c) => {
  const token = c.req.param("token");
  const resolved = await getByToken(token);
  if (!resolved) return html(errorPage("We couldn't find that feedback link."), 404);
  const { request, client } = resolved;

  const body = await c.req.parseBody();
  const feedback = String(body.feedback ?? "").trim();
  if (!feedback) return html(feedbackFormPage(client, token, env.publicApiUrl), 400);

  await recordFeedback(request.id, feedback);

  // Route the private feedback straight to the business owner.
  if (client.email) {
    await sendEmail({
      to: client.email,
      subject: `Private feedback from ${request.customer_name} — ${client.name}`,
      html: `<div style="font-family:sans-serif;max-width:520px">
        <h2>📝 New private feedback</h2>
        <p><strong>${escapeHtml(request.customer_name)}</strong> (${escapeHtml(request.customer_email)})
        rated their experience ${request.stars_given ?? "?"}/5 and shared:</p>
        <blockquote style="border-left:3px solid #e5e7eb;margin:12px 0;padding:4px 14px;color:#374151">
          ${escapeHtml(feedback)}
        </blockquote>
        <p style="color:#6b7280;font-size:12px">Sent privately by Pulse — this was not posted publicly.</p>
      </div>`,
    });
  }

  return html(thanksPage(client, false));
});

/** GET /api/unsubscribe?token=... — CAN-SPAM opt-out. */
reviewsRoute.get("/api/unsubscribe", async (c) => {
  const token = c.req.query("token") ?? "";
  const client = await markUnsubscribed(token);
  if (!client) return html(errorPage("We couldn't process that unsubscribe link."), 404);
  return html(unsubscribedPage(client));
});
