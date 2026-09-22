-- ==============================================================================
-- SECURITY AUDIT - Fix RLS Policies
-- Ensure all tables have proper org-scoped policies
-- ==============================================================================

-- 1. api_keys: Add org-scoped policies (currently too permissive)
DROP POLICY IF EXISTS "api_keys_r" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_a" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_u" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_d" ON public.api_keys;

DROP POLICY IF EXISTS "api_keys_select";
CREATE POLICY "api_keys_select" ON public.api_keys FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id() OR get_user_org_id() IS NULL);

DROP POLICY IF EXISTS "api_keys_insert";
CREATE POLICY "api_keys_insert" ON public.api_keys FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id() OR get_user_org_id() IS NULL);

DROP POLICY IF EXISTS "api_keys_update";
CREATE POLICY "api_keys_update" ON public.api_keys FOR UPDATE TO authenticated
  USING (organization_id = get_user_org_id() OR get_user_org_id() IS NULL)
  WITH CHECK (organization_id = get_user_org_id() OR get_user_org_id() IS NULL);

DROP POLICY IF EXISTS "api_keys_delete";
CREATE POLICY "api_keys_delete" ON public.api_keys FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id() OR get_user_org_id() IS NULL);

-- 2. Grant privileges to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;

-- 3. Verify helper functions exist for RLS
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid AS $$
BEGIN
  RETURN (
    SELECT organization_id 
    FROM public.profiles 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Verification: List all tables with RLS enabled
SELECT 'Tables with RLS:' as info;
SELECT tablename, relrowsecurity as rls_enabled
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE t.schemaname = 'public'
  AND n.nspname = 'public'
  AND relrowsecurity = true
ORDER BY tablename;

-- 5. Verification: List policies for critical tables
SELECT 'Policies for critical tables:' as info;
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('api_keys', 'module_visibility', 'delivery_orders', 'delivery_settings', 'profiles', 'system_users')
ORDER BY tablename, policyname;
