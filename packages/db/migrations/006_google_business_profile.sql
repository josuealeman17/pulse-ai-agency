-- Google Business Profile (GBP) OAuth — per-client connection so Pulse can pull
-- the client's reviews (website display + reports) and post AI-drafted replies.
-- Run once in the Supabase SQL editor.
--
-- google_oauth_refresh_token is a long-lived SECRET. The API (service-role) writes
-- it and the /google/status endpoint never returns it. NOTE: like calcom_api_key,
-- the client-self-select RLS policy can currently read this column back to a
-- client-role browser — acceptable short-term (it's the client's own Google grant),
-- but both secrets should move behind column-level security / a secrets table.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_oauth_refresh_token TEXT;
-- Resource paths we discover after consent, e.g. account = 'accounts/123',
-- location = 'accounts/123/locations/456' (stored full so v4 review URLs build cleanly).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_account_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_location_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_connected_at TIMESTAMPTZ;
