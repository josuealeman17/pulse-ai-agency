import { Anthropic } from "@anthropic-ai/sdk";
import type { Client } from "@pulse/db";
import { env } from "../env.js";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

export interface ReviewForDraft {
  reviewerName?: string | null;
  stars: number;
  comment?: string | null;
}

/**
 * Draft a reply to a Google review. Positive reviews thank the customer and weave
 * in service/city keywords (a local-SEO signal Google indexes); critical reviews
 * empathize, apologize without admitting fault, and move the conversation offline.
 * Returns the reply text (no surrounding quotes) or null on failure.
 *
 * This is the testable half of the responder — it needs only the Anthropic key,
 * not the Google API approval.
 */
export async function draftReply(client: Client, review: ReviewForDraft): Promise<string | null> {
  const keywords = [client.business_type, client.city].filter(Boolean).join(", ");
  const location = [client.city, client.state].filter(Boolean).join(", ");
  const positive = review.stars >= 4;

  const system = `You write Google review replies on behalf of ${client.name}${
    client.business_type ? `, a ${client.business_type}` : ""
  }${location ? ` in ${location}` : ""}.
Write ONE reply and output ONLY the reply text — no quotes, no preamble, no sign-off placeholder.
${
  positive
    ? `This is a POSITIVE review. Thank the reviewer by name if one is given, reference something specific they mentioned, and naturally include 1–2 of these keywords where they read smoothly: ${
        keywords || "the service and the city"
      }. Warmly invite them back. Keep it 2–4 sentences.`
    : `This is a CRITICAL review. Empathize sincerely, apologize for their experience WITHOUT admitting fault or legal liability, invite them to reach out to the business directly to make it right, and express commitment to improving. Never be defensive. Keep it 2–3 sentences.`
}
Sound human, warm, and specific — never generic or robotic.`;

  const reviewer = review.reviewerName?.trim() || "A customer";
  const userMsg = `Reviewer: ${reviewer}
Rating: ${review.stars}/5
Review: ${review.comment?.trim() || "(no written comment)"}`;

  try {
    const msg = await anthropic.messages.create({
      model: env.anthropicModel,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: userMsg }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch (e) {
    console.error("[reviewResponder] draft failed:", e);
    return null;
  }
}
