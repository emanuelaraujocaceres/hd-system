-- ==============================================================================
-- VERIFICAR REALTIME - Tabelas sincronizadas
-- ==============================================================================

-- 1. Verificar publicação supabase_realtime
SELECT * FROM pg_publication WHERE pubname = 'supabase_realtime';

-- 2. Verificar tabelas na publicação
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;

-- 3. Verificar REPLICA IDENTITY das tabelas
SELECT tablename, relreplident FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public' AND tablename IN ('tables', 'products', 'sales', 'financial_transactions')
ORDER BY tablename;

-- 4. Verificar dados da tabela tables
SELECT id, name, number, status, store_branch_id, organization_id FROM tables ORDER BY created_at DESC;

-- 5. Contar mesas por filial
SELECT store_branch_id, count(*) as total_mesas FROM tables GROUP BY store_branch_id;
