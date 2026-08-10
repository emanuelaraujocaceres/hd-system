-- ==============================================================================
-- CORREÇÃO RLS: Grant privileges for tables with 401 errors
-- Tables: api_keys, customer_sessions, branch_themes
-- Error: "permission denied for table XXX"
-- ==============================================================================

-- 1. Grant privileges to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_themes TO authenticated;

-- 2. Also grant to anon role (for public access if needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_sessions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_themes TO anon;

-- 3. Verify RLS policies exist for these tables
-- api_keys: Should have policies for authenticated users
DROP POLICY IF EXISTS "api_keys_select" ON public.api_keys;
CREATE POLICY "api_keys_select" ON public.api_keys FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "api_keys_insert" ON public.api_keys;
CREATE POLICY "api_keys_insert" ON public.api_keys FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "api_keys_update" ON public.api_keys;
CREATE POLICY "api_keys_update" ON public.api_keys FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "api_keys_delete" ON public.api_keys;
CREATE POLICY "api_keys_delete" ON public.api_keys FOR DELETE TO authenticated USING (true);

-- customer_sessions: Should have policies for authenticated users
DROP POLICY IF EXISTS "customer_sessions_select" ON public.customer_sessions;
CREATE POLICY "customer_sessions_select" ON public.customer_sessions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "customer_sessions_insert" ON public.customer_sessions;
CREATE POLICY "customer_sessions_insert" ON public.customer_sessions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "customer_sessions_update" ON public.customer_sessions;
CREATE POLICY "customer_sessions_update" ON public.customer_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "customer_sessions_delete" ON public.customer_sessions;
CREATE POLICY "customer_sessions_delete" ON public.customer_sessions FOR DELETE TO authenticated USING (true);

-- branch_themes: Should have policies for authenticated users
DROP POLICY IF EXISTS "branch_themes_select" ON public.branch_themes;
CREATE POLICY "branch_themes_select" ON public.branch_themes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "branch_themes_insert" ON public.branch_themes;
CREATE POLICY "branch_themes_insert" ON public.branch_themes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "branch_themes_update" ON public.branch_themes;
CREATE POLICY "branch_themes_update" ON public.branch_themes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "branch_themes_delete" ON public.branch_themes;
CREATE POLICY "branch_themes_delete" ON public.branch_themes FOR DELETE TO authenticated USING (true);

-- 4. Verification
SELECT 'RLS privileges granted for:' as status;
SELECT table_name, grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' 
  AND table_name IN ('api_keys', 'customer_sessions', 'branch_themes')
  AND grantee = 'authenticated'
ORDER BY table_name, privilege_type;
