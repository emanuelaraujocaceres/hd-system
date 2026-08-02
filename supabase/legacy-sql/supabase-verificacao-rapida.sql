-- ==============================================================================
-- VERIFICAÇÃO RÁPIDA — HD-System ERP/PDV
-- ==============================================================================
-- Apenas SELECTs, não modifica nada no banco.
-- Execute no SQL Editor do Supabase Dashboard.
-- ==============================================================================

-- 1. TABELAS EXISTENTES
SELECT '1. TABELAS' AS secao;
SELECT tablename AS tabela,
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) AS tamanho
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'backup_%'
ORDER BY tablename;

-- 2. RLS ATIVO
SELECT '2. RLS ATIVO' AS secao;
SELECT relname AS tabela, relrowsecurity AS rls_ativo
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r'
  AND relname NOT LIKE 'backup_%'
ORDER BY relname;

-- 3. FUNÇÕES RPC
SELECT '3. FUNÇÕES RPC' AS secao;
SELECT p.proname AS funcao,
  pg_get_function_arguments(p.oid) AS parametros,
  CASE WHEN p.prorettype = 0 THEN 'TRIGGER' ELSE 'FUNCTION' END AS tipo
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_auth_user_org_id', 'is_superadmin', 'get_is_superadmin',
    'admin_fetch_organizations', 'admin_fetch_branches', 'admin_fetch_users',
    'admin_create_organization', 'admin_add_user',
    'ajustar_estoque', 'process_sale_transaction',
    'fn_insserir_dlq', 'check_stock_consistency',
    'fn_update_updated_at', 'fn_prevent_negative_stock',
    'fn_sync_product_name'
  )
ORDER BY p.proname;

-- 4. FOREIGN KEYS
SELECT '4. FOREIGN KEYS' AS secao;
SELECT conname AS constraint_name,
  conrelid::regclass AS tabela_origem,
  confrelid::regclass AS tabela_destino
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace
ORDER BY conname;

-- 5. ÍNDICES
SELECT '5. ÍNDICES' AS secao;
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname NOT LIKE '%pkey%'
ORDER BY tablename, indexname;

-- 6. TRIGGERS ATIVOS
SELECT '6. TRIGGERS' AS secao;
SELECT tgname AS trigger_name, tgrelid::regclass AS tabela
FROM pg_trigger
WHERE tgname IN (
  'trg_products_updated_at', 'trg_store_branches_updated_at',
  'trg_customers_updated_at', 'trg_suppliers_updated_at',
  'trg_sales_updated_at', 'trg_system_users_updated_at',
  'trg_stock_not_negative',
  'trg_sync_product_name'
)
ORDER BY tgname;

-- 7. CONTAGEM DE REGISTROS POR TABELA
SELECT '7. REGISTROS POR TABELA' AS secao;
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

-- 8. SUPERADMIN
SELECT '8. SUPERADMIN' AS secao;
SELECT email, name, role, superadmin FROM system_users WHERE superadmin = TRUE;

-- 9. ORGANIZAÇÕES
SELECT '9. ORGANIZAÇÕES' AS secao;
SELECT id, name, created_at FROM organizations ORDER BY created_at DESC;

-- 10. VERIFICAÇÃO DE DUPLICATAS
SELECT '10. DUPLICATAS' AS secao;
SELECT 'sale_items' AS tabela,
  COUNT(*) - COUNT(DISTINCT (sale_id, product_id)) AS duplicatas
FROM sale_items;

-- 11. STOCK MOVEMENTS — conferir se há resquícios da trigger
SELECT '11. STOCK MOVEMENTS DA TRIGGER' AS secao;
SELECT reason, COUNT(*)
FROM stock_movements
WHERE reason = 'Ajuste automático (trigger)'
GROUP BY reason;
