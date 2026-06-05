-- Phase 4 migration — enable Row-Level Security and admin policies.
-- Run once in the Supabase SQL editor.
--
-- The server (API) uses the SERVICE ROLE key, which BYPASSES RLS — so the chat
-- widget, booking, and review flows keep working unchanged. These policies grant
-- access to logged-in dashboard users (the agency admins). The public ANON key,
-- which ships in the dashboard's browser bundle, gets NO access until a user
-- authenticates — closing the hole where anon could read the whole DB.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients','chat_configs','chat_sessions','review_campaigns',
    'review_requests','appointments','admin_users'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- Drop a prior version of the policy if re-running.
    EXECUTE format('DROP POLICY IF EXISTS authenticated_all ON %I', t);
    -- Any authenticated user (agency admin) has full access.
    EXECUTE format(
      'CREATE POLICY authenticated_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
