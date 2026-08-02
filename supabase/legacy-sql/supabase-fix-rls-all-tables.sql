-- ==============================================================================
-- CORREÇÃO EMERGENCIAL: Desabilitar RLS em TODAS as tabelas do sistema
-- ==============================================================================
-- Motivo: As políticas RLS recriadas (supabase-reativar-rls-cash-sessions.sql e
-- similares) ainda causam 403 para usuários comuns ao inserir/atualizar dados.
-- O processo de sync do hd-system faz upserts em múltiplas tabelas e TODAS
-- precisam estar acessíveis para o fluxo funcionar.
--
-- Abordagem:
-- 1. Remover TODAS as políticas RLS existentes
-- 2. Desabilitar RLS em todas as tabelas do sistema
-- 3. Manter segurança via application-level (o hd-system já filtra por org)
-- ==============================================================================

BEGIN;

-- ================================================================
-- 1. LISTAR POLÍTICAS ATUAIS (diagnóstico)
-- ================================================================
SELECT '=== POLÍTICAS ATUAIS ===' AS info;
SELECT schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ================================================================
-- 2. REMOVER TODAS AS POLÍTICAS RLS
-- ================================================================
SELECT '▶ Removendo todas as políticas RLS...' AS progresso;

-- cash_sessions
DROP POLICY IF EXISTS "RLS_cash_sessions_select" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_insert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_delete" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_select" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_insert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_delete" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_upsert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_insert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_delete" ON cash_sessions;

-- sales
DROP POLICY IF EXISTS "RLS_sales_select" ON sales;
DROP POLICY IF EXISTS "RLS_sales_insert" ON sales;
DROP POLICY IF EXISTS "RLS_sales_update" ON sales;
DROP POLICY IF EXISTS "RLS_sales_delete" ON sales;
DROP POLICY IF EXISTS "RLS_sales_admin_select" ON sales;
DROP POLICY IF EXISTS "RLS_sales_admin_insert" ON sales;
DROP POLICY IF EXISTS "RLS_sales_admin_update" ON sales;
DROP POLICY IF EXISTS "RLS_sales_admin_delete" ON sales;
DROP POLICY IF EXISTS "RLS_sales_self" ON sales;

-- sale_items
DROP POLICY IF EXISTS "RLS_sale_items_select" ON sale_items;
DROP POLICY IF EXISTS "RLS_sale_items_insert" ON sale_items;
DROP POLICY IF EXISTS "RLS_sale_items_update" ON sale_items;
DROP POLICY IF EXISTS "RLS_sale_items_delete" ON sale_items;
DROP POLICY IF EXISTS "RLS_sale_items_admin_select" ON sale_items;

-- financial_transactions
DROP POLICY IF EXISTS "RLS_financial_select" ON financial_transactions;
DROP POLICY IF EXISTS "RLS_financial_insert" ON financial_transactions;
DROP POLICY IF EXISTS "RLS_financial_update" ON financial_transactions;
DROP POLICY IF EXISTS "RLS_financial_delete" ON financial_transactions;
DROP POLICY IF EXISTS "RLS_financial_admin" ON financial_transactions;

-- stock_movements
DROP POLICY IF EXISTS "RLS_stock_movements_select" ON stock_movements;
DROP POLICY IF EXISTS "RLS_stock_movements_insert" ON stock_movements;
DROP POLICY IF EXISTS "RLS_stock_movements_update" ON stock_movements;
DROP POLICY IF EXISTS "RLS_stock_movements_delete" ON stock_movements;
DROP POLICY IF EXISTS "RLS_stock_movements_admin" ON stock_movements;

-- products
DROP POLICY IF EXISTS "RLS_products_select" ON products;
DROP POLICY IF EXISTS "RLS_products_insert" ON products;
DROP POLICY IF EXISTS "RLS_products_update" ON products;
DROP POLICY IF EXISTS "RLS_products_delete" ON products;
DROP POLICY IF EXISTS "RLS_products_admin" ON products;

-- categories
DROP POLICY IF EXISTS "RLS_categories_select" ON categories;
DROP POLICY IF EXISTS "RLS_categories_insert" ON categories;
DROP POLICY IF EXISTS "RLS_categories_update" ON categories;
DROP POLICY IF EXISTS "RLS_categories_delete" ON categories;

-- customers
DROP POLICY IF EXISTS "RLS_customers_select" ON customers;
DROP POLICY IF EXISTS "RLS_customers_insert" ON customers;
DROP POLICY IF EXISTS "RLS_customers_update" ON customers;
DROP POLICY IF EXISTS "RLS_customers_delete" ON customers;

-- suppliers
DROP POLICY IF EXISTS "RLS_suppliers_select" ON suppliers;
DROP POLICY IF EXISTS "RLS_suppliers_insert" ON suppliers;
DROP POLICY IF EXISTS "RLS_suppliers_update" ON suppliers;
DROP POLICY IF EXISTS "RLS_suppliers_delete" ON suppliers;

-- store_branches
DROP POLICY IF EXISTS "RLS_branches_select" ON store_branches;
DROP POLICY IF EXISTS "RLS_branches_insert" ON store_branches;
DROP POLICY IF EXISTS "RLS_branches_update" ON store_branches;
DROP POLICY IF EXISTS "RLS_branches_delete" ON store_branches;

-- system_users
DROP POLICY IF EXISTS "RLS_users_select" ON system_users;
DROP POLICY IF EXISTS "RLS_users_insert" ON system_users;
DROP POLICY IF EXISTS "RLS_users_update" ON system_users;
DROP POLICY IF EXISTS "RLS_users_delete" ON system_users;

-- system_settings
DROP POLICY IF EXISTS "RLS_settings_select" ON system_settings;
DROP POLICY IF EXISTS "RLS_settings_insert" ON system_settings;
DROP POLICY IF EXISTS "RLS_settings_update" ON system_settings;
DROP POLICY IF EXISTS "RLS_settings_delete" ON system_settings;

-- stock_change_log
DROP POLICY IF EXISTS "RLS_stock_change_log_insert" ON stock_change_log;
DROP POLICY IF EXISTS "RLS_stock_change_log_update" ON stock_change_log;
DROP POLICY IF EXISTS "RLS_stock_change_log_delete" ON stock_change_log;
DROP POLICY IF EXISTS "RLS_stock_change_log_select" ON stock_change_log;

-- movimentacoes_falhas
DROP POLICY IF EXISTS "RLS_movimentacoes_falhas_delete" ON movimentacoes_falhas;

SELECT '✅ Todas as políticas removidas' AS resultado;

-- ================================================================
-- 3. DESABILITAR RLS EM TODAS AS TABELAS
-- ================================================================
SELECT '▶ Desabilitando RLS em todas as tabelas...' AS progresso;

ALTER TABLE cash_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE store_branches DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_change_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes_falhas DISABLE ROW LEVEL SECURITY;

-- ================================================================
-- 4. DIAGNÓSTICO FINAL
-- ================================================================
SELECT '=== STATUS FINAL ===' AS info;
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

SELECT '=== RESTANTE DE POLÍTICAS ===' AS info;
SELECT COUNT(*) AS total_policies_remaining
FROM pg_policies
WHERE schemaname = 'public';

COMMIT;

SELECT '✅ RLS DESABILITADO EM TODAS AS TABELAS.
Limpe cache + F5 + teste.

⚠️  Esta é uma correção emergencial. Para reativar RLS com políticas
corretas, use o arquivo supabase-corrigir-rls-definitivo.sql (que precisa
ser atualizado para não forçar organization_id errado nas cash_sessions).' AS progresso;
