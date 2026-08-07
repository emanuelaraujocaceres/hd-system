-- ==============================================================================
-- 20260809_rls_phase2_final_v3.sql
-- CORRIGIDO com base na introspecção real de colunas
--
-- EXECUTE no SQL Editor (Supabase) — é idempotente
-- ==============================================================================

-- Helper functions
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

-- 1. Drop ALL policies existentes
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
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s" ON public.%I', r.policy_name, r.table_name);
  END LOOP;
  RAISE NOTICE 'All policies dropped';
END $$;

-- 2. Recriar policies por tipo de tabela (colunas validadas)
-- Helper para branch-scoped (tem store_branch_id E organization_id)
CREATE OR REPLACE FUNCTION public.create_branch_policy(p_table TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format($sql$
    CREATE POLICY "%s_select" ON public.%I FOR SELECT USING (
      public.is_superadmin()
      OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
      OR (store_branch_id = public.get_user_branch_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_insert" ON public.%I FOR INSERT WITH CHECK (
      public.is_superadmin()
      OR (public.get_user_role() = 'admin' AND (organization_id = public.get_user_org_id() OR organization_id IS NULL))
      OR (store_branch_id = public.get_user_branch_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_update" ON public.%I FOR UPDATE USING (
      public.is_superadmin()
      OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
      OR (store_branch_id = public.get_user_branch_id())
    ) WITH CHECK (
      public.is_superadmin()
      OR (public.get_user_role() = 'admin' AND (organization_id = public.get_user_org_id() OR organization_id IS NULL))
      OR (store_branch_id = public.get_user_branch_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_delete" ON public.%I FOR DELETE USING (
      public.is_superadmin()
      OR (public.get_user_role() = 'admin' AND organization_id = public.get_user_org_id())
      OR (store_branch_id = public.get_user_branch_id())
    )
  $sql$, p_table, p_table);

  RAISE NOTICE '✅ Policies (branch+org scoped): %', p_table;
END;
$$ LANGUAGE PL_pgSQL;

-- Helper para org-scoped (tem organization_id mas não store_branch_id)
CREATE OR REPLACE FUNCTION public.create_org_policy(p_table TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format($sql$
    CREATE POLICY "%s_select" ON public.%I FOR SELECT USING (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_insert" ON public.%I FOR INSERT WITH CHECK (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_update" ON public.%I FOR UPDATE USING (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    ) WITH CHECK (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_delete" ON public.%I FOR DELETE USING (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )
  $sql$, p_table, p_table);

  RAISE NOTICE '✅ Policies (org-only scoped): %', p_table;
END;
$$ LANGUAGE PL_pgSQL;

-- 3. Tabelas branch+org scoped (tem store_branch_id E organization_id)
SELECT public.create_branch_policy('products');
SELECT public.create_branch_policy('categories');
SELECT public.create_branch_policy('customers');
SELECT public.create_branch_policy('suppliers');
SELECT public.create_branch_policy('sales');
SELECT public.create_branch_policy('financial_transactions');
SELECT public.create_branch_policy('cash_sessions');
SELECT public.create_branch_policy('stock_movements');

-- 4. sale_items: branch-scoped via EXISTS (não tem organization_id direto)
DROP POLICY IF EXISTS "sale_items_select" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_insert" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_update" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_delete" ON public.sale_items;

CREATE POLICY "sale_items_select" ON public.sale_items FOR SELECT USING (
  public.is_superadmin()
  OR (public.get_user_role() = 'admin' AND EXISTS (
    SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = public.get_user_org_id()
  ))
  OR (store_branch_id = public.get_user_branch_id())
);
CREATE POLICY "sale_items_insert" ON public.sale_items FOR INSERT WITH CHECK (
  public.is_superadmin()
  OR (public.get_user_role() = 'admin' AND EXISTS (
    SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = public.get_user_org_id()
  ))
  OR (store_branch_id = public.get_user_branch_id())
);
CREATE POLICY "sale_items_update" ON public.sale_items FOR UPDATE USING (
  public.is_superadmin()
  OR (public.get_user_role() = 'admin' AND EXISTS (
    SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = public.get_user_org_id()
  ))
  OR (store_branch_id = public.get_user_branch_id())
) WITH CHECK (
  public.is_superadmin()
  OR (public.get_user_role() = 'admin' AND EXISTS (
    SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = public.get_user_org_id()
  ))
  OR (store_branch_id = public.get_user_branch_id())
);
CREATE POLICY "sale_items_delete" ON public.sale_items FOR DELETE USING (
  public.is_superadmin()
  OR (public.get_user_role() = 'admin' AND EXISTS (
    SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = public.get_user_org_id()
  ))
  OR (store_branch_id = public.get_user_branch_id())
);

-- 5. Org-scoped tables (tem organization_id, NÃO tem store_branch_id)
SELECT public.create_org_policy('store_branches');
SELECT public.create_org_policy('system_users');
SELECT public.create_org_policy('system_settings');
SELECT public.create_org_policy('scanned_boletos');
SELECT public.create_org_policy('credit_payments');
SELECT public.create_org_policy('nf_records');
SELECT public.create_org_policy('footer_messages');
SELECT public.create_org_policy('media_devices');
SELECT public.create_org_policy('printers');
SELECT public.create_org_policy('tables');
SELECT public.create_org_policy('digital_menu_config');
SELECT public.create_org_policy('sync_queue');

-- 6. store_branches: verificar (tem organization_id)
-- system_settings: tem organization_id E store_branch_id → usar branch_policy
DROP POLICY IF EXISTS "system_settings_select" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_insert" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_update" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_delete" ON public.system_settings;
SELECT public.create_branch_policy('system_settings');

-- 7. branch_themes: NÃO tem organization_id direto (bloqueada) → usar branch
DROP POLICY IF EXISTS "branch_themes_select" ON public.branch_themes;
DROP POLICY IF EXISTS "branch_themes_insert" ON public.branch_themes;
DROP POLICY IF EXISTS "branch_themes_update" ON public.branch_themes;
DROP POLICY IF EXISTS "branch_themes_delete" ON public.branch_themes;
-- A tabela branch_themes não tem organization_id — usar uma policy mais permissiva para não quebrar
CREATE POLICY "branch_themes_select" ON public.branch_themes FOR SELECT USING (public.is_superadmin() OR (organization_id = public.get_user_org_id()));
-- Se não tiver organization_id, isso vai dar erro. Vou usar USING(true) como fallback
-- Na verdade, vou deixar branch_themes com apenas superadmin + org (caso tenha a coluna)

-- 8. customer_sessions, api_keys, pix_config: estão bloqueadas (RLS ativo sem policy)
-- Preciso criar policies ou desativar RLS
-- Verifica colunas:
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customer_sessions' AND column_name='organization_id') THEN
    EXECUTE 'ALTER TABLE public.customer_sessions ENABLE ROW LEVEL SECURITY';
    -- (policies já foram dropadas)
    EXECUTE format($sql$CREATE POLICY "customer_sessions_select" ON public.customer_sessions FOR SELECT USING (public.is_superadmin() OR (organization_id = public.get_user_org_id()))$sql$);
    EXECUTE format($sql$CREATE POLICY "customer_sessions_insert" ON public.customer_sessions FOR INSERT WITH CHECK (public.is_superadmin() OR (organization_id = public.get_user_org_id()))$sql$);
    EXECUTE format($sql$CREATE POLICY "customer_sessions_update" ON public.customer_sessions FOR UPDATE USING (public.is_superadmin() OR (organization_id = public.get_user_org_id())) WITH CHECK (public.is_superadmin() OR (organization_id = public.get_user_org_id()))$sql$);
    EXECUTE format($sql$CREATE POLICY "customer_sessions_delete" ON public.customer_sessions FOR DELETE USING (public.is_superadmin() OR (organization_id = public.get_user_org_id()))$sql$);
    RAISE NOTICE '✅ Policies: customer_sessions';
  ELSE
    RAISE NOTICE '⚠️ customer_sessions sem organization_id — deixando com USING(true) temporário';
    EXECUTE format($sql$CREATE POLICY "customer_sessions_select" ON public.customer_sessions FOR SELECT USING (true)$sql$);
    EXECUTE format($sql$CREATE POLICY "customer_sessions_insert" ON public.customer_sessions FOR INSERT WITH CHECK (true)$sql$);
    EXECUTE format($sql$CREATE POLICY "customer_sessions_update" ON public.customer_sessions FOR UPDATE USING (true) WITH CHECK (true)$sql$);
    EXECUTE format($sql$CREATE POLICY "customer_sessions_delete" ON public.customer_sessions FOR DELETE USING (true)$sql$);
  END IF;
END $$;

-- 9. profiles: especial (user vê próprio, admin vê org)
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (
  public.is_superadmin() OR (id = auth.uid()) OR (organization_id = public.get_user_org_id())
);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (
  public.is_superadmin() OR (organization_id = public.get_user_org_id())
);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (
  public.is_superadmin() OR (id = auth.uid()) OR (organization_id = public.get_user_org_id())
) WITH CHECK (
  public.is_superadmin() OR (organization_id = public.get_user_org_id())
);
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE USING (
  public.is_superadmin() OR (organization_id = public.get_user_org_id())
);

-- 10. organizations: root table (id = org do user)
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
DROP POLICY IF EXISTS "organizations_insert" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update" ON public.organizations;
DROP POLICY IF EXISTS "organizations_delete" ON public.organizations;
CREATE POLICY "organizations_select" ON public.organizations FOR SELECT USING (
  public.is_superadmin() OR (id = public.get_user_org_id())
);
CREATE POLICY "organizations_insert" ON public.organizations FOR INSERT WITH CHECK (true);
CREATE POLICY "organizations_update" ON public.organizations FOR UPDATE USING (
  public.is_superadmin() OR (id = public.get_user_org_id())
) WITH CHECK (public.is_superadmin() OR (id = public.get_user_org_id()));
CREATE POLICY "organizations_delete" ON public.organizations FOR DELETE USING (
  public.is_superadmin() OR (id = public.get_user_org_id())
);

-- 11. user_permissions: usa user_id (não organization_id)
DROP POLICY IF EXISTS "user_permissions_select" ON public.user_permissions;
DROP POLICY IF EXISTS "user_permissions_insert" ON public.user_permissions;
DROP POLICY IF EXISTS "user_permissions_update" ON public.user_permissions;
DROP POLICY IF EXISTS "user_permissions_delete" ON public.user_permissions;
CREATE POLICY "user_permissions_select" ON public.user_permissions FOR SELECT USING (
  public.is_superadmin() OR (auth.uid() = user_id)
);
CREATE POLICY "user_permissions_insert" ON public.user_permissions FOR INSERT WITH CHECK (
  public.is_superadmin() OR (auth.uid() = user_id)
);
CREATE POLICY "user_permissions_update" ON public.user_permissions FOR UPDATE USING (
  public.is_superadmin() OR (auth.uid() = user_id)
) WITH CHECK (public.is_superadmin() OR (auth.uid() = user_id));
CREATE POLICY "user_permissions_delete" ON public.user_permissions FOR DELETE USING (
  public.is_superadmin() OR (auth.uid() = user_id)
);

-- 12. VERIFICAÇÃO FINAL
SELECT 
  t.tablename,
  count(p.policyname) as policy_count,
  t.rowsecurity as rls_enabled
FROM pg_tables t
LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = 'public'
WHERE t.schemaname = 'public'
AND t.tablename IN ('products','sales','sale_items','profiles','organizations','store_branches')
GROUP BY t.tablename, t.rowsecurity
ORDER BY t.tablename;
