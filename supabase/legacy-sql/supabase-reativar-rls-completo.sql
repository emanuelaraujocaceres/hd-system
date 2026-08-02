-- =============================================================
-- supabase-reativar-rls-completo.sql
-- Re-enables RLS with proper policies on all tables.
-- Run this AFTER ensuring:
--   1. get_auth_user_org_id() has email-JWT fallback
--   2. is_superadmin() works correctly
--   3. All historical data has correct organization_id values
-- =============================================================

BEGIN;

-- =============================================================
-- STEP 1: Drop ALL existing RLS policies (clean slate)
-- =============================================================
SELECT '1/4: Removendo políticas RLS existentes...' AS progresso;

-- organizations
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_organizations_select" ON organizations;
  DROP POLICY IF EXISTS "RLS_organizations_superadmin" ON organizations;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- store_branches
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_store_branches_select" ON store_branches;
  DROP POLICY IF EXISTS "RLS_store_branches_insert" ON store_branches;
  DROP POLICY IF EXISTS "RLS_store_branches_update" ON store_branches;
  DROP POLICY IF EXISTS "RLS_store_branches_delete" ON store_branches;
  DROP POLICY IF EXISTS "RLS_store_branches_superadmin" ON store_branches;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- products
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_products_select" ON products;
  DROP POLICY IF EXISTS "RLS_products_insert" ON products;
  DROP POLICY IF EXISTS "RLS_products_update" ON products;
  DROP POLICY IF EXISTS "RLS_products_delete" ON products;
  DROP POLICY IF EXISTS "RLS_products_superadmin" ON products;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- categories
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_categories_select" ON categories;
  DROP POLICY IF EXISTS "RLS_categories_insert" ON categories;
  DROP POLICY IF EXISTS "RLS_categories_update" ON categories;
  DROP POLICY IF EXISTS "RLS_categories_delete" ON categories;
  DROP POLICY IF EXISTS "RLS_categories_superadmin" ON categories;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- customers
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_customers_select" ON customers;
  DROP POLICY IF EXISTS "RLS_customers_insert" ON customers;
  DROP POLICY IF EXISTS "RLS_customers_update" ON customers;
  DROP POLICY IF EXISTS "RLS_customers_delete" ON customers;
  DROP POLICY IF EXISTS "RLS_customers_superadmin" ON customers;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- suppliers
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_suppliers_select" ON suppliers;
  DROP POLICY IF EXISTS "RLS_suppliers_insert" ON suppliers;
  DROP POLICY IF EXISTS "RLS_suppliers_update" ON suppliers;
  DROP POLICY IF EXISTS "RLS_suppliers_delete" ON suppliers;
  DROP POLICY IF EXISTS "RLS_suppliers_superadmin" ON suppliers;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- sales
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_sales_select" ON sales;
  DROP POLICY IF EXISTS "RLS_sales_insert" ON sales;
  DROP POLICY IF EXISTS "RLS_sales_update" ON sales;
  DROP POLICY IF EXISTS "RLS_sales_delete" ON sales;
  DROP POLICY IF EXISTS "RLS_sales_superadmin" ON sales;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- sale_items
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_sale_items_select" ON sale_items;
  DROP POLICY IF EXISTS "RLS_sale_items_insert" ON sale_items;
  DROP POLICY IF EXISTS "RLS_sale_items_update" ON sale_items;
  DROP POLICY IF EXISTS "RLS_sale_items_delete" ON sale_items;
  DROP POLICY IF EXISTS "RLS_sale_items_superadmin" ON sale_items;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- financial_transactions
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_financial_select" ON financial_transactions;
  DROP POLICY IF EXISTS "RLS_financial_insert" ON financial_transactions;
  DROP POLICY IF EXISTS "RLS_financial_update" ON financial_transactions;
  DROP POLICY IF EXISTS "RLS_financial_delete" ON financial_transactions;
  DROP POLICY IF EXISTS "RLS_financial_superadmin" ON financial_transactions;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- cash_sessions
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_cash_sessions_select" ON cash_sessions;
  DROP POLICY IF EXISTS "RLS_cash_sessions_insert" ON cash_sessions;
  DROP POLICY IF EXISTS "RLS_cash_sessions_update" ON cash_sessions;
  DROP POLICY IF EXISTS "RLS_cash_sessions_delete" ON cash_sessions;
  DROP POLICY IF EXISTS "RLS_cash_sessions_superadmin" ON cash_sessions;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- stock_movements
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_stock_movements_select" ON stock_movements;
  DROP POLICY IF EXISTS "RLS_stock_movements_insert" ON stock_movements;
  DROP POLICY IF EXISTS "RLS_stock_movements_update" ON stock_movements;
  DROP POLICY IF EXISTS "RLS_stock_movements_delete" ON stock_movements;
  DROP POLICY IF EXISTS "RLS_stock_movements_superadmin" ON stock_movements;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- system_users
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_system_users_select" ON system_users;
  DROP POLICY IF EXISTS "RLS_system_users_insert" ON system_users;
  DROP POLICY IF EXISTS "RLS_system_users_update" ON system_users;
  DROP POLICY IF EXISTS "RLS_system_users_delete" ON system_users;
  DROP POLICY IF EXISTS "RLS_system_users_superadmin" ON system_users;
  DROP POLICY IF EXISTS "RLS_system_users_self_insert" ON system_users;
  DROP POLICY IF EXISTS "RLS_system_users_self_update" ON system_users;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- system_settings
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_system_settings_select" ON system_settings;
  DROP POLICY IF EXISTS "RLS_system_settings_insert" ON system_settings;
  DROP POLICY IF EXISTS "RLS_system_settings_update" ON system_settings;
  DROP POLICY IF EXISTS "RLS_system_settings_delete" ON system_settings;
  DROP POLICY IF EXISTS "RLS_system_settings_superadmin" ON system_settings;
  DROP POLICY IF EXISTS "RLS_system_settings_self_insert" ON system_settings;
  DROP POLICY IF EXISTS "RLS_system_settings_self_update" ON system_settings;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- stock_change_log
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_stock_change_log_select" ON stock_change_log;
  DROP POLICY IF EXISTS "RLS_stock_change_log_insert" ON stock_change_log;
  DROP POLICY IF EXISTS "RLS_stock_change_log_update" ON stock_change_log;
  DROP POLICY IF EXISTS "RLS_stock_change_log_delete" ON stock_change_log;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- movimentacoes_falhas (DLQ)
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_movimentacoes_falhas_select" ON movimentacoes_falhas;
  DROP POLICY IF EXISTS "RLS_movimentacoes_falhas_insert" ON movimentacoes_falhas;
  DROP POLICY IF EXISTS "RLS_movimentacoes_falhas_update" ON movimentacoes_falhas;
  DROP POLICY IF EXISTS "RLS_movimentacoes_falhas_delete" ON movimentacoes_falhas;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- sync_queue
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_sync_queue_select" ON sync_queue;
  DROP POLICY IF EXISTS "RLS_sync_queue_insert" ON sync_queue;
  DROP POLICY IF EXISTS "RLS_sync_queue_update" ON sync_queue;
  DROP POLICY IF EXISTS "RLS_sync_queue_delete" ON sync_queue;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- profiles
DO $$ BEGIN
  DROP POLICY IF EXISTS "RLS_profiles_select" ON profiles;
  DROP POLICY IF EXISTS "RLS_profiles_update" ON profiles;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- =============================================================
-- STEP 2: Re-enable RLS on ALL tables
-- =============================================================
SELECT '2/4: Habilitando RLS em todas as tabelas...' AS progresso;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes_falhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- STEP 3: Create RLS policies for each table
-- =============================================================
SELECT '3/4: Criando políticas RLS por tabela...' AS progresso;

-- ---- ORGANIZATIONS ----
CREATE POLICY "RLS_organizations_select" ON organizations
  FOR SELECT USING (id = get_auth_user_org_id());
CREATE POLICY "RLS_organizations_superadmin" ON organizations
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ---- STORE_BRANCHES ----
CREATE POLICY "RLS_store_branches_select" ON store_branches
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_store_branches_insert" ON store_branches
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_store_branches_update" ON store_branches
  FOR UPDATE USING (organization_id = get_auth_user_org_id())
  WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_store_branches_delete" ON store_branches
  FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_store_branches_superadmin" ON store_branches
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ---- PRODUCTS ----
CREATE POLICY "RLS_products_select" ON products
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_products_insert" ON products
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_products_update" ON products
  FOR UPDATE USING (organization_id = get_auth_user_org_id())
  WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_products_delete" ON products
  FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_products_superadmin" ON products
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ---- CATEGORIES ----
CREATE POLICY "RLS_categories_select" ON categories
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_categories_insert" ON categories
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_categories_update" ON categories
  FOR UPDATE USING (organization_id = get_auth_user_org_id())
  WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_categories_delete" ON categories
  FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_categories_superadmin" ON categories
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ---- CUSTOMERS ----
CREATE POLICY "RLS_customers_select" ON customers
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_customers_insert" ON customers
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_customers_update" ON customers
  FOR UPDATE USING (organization_id = get_auth_user_org_id())
  WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_customers_delete" ON customers
  FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_customers_superadmin" ON customers
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ---- SUPPLIERS ----
CREATE POLICY "RLS_suppliers_select" ON suppliers
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_suppliers_insert" ON suppliers
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_suppliers_update" ON suppliers
  FOR UPDATE USING (organization_id = get_auth_user_org_id())
  WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_suppliers_delete" ON suppliers
  FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_suppliers_superadmin" ON suppliers
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ---- SALES ----
CREATE POLICY "RLS_sales_select" ON sales
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_sales_insert" ON sales
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_sales_update" ON sales
  FOR UPDATE USING (organization_id = get_auth_user_org_id())
  WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_sales_delete" ON sales
  FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_sales_superadmin" ON sales
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ---- SALE_ITEMS ----
-- sale_items inherits org via its parent sale record
CREATE POLICY "RLS_sale_items_select" ON sale_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = get_auth_user_org_id())
  );
CREATE POLICY "RLS_sale_items_insert" ON sale_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = get_auth_user_org_id())
  );
CREATE POLICY "RLS_sale_items_update" ON sale_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = get_auth_user_org_id())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = get_auth_user_org_id())
  );
CREATE POLICY "RLS_sale_items_delete" ON sale_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = get_auth_user_org_id())
  );
CREATE POLICY "RLS_sale_items_superadmin" ON sale_items
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ---- FINANCIAL_TRANSACTIONS ----
CREATE POLICY "RLS_financial_select" ON financial_transactions
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_financial_insert" ON financial_transactions
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_financial_update" ON financial_transactions
  FOR UPDATE USING (organization_id = get_auth_user_org_id())
  WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_financial_delete" ON financial_transactions
  FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_financial_superadmin" ON financial_transactions
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ---- CASH_SESSIONS ----
CREATE POLICY "RLS_cash_sessions_select" ON cash_sessions
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_cash_sessions_insert" ON cash_sessions
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_cash_sessions_update" ON cash_sessions
  FOR UPDATE USING (organization_id = get_auth_user_org_id())
  WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_cash_sessions_delete" ON cash_sessions
  FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_cash_sessions_superadmin" ON cash_sessions
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ---- STOCK_MOVEMENTS ----
CREATE POLICY "RLS_stock_movements_select" ON stock_movements
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_stock_movements_insert" ON stock_movements
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_stock_movements_update" ON stock_movements
  FOR UPDATE USING (organization_id = get_auth_user_org_id())
  WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_stock_movements_delete" ON stock_movements
  FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_stock_movements_superadmin" ON stock_movements
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ---- SYSTEM_USERS ----
-- Users can see their own profile + anyone in their org
CREATE POLICY "RLS_system_users_select" ON system_users
  FOR SELECT USING (
    id = auth.uid() OR organization_id = get_auth_user_org_id()
  );
CREATE POLICY "RLS_system_users_insert" ON system_users
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_users_update" ON system_users
  FOR UPDATE USING (
    id = auth.uid() OR organization_id = get_auth_user_org_id()
  ) WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_users_delete" ON system_users
  FOR DELETE USING (id = auth.uid() OR organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_users_superadmin" ON system_users
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ---- SYSTEM_SETTINGS ----
CREATE POLICY "RLS_system_settings_select" ON system_settings
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_settings_insert" ON system_settings
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_settings_update" ON system_settings
  FOR UPDATE USING (organization_id = get_auth_user_org_id())
  WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_settings_delete" ON system_settings
  FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_settings_superadmin" ON system_settings
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ---- STOCK_CHANGE_LOG ----
CREATE POLICY "RLS_stock_change_log_select" ON stock_change_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = stock_change_log.product_id AND products.organization_id = get_auth_user_org_id())
  );
CREATE POLICY "RLS_stock_change_log_insert" ON stock_change_log
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM products WHERE products.id = stock_change_log.product_id AND products.organization_id = get_auth_user_org_id())
  );
CREATE POLICY "RLS_stock_change_log_update" ON stock_change_log
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = stock_change_log.product_id AND products.organization_id = get_auth_user_org_id())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM products WHERE products.id = stock_change_log.product_id AND products.organization_id = get_auth_user_org_id())
  );
CREATE POLICY "RLS_stock_change_log_delete" ON stock_change_log
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = stock_change_log.product_id AND products.organization_id = get_auth_user_org_id())
  );

-- ---- MOVIMENTACOES_FALHAS (DLQ) ----
CREATE POLICY "RLS_movimentacoes_falhas_select" ON movimentacoes_falhas
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_movimentacoes_falhas_insert" ON movimentacoes_falhas
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_movimentacoes_falhas_update" ON movimentacoes_falhas
  FOR UPDATE USING (organization_id = get_auth_user_org_id())
  WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_movimentacoes_falhas_delete" ON movimentacoes_falhas
  FOR DELETE USING (organization_id = get_auth_user_org_id());

-- ---- SYNC_QUEUE ----
CREATE POLICY "RLS_sync_queue_select" ON sync_queue
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_sync_queue_insert" ON sync_queue
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_sync_queue_update" ON sync_queue
  FOR UPDATE USING (organization_id = get_auth_user_org_id())
  WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_sync_queue_delete" ON sync_queue
  FOR DELETE USING (organization_id = get_auth_user_org_id());

-- ---- PROFILES ----
CREATE POLICY "RLS_profiles_select" ON profiles
  FOR SELECT USING (id = auth.uid() OR organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_profiles_update" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- =============================================================
-- STEP 4: Grant RLS execution permissions
-- =============================================================
SELECT '4/4: Concedendo permissões de execução...' AS progresso;

GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin TO service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin TO anon;

-- =============================================================
-- VERIFICATION
-- =============================================================
SELECT '========================================' AS resultado;
SELECT 'RLS re-enabled on all tables' AS status;
SELECT 'Tables with RLS enabled:' AS info;
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true
ORDER BY tablename;
SELECT '========================================' AS resultado;

COMMIT;
