import type { CampaignType } from "./types.js";

/**
 * Default copy for each campaign type. These are seeded into a new campaign's
 * editable fields on creation, and also act as the render-time fallback when a
 * body is left blank. One source of truth shared by the API and the dashboard.
 *
 * Bodies are plain-text templates: blank lines separate paragraphs, and the
 * placeholders {{first_name}} and {{business_name}} are filled at send time.
 *
 * Compliance note: incentives are framed as an offer on the customer's NEXT
 * purchase — never as a reward "for leaving a review" (Google/FTC prohibit
 * incentivized reviews). The feedback ask is kept separate from the offer.
 */
export interface CampaignPreset {
  label: string;
  description: string;
  subjects: [string, string, string];
  bodies: [string, string, string];
  incentive: string | null;
  reminder1DelayHours: number;
  reminder2DelayHours: number;
}

export const CAMPAIGN_PRESETS: Record<CampaignType, CampaignPreset> = {
  google_review: {
    label: "Google Review (post-job)",
    description: "Fires right after a job is marked done, while gratitude is fresh.",
    subjects: [
      "How was your experience at {{business_name}}?",
      "Quick reminder — we'd love your feedback!",
      "Last chance to share your experience",
    ],
    bodies: [
      "Hi {{first_name}},\n\nThanks for choosing {{business_name}}! We'd love to hear how it went.\n\nIt takes just one tap — how was your experience?",
      "Hi {{first_name}},\n\nJust a quick reminder — we'd really value your feedback on your recent visit to {{business_name}}.\n\nOne tap is all it takes:",
      "Hi {{first_name}},\n\nLast chance to share your experience with {{business_name}}! Your feedback helps our small business and your community more than you know.\n\nHow did we do?",
    ],
    incentive: null,
    reminder1DelayHours: 48,
    reminder2DelayHours: 120,
  },
  reactivation: {
    label: "Old-customer reactivation",
    description: "Win back customers from a while ago, usually with a next-visit offer.",
    subjects: [
      "We'd love to see you again at {{business_name}}",
      "A little something to welcome you back",
      "One last hello from {{business_name}}",
    ],
    bodies: [
      "Hi {{first_name}},\n\nIt's been a while since your last visit to {{business_name}}, and we'd genuinely love to welcome you back.\n\nWhile we're reaching out — we'd really appreciate hearing how your past experience was. Just one tap below:",
      "Hi {{first_name}},\n\nWe don't want you to miss out — it would be great to see you again at {{business_name}}.\n\nAnd if you have a moment, tap below to tell us how we did last time:",
      "Hi {{first_name}},\n\nOne last note from {{business_name}} — we'd love to have you back, and to hear your thoughts on your past visit.\n\nHow did we do?",
    ],
    incentive: "As a thank-you, enjoy 5% off your next visit — just mention this email.",
    reminder1DelayHours: 72,
    reminder2DelayHours: 168,
  },
};
