-- Google reviews + AI responses. Pulse polls each connected client's GBP reviews,
-- drafts an SEO-aware reply, auto-posts 4–5★, and queues 1–3★ for owner approval.
-- Run once in the Supabase SQL editor (after 006).

CREATE TABLE IF NOT EXISTS google_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  -- Google's own review id (stable per location). Unique per client so the sync is idempotent.
  google_review_id TEXT NOT NULL,
  reviewer_name TEXT,
  star_rating INT NOT NULL,            -- 1..5 (mapped from Google's ONE..FIVE enum)
  comment TEXT,
  review_created_at TIMESTAMPTZ,
  -- Our reply + its lifecycle:
  --  pending_approval = AI draft awaiting owner sign-off (1–3★)
  --  posted           = live on Google (auto-posted 4–5★, or approved/owner reply)
  --  skipped          = owner chose not to reply
  --  failed           = drafting or posting errored (retry/repair)
  reply_text TEXT,
  reply_status TEXT NOT NULL DEFAULT 'pending_approval',
  reply_posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, google_review_id)
);

CREATE INDEX IF NOT EXISTS idx_google_reviews_client ON google_reviews(client_id);
CREATE INDEX IF NOT EXISTS idx_google_reviews_status ON google_reviews(reply_status);

-- RLS — mirror the role model from 004 (admins full; a client reads only its own).
ALTER TABLE google_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS google_reviews_admin ON google_reviews;
CREATE POLICY google_reviews_admin ON google_reviews FOR ALL TO authenticated
  USING (pulse_is_admin()) WITH CHECK (pulse_is_admin());
DROP POLICY IF EXISTS google_reviews_client_read ON google_reviews;
CREATE POLICY google_reviews_client_read ON google_reviews FOR SELECT TO authenticated
  USING (client_id = pulse_client_id());
