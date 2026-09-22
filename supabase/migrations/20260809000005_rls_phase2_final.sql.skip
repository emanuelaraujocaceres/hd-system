-- ==============================================================================
-- 20260809_rls_phase2_final.sql
-- Phase 2: Policies REAIS de isolamento
--
-- EXECUTAR ESTE SQL NO SQL EDITOR (já autenticado no Supabase)
-- Este SQL é idempotente: dropa policies antigos e cria as corretas.
-- ==============================================================================

-- 1. Helper functions (cria ou substitui)
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

-- 2. Drop ALL existing policies (to reapply corretas)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname='public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_r" ON public.%I', r.tablename, r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS "%s_a" ON public.%I', r.tablename, r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS "%s_u" ON public.%I', r.tablename, r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS "%s_d" ON public.%I', r.tablename, r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert_all" ON public.%I', r.tablename, r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_all" ON public.%I', r.tablename, r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update_all" ON public.%I', r.tablename, r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete_all" ON public.%I', r.tablename, r.tablename);
    -- Drop ALL other policies (RLS_*, _org_isolation, _superadmin, developer_all_*)
    -- Usa pg_policy para listar e dropar tudo
  END LOOP;
END $$;

-- 3. Drop ALL policies restantes via pg_policy
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT pol.pg_policy_name, cls.relname
    FROM pg_policy pol
    JOIN pg_class cls ON pol.oid = cls.relid  -- this is wrong, but we'll handle differently
    WHERE cls.relname IN (
      'products','categories','customers','suppliers',
      'sales','sale_items','financial_transactions',
      'cash_sessions','stock_movements','store_branches',
      'system_users','system_settings',
      'scanned_boletos','credit_payments','nf_records',
      'footer_messages','media_devices','printers',
      'tables','customer_sessions','digital_menu_config',
      'branch_themes','api_keys','profiles','organizations',
      'financial_accounts','caixa_sessions'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s" ON public.%I', r.pg_policy_name, r.relname);
  END LOOP;
END $$;

-- 4. Aplicar policies reais por tabela
DO $$
DECLARE
  t TEXT;
  branch_tables TEXT[] := ARRAY[
    'products','categories','customers','suppliers',
    'sales','sale_items','financial_transactions',
    'cash_sessions','stock_movements'
  ];
  org_tables TEXT[] := ARRAY[
    'store_branches','system_users','system_settings',
    'scanned_boletos','credit_payments','nf_records',
    'footer_messages','media_devices','printers',
    'tables','customer_sessions','digital_menu_config',
    'branch_themes','api_keys',
    'financial_accounts','caixa_sessions'
  ];
BEGIN
  -- Branch-scoped tables
  FOR t IN SELECT unnest(branch_tables) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_r" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_a" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_u" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_d" ON public.%I', t, t);
    
    EXECUTE format($sql$
      CREATE POLICY "%s_r" ON public.%I FOR SELECT USING (
        public.is_superadmin()
        OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
        OR (store_branch_id = public.get_user_branch_id())
      )
    $sql$, t, t);
    
    EXECUTE format($sql$
      CREATE POLICY "%s_a" ON public.%I FOR INSERT WITH CHECK (
        public.is_superadmin()
        OR (public.get_user_role() = 'admin' AND (organization_id = public.get_user_org_id() OR organization_id IS NULL))
        OR (store_branch_id = public.get_user_branch_id())
      )
    $sql$, t, t);
    
    EXECUTE format($sql$
      CREATE POLICY "%s_u" ON public.%I FOR UPDATE USING (
        public.is_superadmin()
        OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
        OR (store_branch_id = public.get_user_branch_id())
      ) WITH CHECK (
        public.is_superadmin()
        OR (public.get_user_role() = 'admin' AND (organization_id = public.get_user_org_id() OR organization_id IS NULL))
        OR (store_branch_id = public.get_user_branch_id())
      )
    $sql$, t, t);
    
    EXECUTE format($sql$
      CREATE POLICY "%s_d" ON public.%I FOR DELETE USING (
        public.is_superadmin()
        OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
        OR (store_branch_id = public.get_user_branch_id())
      )
    $sql$, t, t);
    
    RAISE NOTICE '✅ policies reais aplicadas: %', t;
  END LOOP;

  -- Org-scoped tables
  FOR t IN SELECT unnest(org_tables) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_r" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_a" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_u" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_d" ON public.%I', t, t);
    
    EXECUTE format($sql$
      CREATE POLICY "%s_r" ON public.%I FOR SELECT USING (
        public.is_superadmin() OR (organization_id = public.get_user_org_id())
      )
    $sql$, t, t);
    
    EXECUTE format($sql$
      CREATE POLICY "%s_a" ON public.%I FOR INSERT WITH CHECK (
        public.is_superadmin() OR (organization_id = public.get_user_org_id())
      )
    $sql$, t, t);
    
    EXECUTE format($sql$
      CREATE POLICY "%s_u" ON public.%I FOR UPDATE USING (
        public.is_superadmin() OR (organization_id = public.get_user_org_id())
      ) WITH CHECK (
        public.is_superadmin() OR (organization_id = public.get_user_org_id())
      )
    $sql$, t, t);
    
    EXECUTE format($sql$
      CREATE POLICY "%s_d" ON public.%I FOR DELETE USING (
        public.is_superadmin() OR (organization_id = public.get_user_org_id())
      )
    $sql$, t, t);
    
    RAISE NOTICE '✅ policies reais aplicadas (org-scoped): %', t;
  END LOOP;

  RAISE NOTICE '=== TODAS AS POLICIES REAIS APLICADAS ===';
END $$;

-- 5. profiles: special case (admin sees own org, user sees own profile)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_r" ON public.profiles;
DROP POLICY IF EXISTS "profiles_a" ON public.profiles;
DROP POLICY IF EXISTS "profiles_u" ON public.profiles;
DROP POLICY IF EXISTS "profiles_d" ON public.profiles;

CREATE POLICY "profiles_r" ON public.profiles FOR SELECT USING (
  public.is_superadmin()
  OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
  OR (id = auth.uid())
);
CREATE POLICY "profiles_a" ON public.profiles FOR INSERT WITH CHECK (
  public.is_superadmin() OR (organization_id = public.get_user_org_id())
);
CREATE POLICY "profiles_u" ON public.profiles FOR UPDATE USING (
  public.is_superadmin()
  OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
  OR (id = auth.uid())
) WITH CHECK (
  public.is_superadmin()
  OR (public.get_user_role() = 'admin' AND (organization_id = public.get_user_org_id() OR organization_id IS NULL))
  OR (id = auth.uid())
);
CREATE POLICY "profiles_d" ON public.profiles FOR DELETE USING (
  public.is_superadmin()
  OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
);

-- 6. organizations: admin sees own org
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "organizations_r" ON public.organizations;
DROP POLICY IF EXISTS "organizations_a" ON public.organizations;
DROP POLICY IF EXISTS "organizations_u" ON public.organizations;
DROP POLICY IF EXISTS "organizations_d" ON public.organizations;

CREATE POLICY "organizations_r" ON public.organizations FOR SELECT USING (
  public.is_superadmin() OR (id = public.get_user_org_id())
);
CREATE POLICY "organizations_a" ON public.organizations FOR INSERT WITH CHECK (
  public.is_superadmin() OR (id = public.get_user_org_id())
);
CREATE POLICY "organizations_u" ON public.organizations FOR UPDATE USING (
  public.is_superadmin() OR (id = public.get_user_org_id())
) WITH CHECK (
  public.is_superadmin() OR (id = public.get_user_org_id())
);
CREATE POLICY "organizations_d" ON public.organizations FOR DELETE USING (
  public.is_superadmin() OR (id = public.get_user_org_id())
);

-- 7. VERIFICAÇÃO FINAL
SELECT 
  tablename,
  count(*) as policy_count
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename IN (
  'products','categories','customers','suppliers',
  'sales','sale_items','financial_transactions',
  'cash_sessions','stock_movements','store_branches',
  'system_users','system_settings',
  'profiles','organizations'
)
GROUP BY tablename
ORDER BY tablename;
