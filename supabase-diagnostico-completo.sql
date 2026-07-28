-- ================================================================
-- DIAGNOSTICO COMPLETO — Versao resiliente (nao da erro)
-- Cole TUDO no SQL Editor, rode, e copie os resultados pra mim
-- ================================================================

-- ============================================================
-- 1. ESTRUTURA DE TODAS AS TABELAS DO SCHEMA PUBLIC
-- ============================================================
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- ============================================================
-- 2. LISTA DE TODAS AS TABELAS EXISTENTES + CONTAGEM
-- ============================================================
SELECT 
    t.table_name,
    (xpath('/row/cnt/text()', 
        query_to_xml('SELECT count(*) as cnt FROM ' || quote_ident(t.table_name), false, true, '')
    ))[1]::text::bigint as total_registros
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;

-- ============================================================
-- 3. TODAS AS FUNCOES EXISTENTES
-- ============================================================
SELECT 
    p.proname as funcao,
    pg_catalog.pg_get_function_identity_arguments(p.oid) as assinatura,
    CASE p.prokind 
        WHEN 'f' THEN 'FUNCTION'
        WHEN 'p' THEN 'PROCEDURE'
    END as tipo,
    l.lanname as linguagem
FROM pg_proc p
JOIN pg_language l ON p.prolang = l.oid
WHERE p.pronamespace = 'public'::regnamespace
ORDER BY p.proname;

-- ============================================================
-- 4. TODOS OS TRIGGERS
-- ============================================================
SELECT 
    t.tgname as trigger_name,
    c.relname as tabela,
    CASE t.tgenabled 
        WHEN 'O' THEN 'ORIGINS'
        WHEN 'D' THEN 'DISABLED'
        WHEN 'R' THEN 'REPLICA'
        WHEN 'A' THEN 'ALWAYS'
    END as status
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

-- ============================================================
-- 5. TODAS AS VIEWS
-- ============================================================
SELECT viewname
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;

-- ============================================================
-- 6. POLICIES RLS
-- ============================================================
SELECT 
    tablename,
    policyname,
    cmd as operacao
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================================
-- 7. RLS ATIVADO POR TABELA
-- ============================================================
SELECT 
    c.relname as tabela,
    c.relrowseecurity as rls_ativo
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- ============================================================
-- 8. AMOSTRA: products (primeiras 5 linhas)
-- ============================================================
SELECT id, name, stock_quantity, organization_id 
FROM products 
LIMIT 5;

-- ============================================================
-- 9. AMOSTRA: stock_movements (primeiras 5 linhas)
-- ============================================================
SELECT id, product_id, type, quantity, previous_stock, new_stock 
FROM stock_movements 
LIMIT 5;

-- ============================================================
-- 10. QUais tabelas NAO existem (das que esperavamos)
-- ============================================================
SELECT 'movimentacoes_falhas' as tabela_procurada,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'movimentacoes_falhas' AND table_schema = 'public') as existe
UNION ALL SELECT 'stock_change_log', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_change_log' AND table_schema = 'public')
UNION ALL SELECT 'sync_queue', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'sync_queue' AND table_schema = 'public')
UNION ALL SELECT 'reconciliation_log', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'reconciliation_log' AND table_schema = 'public')
UNION ALL SELECT 'backup_products_emergencia', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'backup_products_emergencia' AND table_schema = 'public')
UNION ALL SELECT 'backup_sales_emergencia', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'backup_sales_emergencia' AND table_schema = 'public')
UNION ALL SELECT 'backup_stock_movements_emergencia', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'backup_stock_movements_emergencia' AND table_schema = 'public')
UNION ALL SELECT 'backup_metadata', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'backup_metadata' AND table_schema = 'public');
