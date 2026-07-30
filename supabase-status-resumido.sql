-- ==============================================================================
-- VERIFICAÇÃO RESUMIDA — status do banco pós-correção
-- ==============================================================================
-- Apenas SELECTs, não modifica nada.
-- Mostra: RPCs, triggers, contagem de registros, duplicatas.
-- ==============================================================================

-- 1. FUNÇÕES RPC
SELECT '1. FUNÇÕES RPC' AS secao;
SELECT p.proname AS funcao,
  pg_get_function_arguments(p.oid) AS parametros
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'ajustar_estoque', 'process_sale_transaction',
    'fn_insserir_dlq', 'check_stock_consistency',
    'fn_update_updated_at', 'fn_prevent_negative_stock',
    'fn_sync_product_name',
    'get_auth_user_org_id', 'is_superadmin', 'get_is_superadmin',
    'admin_fetch_organizations', 'admin_fetch_branches', 'admin_fetch_users',
    'admin_create_organization', 'admin_add_user'
  )
ORDER BY p.proname;

-- 2. TRIGGERS ATIVAS
SELECT '2. TRIGGERS ATIVAS' AS secao;
SELECT tgname AS trigger_name, tgrelid::regclass AS tabela
FROM pg_trigger
WHERE tgname IN (
  'trg_products_updated_at', 'trg_store_branches_updated_at',
  'trg_customers_updated_at', 'trg_suppliers_updated_at',
  'trg_sales_updated_at', 'trg_system_users_updated_at',
  'trg_stock_not_negative', 'trg_sync_product_name'
)
ORDER BY tgname;

-- 3. CONTAGEM DE REGISTROS
SELECT '3. REGISTROS POR TABELA' AS secao;
SELECT 'products' AS tabela, COUNT(*) FROM products
UNION ALL SELECT 'categories', COUNT(*) FROM categories
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'suppliers', COUNT(*) FROM suppliers
UNION ALL SELECT 'sales', COUNT(*) FROM sales
UNION ALL SELECT 'sale_items', COUNT(*) FROM sale_items
UNION ALL SELECT 'financial_transactions', COUNT(*) FROM financial_transactions
UNION ALL SELECT 'cash_sessions', COUNT(*) FROM cash_sessions
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements
UNION ALL SELECT 'store_branches', COUNT(*) FROM store_branches
UNION ALL SELECT 'system_users', COUNT(*) FROM system_users
UNION ALL SELECT 'system_settings', COUNT(*) FROM system_settings
UNION ALL SELECT 'organizations', COUNT(*) FROM organizations
UNION ALL SELECT 'movimentacoes_falhas', COUNT(*) FROM movimentacoes_falhas
ORDER BY tabela;

-- 4. DUPLICATAS EM SALE_ITEMS
SELECT '4. DUPLICATAS EM SALE_ITEMS' AS secao;
SELECT COUNT(*) - COUNT(DISTINCT (sale_id, product_id)) AS duplicatas
FROM sale_items;
