-- Phase 3 migration — run once in the Supabase SQL editor on the existing DB.
-- Adds columns used by the review engine (rating IP + unsubscribe).
ALTER TABLE review_requests ADD COLUMN IF NOT EXISTS rated_ip TEXT;
ALTER TABLE review_requests ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;
