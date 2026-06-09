-- Trigger spine — per-campaign webhook so a client's CRM / job system / Google
-- Sheet can fire a review request when a job is marked "done", without an admin
-- pasting the customer in by hand. Run once in the Supabase SQL editor.
--
-- The recipients endpoint is admin-JWT-gated; a CRM/Sheet can't mint that. This
-- gives each campaign its own bearer token (mirrors the cron-secret pattern but
-- per-campaign) for an unauthenticated, token-scoped trigger endpoint.

ALTER TABLE review_campaigns ADD COLUMN IF NOT EXISTS webhook_token TEXT;

-- New campaigns get a token automatically. Two uuids → a 64-char hex string:
-- URL/header-safe without encoding, ~244 bits of entropy, and gen_random_uuid()
-- is built in (no pgcrypto / search_path surprises on Supabase).
ALTER TABLE review_campaigns
  ALTER COLUMN webhook_token SET DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

-- Backfill a token for every existing campaign so the trigger works without a manual rotate.
UPDATE review_campaigns
SET webhook_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE webhook_token IS NULL;

-- One token → one campaign.
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_campaigns_webhook_token
  ON review_campaigns(webhook_token) WHERE webhook_token IS NOT NULL;

-- Idempotency: the trigger dedupes a (campaign, email) within a recent window so
-- a re-fired Sheet row / double job-complete event doesn't double-email. This
-- index keeps that lookup fast.
CREATE INDEX IF NOT EXISTS idx_review_requests_campaign_email
  ON review_requests(campaign_id, customer_email);
