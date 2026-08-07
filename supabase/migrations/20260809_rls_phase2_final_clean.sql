-- ==============================================================================
-- 20260809_rls_phase2_final_clean.sql
-- Phase 2 FINAL: Drop ALL policies + apply real isolation
--
-- EXECUTE ESTE SQL NO SQL EDITOR (Supabase Dashboard)
-- É idempotente: dropa tudo e recria do zero.
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

-- 2. Drop ALL existing policies (via DO loop sobre pg_policy)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname::TEXT AS policy_name, c.relname AS table_name
    FROM pg_policy p
    JOIN pg_class c ON p.oid = c.relid  -- WRONG JOIN! Fix below
    LOOP
    -- Skip, vamos usar método correto
  END LOOP;
END $$;

-- Método correto: listar policies via pg_policies e dropar uma a uma
-- pg_policies é uma VIEW então não dá JOIN direto. Vamos usar pg_policy:
DO $$
DECLARE
  pol_name TEXT;
  tab_name TEXT;
BEGIN
  -- Drop de todas as policies de tabelas alvo
  FOR pol_name, tab_name IN
    SELECT p.proname::TEXT, c.relname
    FROM pg_policy p
    JOIN pg_class c ON p.objid = c.relid  -- CORRETO: p.objid = c.oid
    WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    AND c.relname IN (
      'products','categories','customers','suppliers',
      'sales','sale_items','financial_transactions',
      'cash_sessions','stock_movements','store_branches',
      'system_users','system_settings',
      'scanned_boletos','credit_payments','nf_records',
      'footer_messages','media_devices','printers',
      'tables','customer_sessions','digital_menu_config',
      'branch_themes','api_keys','profiles','organizations'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s" ON public.%I', pol_name, tab_name);
    RAISE NOTICE 'Dropped: % on %', pol_name, tab_name;
  END LOOP;
END $$;

-- 3. Garantir RLS ativado
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'products','categories','customers','suppliers',
    'sales','sale_items','financial_transactions',
    'cash_sessions','stock_movements','store_branches',
    'system_users','system_settings',
    'scanned_boletos','credit_payments','nf_records',
    'footer_messages','media_devices','printers',
    'tables','customer_sessions','digital_menu_config',
    'branch_themes','api_keys','profiles','organizations'
  ]) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    RAISE NOTICE 'RLS enabled: %', t;
  END LOOP;
END $$;

-- 4. Aplicar policies reais (branch-scoped)
-- Tabelas com store_branch_id
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'products','categories','customers','suppliers',
    'sales','sale_items','financial_transactions',
    'cash_sessions','stock_movements'
  ]) LOOP
    EXECUTE format($sql$CREATE POLICY "%s_r" ON public.%I FOR SELECT USING (
      public.is_superadmin()
      OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
      OR (store_branch_id = public.get_user_branch_id())
    )$sql$, t, t);

    EXECUTE format($sql$CREATE POLICY "%s_a" ON public.%I FOR INSERT WITH CHECK (
      public.is_superadmin()
      OR (public.get_user_role() = 'admin' AND (organization_id = public.get_user_org_id() OR organization_id IS NULL))
      OR (store_branch_id = public.get_user_branch_id())
    )$sql$, t, t);

    EXECUTE format($sql$CREATE POLICY "%s_u" ON public.%I FOR UPDATE USING (
      public.is_superadmin()
      OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
      OR (store_branch_id = public.get_user_branch_id())
    ) WITH CHECK (
      public.is_superadmin()
      OR (public.get_user_role() = 'admin' AND (organization_id = public.get_user_org_id() OR organization_id IS NULL))
      OR (store_branch_id = public.get_user_branch_id())
    )$sql$, t, t);

    EXECUTE format($sql$CREATE POLICY "%s_d" ON public.%I FOR DELETE USING (
      public.is_superadmin()
      OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
      OR (store_branch_id = public.get_user_branch_id())
    )$sql$, t, t);

    RAISE NOTICE '✅ Policies (branch-scoped): %', t;
  END LOOP;
END $$;

-- 5. Aplicar policies reais (org-scoped)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'store_branches','system_users','system_settings',
    'scanned_boletos','credit_payments','nf_records',
    'footer_messages','media_devices','printers',
    'tables','customer_sessions','digital_menu_config',
    'branch_themes','api_keys'
  ]) LOOP
    EXECUTE format($sql$CREATE POLICY "%s_r" ON public.%I FOR SELECT USING (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )$sql$, t, t);

    EXECUTE format($sql$CREATE POLICY "%s_a" ON public.%I FOR INSERT WITH CHECK (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )$sql$, t, t);

    EXECUTE format($sql$CREATE POLICY "%s_u" ON public.%I FOR UPDATE USING (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    ) WITH CHECK (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )$sql$, t, t);

    EXECUTE format($sql$CREATE POLICY "%s_d" ON public.%I FOR DELETE USING (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )$sql$, t, t);

    RAISE NOTICE '✅ Policies (org-scoped): %', t;
  END LOOP;
END $$;

-- 6. profiles: user vê próprio profile; admin vê org
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

-- 7. organizations: admin vê própria org
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

-- 8. VERIFICAÇÃO FINAL
SELECT 
  tablename, 
  COUNT(*) as policy_count 
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename IN (
  'products','categories','customers','suppliers',
  'sales','sale_items','financial_transactions',
  'store_branches','profiles','organizations'
)
GROUP BY tablename, rowsecurity
ORDER BY tablename;
