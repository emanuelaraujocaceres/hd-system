-- ==============================================================================
-- 20260809_rls_isolation_phase2.sql
-- Phase 2: Policies REAIS de isolamento (branch/org scoped)
--
-- DEPENDE: Phase 1 (RL ativado + policies permissivas) já aplicada
-- Após esta migration, o acesso ao banco é restringido por:
--   - auth.uid() → user autenticado
--   - profiles.store_branch_id → filial do user
--   - profiles.organization_id → org do user
--   - profiles.role → admin vs collaborator
--
-- Regras:
--   admin: vê/escreve tudo da SUA organization
--   collaborator: vê/escreve tudo da SUA filial
--   superadmin (role=admin + org=null): vê TUDO
--
-- INSTRUÇÕES: aplicar via SQL Editor após Phase 1
-- ==============================================================================

-- Helper: função para detectar superadmin (org = null)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.organization_id IS NULL
  );
$$ LANGUAGE SQL STABLE;

-- Helper: organization_id do user logado
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

-- Helper: store_branch_id do user logado
CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID AS $$
  SELECT store_branch_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

-- Helper: role do user logado
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

-- Helper: admin ve todas as filiais da org
CREATE OR REPLACE FUNCTION public.user_branch_filter()
RETURNS UUID AS $$
  SELECT
    CASE
      WHEN public.is_superadmin() THEN NULL  -- superadmin: sem filtro
      WHEN public.get_user_role() = 'admin' THEN NULL  -- admin: filtra por org, não por filial
      ELSE public.get_user_branch_id()  -- collaborator: filtra por filial
    END;
$$ LANGUAGE SQL STABLE;

-- ==============================================================================
-- Políticas por tabela
-- ==============================================================================

-- 1. products (branch-scoped)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_r" ON public.products;
DROP POLICY IF EXISTS "products_a" ON public.products;
DROP POLICY IF EXISTS "products_u" ON public.products;
DROP POLICY IF EXISTS "products_d" ON public.products;

CREATE POLICY "products_r" ON public.products FOR SELECT
  USING (
    is_superadmin()
    OR (get_user_role() = 'admin' AND organization_id = get_user_org_id())
    OR (store_branch_id = get_user_branch_id())
  );
CREATE POLICY "products_a" ON public.products FOR INSERT
  WITH CHECK (
    is_superadmin()
    OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL))
    OR (store_branch_id = get_user_branch_id())
  );
CREATE POLICY "products_u" ON public.products FOR UPDATE
  USING (
    is_superadmin()
    OR (get_user_role() = 'admin' AND organization_id = get_user_org_id())
    OR (store_branch_id = get_user_branch_id())
  ) WITH CHECK (
    is_superadmin()
    OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL))
    OR (store_branch_id = get_user_branch_id())
  );
CREATE POLICY "products_d" ON public.products FOR DELETE
  USING (
    is_superadmin()
    OR (get_user_role() = 'admin' AND organization_id = get_user_org_id())
    OR (store_branch_id = get_user_branch_id())
  );

-- 2. categories (branch-scoped)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categories_r" ON public.categories;
DROP POLICY IF EXISTS "categories_a" ON public.categories;
DROP POLICY IF EXISTS "categories_u" ON public.categories;
DROP POLICY IF EXISTS "categories_d" ON public.categories;

CREATE POLICY "categories_r" ON public.categories FOR SELECT
  USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "categories_a" ON public.categories FOR INSERT
  WITH CHECK (is_superadmin() OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL)) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "categories_u" ON public.categories FOR UPDATE USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id())) WITH CHECK (is_superadmin() OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL)) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "categories_d" ON public.categories FOR DELETE
  USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id()));

-- 3. sales (branch-scoped) - MESMA LÓGICA QUE products
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales_r" ON public.sales;
DROP POLICY IF EXISTS "sales_a" ON public.sales;
DROP POLICY IF EXISTS "sales_u" ON public.sales;
DROP POLICY IF EXISTS "sales_d" ON public.sales;

CREATE POLICY "sales_r" ON public.sales FOR SELECT
  USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "sales_a" ON public.sales FOR INSERT
  WITH CHECK (is_superadmin() OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL)) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "sales_u" ON public.sales FOR UPDATE USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id())) WITH CHECK (is_superadmin() OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL)) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "sales_d" ON public.sales FOR DELETE
  USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id()));

-- 4. sale_items (branch-scoped)
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sale_items_r" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_a" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_u" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_d" ON public.sale_items;

CREATE POLICY "sale_items_r" ON public.sale_items FOR SELECT USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "sale_items_a" ON public.sale_items FOR INSERT WITH CHECK (is_superadmin() OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL)) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "sale_items_u" ON public.sale_items FOR UPDATE USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id())) WITH CHECK (is_superadmin() OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL)) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "sale_items_d" ON public.sale_items FOR DELETE USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id()));

-- 5. financial_transactions (branch-scoped)
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "financial_transactions_r" ON public.financial_transactions;
DROP POLICY IF EXISTS "financial_transactions_a" ON public.financial_transactions;
DROP POLICY IF EXISTS "financial_transactions_u" ON public.financial_transactions;
DROP POLICY IF EXISTS "financial_transactions_d" ON public.financial_transactions;

CREATE POLICY "financial_transactions_r" ON public.financial_transactions FOR SELECT USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "financial_transactions_a" ON public.financial_transactions FOR INSERT WITH CHECK (is_superadmin() OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL)) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "financial_transactions_u" ON public.financial_transactions FOR UPDATE USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id())) WITH CHECK (is_superadmin() OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL)) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "financial_transactions_d" ON public.financial_transactions FOR DELETE USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id()));

-- 6. cash_sessions (branch-scoped)
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cash_sessions_r" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_a" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_u" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_d" ON public.cash_sessions;

CREATE POLICY "cash_sessions_r" ON public.cash_sessions FOR SELECT USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "cash_sessions_a" ON public.cash_sessions FOR INSERT WITH CHECK (is_superadmin() OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL)) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "cash_sessions_u" ON public.cash_sessions FOR UPDATE USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id())) WITH CHECK (is_superadmin() OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL)) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "cash_sessions_d" ON public.cash_sessions FOR DELETE USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id()));

-- 7. stock_movements (branch-scoped)
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_movements_r" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_a" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_u" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_d" ON public.stock_movements;

CREATE POLICY "stock_movements_r" ON public.stock_movements FOR SELECT USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "stock_movements_a" ON public.stock_movements FOR INSERT WITH CHECK (is_superadmin() OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL)) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "stock_movements_u" ON public.stock_movements FOR UPDATE USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id())) WITH CHECK (is_superadmin() OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL)) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "stock_movements_d" ON public.stock_movements FOR DELETE USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id()));

-- 8. store_branches (org-scoped) - admins veem todas as filiais da org
ALTER TABLE public.store_branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_branches_r" ON public.store_branches;
DROP POLICY IF EXISTS "store_branches_a" ON public.store_branches;
DROP POLICY IF EXISTS "store_branches_u" ON public.store_branches;
DROP POLICY IF EXISTS "store_branches_d" ON public.store_branches;

CREATE POLICY "store_branches_r" ON public.store_branches FOR SELECT USING (is_superadmin() OR (organization_id = get_user_org_id()));
CREATE POLICY "store_branches_a" ON public.store_branches FOR INSERT WITH CHECK (is_superadmin() OR (organization_id = get_user_org_id()));
CREATE POLICY "store_branches_u" ON public.store_branches FOR UPDATE USING (is_superadmin() OR (organization_id = get_user_org_id())) WITH CHECK (is_superadmin() OR (organization_id = get_user_org_id()));
CREATE POLICY "store_branches_d" ON public.store_branches FOR DELETE USING (is_superadmin() OR (organization_id = get_user_org_id()));

-- 9. system_users (org-scoped)
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "system_users_r" ON public.system_users;
DROP POLICY IF EXISTS "system_users_a" ON public.system_users;
DROP POLICY IF EXISTS "system_users_u" ON public.system_users;
DROP POLICY IF EXISTS "system_users_d" ON public.system_users;

CREATE POLICY "system_users_r" ON public.system_users FOR SELECT USING (is_superadmin() OR (organization_id = get_user_org_id()));
CREATE POLICY "system_users_a" ON public.system_users FOR INSERT WITH CHECK (is_superadmin() OR (organization_id = get_user_org_id()));
CREATE POLICY "system_users_u" ON public.system_users FOR UPDATE USING (is_superadmin() OR (organization_id = get_user_org_id())) WITH CHECK (is_superadmin() OR (organization_id = get_user_org_id()));
CREATE POLICY "system_users_d" ON public.system_users FOR DELETE USING (is_superadmin() OR (organization_id = get_user_org_id()));

-- 10. system_settings (org-scoped)
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "system_settings_r" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_a" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_u" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_d" ON public.system_settings;

CREATE POLICY "system_settings_r" ON public.system_settings FOR SELECT USING (is_superadmin() OR (organization_id = get_user_org_id()));
CREATE POLICY "system_settings_a" ON public.system_settings FOR INSERT WITH CHECK (is_superadmin() OR (organization_id = get_user_org_id()));
CREATE POLICY "system_settings_u" ON public.system_settings FOR UPDATE USING (is_superadmin() OR (organization_id = get_user_org_id())) WITH CHECK (is_superadmin() OR (organization_id = get_user_org_id()));
CREATE POLICY "system_settings_d" ON public.system_settings FOR DELETE USING (is_superadmin() OR (organization_id = get_user_org_id()));

-- 11. profiles (org-scoped para admin, filial-scoped para collaborator)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_r" ON public.profiles;
DROP POLICY IF EXISTS "profiles_a" ON public.profiles;
DROP POLICY IF EXISTS "profiles_u" ON public.profiles;
DROP POLICY IF EXISTS "profiles_d" ON public.profiles;

CREATE POLICY "profiles_r" ON public.profiles FOR SELECT USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (id = auth.uid()));
CREATE POLICY "profiles_a" ON public.profiles FOR INSERT WITH CHECK (is_superadmin() OR (organization_id = get_user_org_id()));
CREATE POLICY "profiles_u" ON public.profiles FOR UPDATE USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (id = auth.uid())) WITH CHECK (is_superadmin() OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL)) OR (id = auth.uid()));
CREATE POLICY "profiles_d" ON public.profiles FOR DELETE USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()));

-- 12. organizations (admin ve a org inteira; collaborator não vê orgs)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "organizations_r" ON public.organizations;
DROP POLICY IF EXISTS "organizations_a" ON public.organizations;
DROP POLICY IF EXISTS "organizations_u" ON public.organizations;
DROP POLICY IF EXISTS "organizations_d" ON public.organizations;

CREATE POLICY "organizations_r" ON public.organizations FOR SELECT USING (is_superadmin() OR (id = get_user_org_id()));
CREATE POLICY "organizations_a" ON public.organizations FOR INSERT WITH CHECK (is_superadmin() OR (id = get_user_org_id()));
CREATE POLICY "organizations_u" ON public.organizations FOR UPDATE USING (is_superadmin() OR (id = get_user_org_id())) WITH CHECK (is_superadmin() OR (id = get_user_org_id()));
CREATE POLICY "organizations_d" ON public.organizations FOR DELETE USING (is_superadmin() OR (id = get_user_org_id()));

-- 13. financial_accounts (org-scoped)
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "financial_accounts_r" ON public.financial_accounts;
DROP POLICY IF EXISTS "financial_accounts_a" ON public.financial_accounts;
DROP POLICY IF EXISTS "financial_accounts_u" ON public.financial_accounts;
DROP POLICY IF EXISTS "financial_accounts_d" ON public.financial_accounts;

CREATE POLICY "financial_accounts_r" ON public.financial_accounts FOR SELECT USING (is_superadmin() OR (organization_id = get_user_org_id()));
CREATE POLICY "financial_accounts_a" ON public.financial_accounts FOR INSERT WITH CHECK (is_superadmin() OR (organization_id = get_user_org_id()));
CREATE POLICY "financial_accounts_u" ON public.financial_accounts FOR UPDATE USING (is_superadmin() OR (organization_id = get_user_org_id())) WITH CHECK (is_superadmin() OR (organization_id = get_user_org_id()));
CREATE POLICY "financial_accounts_d" ON public.financial_accounts FOR DELETE USING (is_superadmin() OR (organization_id = get_user_org_id()));

-- 14. caixa_sessions (branch-scoped)
ALTER TABLE public.caixa_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "caixa_sessions_r" ON public.caixa_sessions;
DROP POLICY IF EXISTS "caixa_sessions_a" ON public.caixa_sessions;
DROP POLICY IF EXISTS "caixa_sessions_u" ON public.caixa_sessions;
DROP POLICY IF EXISTS "caixa_sessions_d" ON public.caixa_sessions;

CREATE POLICY "caixa_sessions_r" ON public.caixa_sessions FOR SELECT USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "caixa_sessions_a" ON public.caixa_sessions FOR INSERT WITH CHECK (is_superadmin() OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL)) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "caixa_sessions_u" ON public.caixa_sessions FOR UPDATE USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id())) WITH CHECK (is_superadmin() OR (get_user_role() = 'admin' AND (organization_id = get_user_org_id() OR organization_id IS NULL)) OR (store_branch_id = get_user_branch_id()));
CREATE POLICY "caixa_sessions_d" ON public.caixa_sessions FOR DELETE USING (is_superadmin() OR (get_user_role() = 'admin' AND organization_id = get_user_org_id()) OR (store_branch_id = get_user_branch_id()));

-- ==============================================================================
-- Tabelas de frente (TV, impressora, etc.) — org-scoped + branch-scoped
-- ==============================================================================

-- Helper para tabelas de frente (org-scoped)
CREATE OR REPLACE FUNCTION public.apply_org_policies(p_table TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_r" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_a" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_u" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_d" ON public.%I', p_table, p_table);
  EXECUTE format('CREATE POLICY "%s_r" ON public.%I FOR SELECT USING (is_superadmin() OR (organization_id = get_user_org_id()))', p_table, p_table);
  EXECUTE format('CREATE POLICY "%s_a" ON public.%I FOR INSERT WITH CHECK (is_superadmin() OR (organization_id = get_user_org_id()))', p_table, p_table);
  EXECUTE format('CREATE POLICY "%s_u" ON public.%I FOR UPDATE USING (is_superadmin() OR (organization_id = get_user_org_id())) WITH CHECK (is_superadmin() OR (organization_id = get_user_org_id()))', p_table, p_table);
  EXECUTE format('CREATE POLICY "%s_d" ON public.%I FOR DELETE USING (is_superadmin() OR (organization_id = get_user_org_id()))', p_table, p_table);
END;
$$ LANGUAGE PL_pgSQL;

-- 15-27: aplicar org-scoped policies via helper
SELECT public.apply_org_policies('scanned_boletos');
SELECT public.apply_org_policies('credit_payments');
SELECT public.apply_org_policies('nf_records');
SELECT public.apply_org_policies('footer_messages');
SELECT public.apply_org_policies('media_devices');
SELECT public.apply_org_policies('printers');
SELECT public.apply_org_policies('tables');
SELECT public.apply_org_policies('customer_sessions');
SELECT public.apply_org_policies('digital_menu_config');
SELECT public.apply_org_policies('branch_themes');
SELECT public.apply_org_policies('api_keys');

-- ================================================== STATUS
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN (
    'products','sale_items','sales','profiles','store_branches','organizations'
  ) LOOP
    RAISE NOTICE '✅ %: policies aplicadas', r.tablename;
  END LOOP;
END $$;
