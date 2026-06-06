-- Client login — role-aware RLS. Run once in the Supabase SQL editor.
--
-- Replaces the blanket authenticated_all policies from 002_rls.sql. Admins
-- (admin_users.role='admin') keep full access; client users (role='client')
-- see ONLY rows for their own client_id. The API still uses the service-role
-- key, which bypasses RLS, so the chat widget / review flow are unaffected.

-- Role helpers. SECURITY DEFINER so they can read admin_users regardless of that
-- table's own RLS (avoids recursion when used inside other tables' policies).
CREATE OR REPLACE FUNCTION pulse_is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION pulse_client_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT client_id FROM admin_users WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION pulse_is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pulse_client_id() TO authenticated, anon;

-- Drop the old blanket policies.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients','chat_configs','chat_sessions','review_campaigns',
    'review_requests','appointments','admin_users'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS authenticated_all ON %I', t);
  END LOOP;
END $$;

-- admin_users: a user may read their OWN row (needed for role resolution at login);
-- admins may read/manage all. Client rows are created via the service-role invite endpoint.
DROP POLICY IF EXISTS admin_users_select ON admin_users;
CREATE POLICY admin_users_select ON admin_users FOR SELECT TO authenticated
  USING (id = auth.uid() OR pulse_is_admin());
DROP POLICY IF EXISTS admin_users_admin_manage ON admin_users;
CREATE POLICY admin_users_admin_manage ON admin_users FOR ALL TO authenticated
  USING (pulse_is_admin()) WITH CHECK (pulse_is_admin());

-- clients: admin full; a client user can read + update only their own business row.
DROP POLICY IF EXISTS clients_admin ON clients;
CREATE POLICY clients_admin ON clients FOR ALL TO authenticated
  USING (pulse_is_admin()) WITH CHECK (pulse_is_admin());
DROP POLICY IF EXISTS clients_self_select ON clients;
CREATE POLICY clients_self_select ON clients FOR SELECT TO authenticated
  USING (id = pulse_client_id());
DROP POLICY IF EXISTS clients_self_update ON clients;
CREATE POLICY clients_self_update ON clients FOR UPDATE TO authenticated
  USING (id = pulse_client_id()) WITH CHECK (id = pulse_client_id());

-- chat_configs: admin full; client read+write their own (edit chatbot knowledge).
DROP POLICY IF EXISTS chat_configs_admin ON chat_configs;
CREATE POLICY chat_configs_admin ON chat_configs FOR ALL TO authenticated
  USING (pulse_is_admin()) WITH CHECK (pulse_is_admin());
DROP POLICY IF EXISTS chat_configs_self ON chat_configs;
CREATE POLICY chat_configs_self ON chat_configs FOR ALL TO authenticated
  USING (client_id = pulse_client_id()) WITH CHECK (client_id = pulse_client_id());

-- Read-only-for-clients tables: admin full; client SELECT only their own client_id.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_sessions','review_campaigns','review_requests','appointments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_admin ON %1$I', t, t);
    EXECUTE format(
      'CREATE POLICY %1$s_admin ON %1$I FOR ALL TO authenticated USING (pulse_is_admin()) WITH CHECK (pulse_is_admin())',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS %1$s_client_read ON %1$I', t, t);
    EXECUTE format(
      'CREATE POLICY %1$s_client_read ON %1$I FOR SELECT TO authenticated USING (client_id = pulse_client_id())',
      t
    );
  END LOOP;
END $$;
