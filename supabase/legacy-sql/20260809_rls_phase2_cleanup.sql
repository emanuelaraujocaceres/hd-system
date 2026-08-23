-- ==============================================================================
-- 20260809_rls_phase2_cleanup.sql
-- Limpar policies permissivas + consolidar para isolamento real
--
-- Execute ESTE SQL no Supabase SQL Editor
-- ==============================================================================

-- Helper functions (já existem — só atualizar para garantir)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND organization_id IS NULL);
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID AS $$
  SELECT store_branch_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

-- 1. Dropar ALL policies existentes (tanto permissivas quanto reais)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT pol.polname AS policy_name, cls.relname AS table_name
    FROM pg_policy pol
    JOIN pg_class cls ON pol.oid = cls.oid
    JOIN pg_namespace ns ON cls.relnamespace = ns.oid
    WHERE ns.nspname = 'public'
    AND cls.relname IN (
      'products','categories','customers','suppliers',
      'sales','sale_items','financial_transactions',
      'cash_sessions','stock_movements','store_branches',
      'system_users','system_settings',
      'scanned_boletos','credit_payments','nf_records',
      'footer_messages','media_devices','printers',
      'tables','customer_sessions','digital_menu_config',
      'branch_themes','api_keys','profiles','organizations',
      'sync_queue','pix_config','movimentacoes_falhas',
      'ai_insights','company_settings','stock_change_log',
      'user_permissions','sessions'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s" ON public.%I', r.policy_name, r.table_name);
    RAISE NOTICE 'Dropped: % on %', r.policy_name, r.table_name;
  END LOOP;
END $$;

-- 2. Recriar policies LIMPAS (isolamento real)
DO $$
DECLARE
  t TEXT;
BEGIN
  -- Branch-scoped tables
  FOR t IN SELECT unnest(ARRAY[
    'products','categories','customers','suppliers',
    'sales','sale_items','financial_transactions',
    'cash_sessions','stock_movements'
  ]) LOOP
    EXECUTE format('CREATE POLICY "%s_select" ON public.%I FOR SELECT USING (
      public.is_superadmin()
      OR (public.get_user_role() = ''admin'' AND organization_id = public.get_user_org_id())
      OR (store_branch_id = public.get_user_branch_id())
    )', t, t);
    
    EXECUTE format('CREATE POLICY "%s_insert" ON public.%I FOR INSERT WITH CHECK (
      public.is_superadmin()
      OR (public.get_user_role() = ''admin'' AND (organization_id = public.get_user_org_id() OR organization_id IS NULL))
      OR (store_branch_id = public.get_user_branch_id())
    )', t, t);
    
    EXECUTE format('CREATE POLICY "%s_update" ON public.%I FOR UPDATE USING (
      public.is_superadmin()
      OR (public.get_user_role() = ''admin'' AND organization_id = public.get_user_org_id())
      OR (store_branch_id = public.get_user_branch_id())
    ) WITH CHECK (
      public.is_superadmin()
      OR (public.get_user_role() = ''admin'' AND (organization_id = public.get_user_org_id() OR organization_id IS NULL))
      OR (store_branch_id = public.get_user_branch_id())
    )', t, t);
    
    EXECUTE format('CREATE POLICY "%s_delete" ON public.%I FOR DELETE USING (
      public.is_superadmin()
      OR (public.get_user_role() = ''admin'' AND organization_id = public.get_user_org_id())
      OR (store_branch_id = public.get_user_branch_id())
    )', t, t);
    
    RAISE NOTICE '✅ Policies criadas (branch-scoped): %', t;
  END LOOP;

  -- Org-scoped tables
  FOR t IN SELECT unnest(ARRAY[
    'store_branches','system_users','system_settings',
    'scanned_boletos','credit_payments','nf_records',
    'footer_messages','media_devices','printers',
    'tables','customer_sessions','digital_menu_config',
    'branch_themes','api_keys',
    'sync_queue','pix_config','movimentacoes_falhas',
    'ai_insights','company_settings','stock_change_log',
    'sessions'
  ]) LOOP
    EXECUTE format('CREATE POLICY "%s_select" ON public.%I FOR SELECT USING (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )', t, t);
    
    EXECUTE format('CREATE POLICY "%s_insert" ON public.%I FOR INSERT WITH CHECK (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )', t, t);
    
    EXECUTE format('CREATE POLICY "%s_update" ON public.%I FOR UPDATE USING (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    ) WITH CHECK (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )', t, t);
    
    EXECUTE format('CREATE POLICY "%s_delete" ON public.%I FOR DELETE USING (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )', t, t);
    
    RAISE NOTICE '✅ Policies criadas (org-scoped): %', t;
  END LOOP;
END $$;

-- 3. profiles: user vê próprio profile + admin vê org
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (
  public.is_superadmin()
  OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
  OR (id = auth.uid())
);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (
  public.is_superadmin() OR (organization_id = public.get_user_org_id())
);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (
  public.is_superadmin()
  OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
  OR (id = auth.uid())
) WITH CHECK (
  public.is_superadmin()
  OR (public.get_user_role() = 'admin' AND (organization_id = public.get_user_org_id() OR organization_id IS NULL))
  OR (id = auth.uid())
);
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE USING (
  public.is_superadmin()
  OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
);

-- 4. organizations: admin vê própria org
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
DROP POLICY IF EXISTS "organizations_insert" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update" ON public.organizations;
DROP POLICY IF EXISTS "organizations_delete" ON public.organizations;

CREATE POLICY "organizations_select" ON public.organizations FOR SELECT USING (
  public.is_superadmin() OR (id = public.get_user_org_id())
);
CREATE POLICY "organizations_insert" ON public.organizations FOR INSERT WITH CHECK (
  public.is_superadmin() OR (id = public.get_user_org_id())
);
CREATE POLICY "organizations_update" ON public.organizations FOR UPDATE USING (
  public.is_superadmin() OR (id = public.get_user_org_id())
) WITH CHECK (
  public.is_superadmin() OR (id = public.get_user_org_id())
);
CREATE POLICY "organizations_delete" ON public.organizations FOR DELETE USING (
  public.is_superadmin() OR (id = public.get_user_org_id())
);

-- 5. user_permissions: user vê só as próprias
DROP POLICY IF EXISTS "user_permissions_select" ON public.user_permissions;
DROP POLICY IF EXISTS "user_permissions_insert" ON public.user_permissions;
DROP POLICY IF EXISTS "user_permissions_update" ON public.user_permissions;
DROP POLICY IF EXISTS "user_permissions_delete" ON public.user_permissions;

CREATE POLICY "user_permissions_select" ON public.user_permissions FOR SELECT USING (
  public.is_superadmin()
  OR (auth.uid() = user_id)
  OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
);
CREATE POLICY "user_permissions_insert" ON public.user_permissions FOR INSERT WITH CHECK (
  public.is_superadmin() OR (auth.uid() = user_id)
);
CREATE POLICY "user_permissions_update" ON public.user_permissions FOR UPDATE USING (
  public.is_superadmin() OR (auth.uid() = user_id)
) WITH CHECK (
  public.is_superadmin() OR (auth.uid() = user_id)
);
CREATE POLICY "user_permissions_delete" ON public.user_permissions FOR DELETE USING (
  public.is_superadmin() OR (auth.uid() = user_id)
);

-- 6. VERIFICAÇÃO FINAL
SELECT 
  t.tablename,
  COUNT(p.policyname) as policy_count,
  MAX(t.rowsecurity) as rls_enabled
FROM pg_tables t
LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = 'public'
WHERE t.schemaname = 'public'
AND t.tablename IN (
  'products','categories','customers','suppliers','sales','sale_items',
  'cash_sessions','stock_movements','profiles','organizations',
  'store_branches','system_users','system_settings'
)
GROUP BY t.tablename, t.rowsecurity
ORDER BY t.tablename;
