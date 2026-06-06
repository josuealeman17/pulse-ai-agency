-- Tier 1+2 campaign editing — run once in the Supabase SQL editor on the existing DB.
-- Adds per-campaign type, editable message bodies, an optional incentive line, and
-- a configurable follow-up cadence. Existing rows default to the Google-review preset
-- (type 'google_review', 48h/120h cadence); bodies stay NULL and fall back to defaults.
ALTER TABLE review_campaigns ADD COLUMN IF NOT EXISTS campaign_type TEXT DEFAULT 'google_review';
ALTER TABLE review_campaigns ADD COLUMN IF NOT EXISTS email_body_1 TEXT;
ALTER TABLE review_campaigns ADD COLUMN IF NOT EXISTS email_body_2 TEXT;
ALTER TABLE review_campaigns ADD COLUMN IF NOT EXISTS email_body_3 TEXT;
ALTER TABLE review_campaigns ADD COLUMN IF NOT EXISTS incentive TEXT;
ALTER TABLE review_campaigns ADD COLUMN IF NOT EXISTS reminder_1_delay_hours INT DEFAULT 48;
ALTER TABLE review_campaigns ADD COLUMN IF NOT EXISTS reminder_2_delay_hours INT DEFAULT 120;
