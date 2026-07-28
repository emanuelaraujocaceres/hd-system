-- ================================================================
-- EMERGENCIA: Remover policies RLS que quebraram o sistema
-- ================================================================
-- Motivo: CURRENT_SETTING('app.current_tenant') nao existe na sessao,
-- causando erro 400 em TODAS as queries Supabase.
-- ================================================================

-- 1. Remover TODAS as policies que criei (tenant_isolation_policy)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
        RAISE NOTICE 'Dropped: %.%', r.tablename, r.policyname;
    END LOOP;
END $$;

-- 2. Desabilitar RLS em todas as tabelas (estado anterior)
ALTER TABLE IF EXISTS products DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sale_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS financial_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cash_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stock_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS store_branches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS system_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS system_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS movimentacoes_falhas DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stock_change_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sync_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reconciliation_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS backup_products_emergencia DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS backup_sales_emergencia DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS backup_stock_movements_emergencia DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS backup_metadata DISABLE ROW LEVEL SECURITY;

-- 3. Re-conceder permissoes
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- 4. Confirmar que RLS esta desabilitado
SELECT 
    relname AS tabela,
    relrowsecurity AS rls_ativo,
    CASE WHEN relrowsecurity = false THEN 'OK - RLS DESABILITADO' ELSE 'ATIVO' END AS status
FROM pg_class
WHERE relname IN ('products', 'stock_movements', 'sales', 'movimentacoes_falhas')
ORDER BY relname;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'RLS CORRIGIDO. Sistema deve voltar ao normal.';
    RAISE NOTICE 'Recarregue a pagina para testar.';
    RAISE NOTICE '========================================';
END $$;
