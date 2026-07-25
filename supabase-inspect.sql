-- ============================================
-- HD-SYSTEM: Script de inspeção completa do Supabase
-- Cole este script no Supabase Dashboard > SQL Editor e clique em "Run"
-- ============================================

-- 1. Listar TODAS as tabelas do schema public
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) as tamanho,
  (SELECT reltuples::bigint FROM pg_class WHERE oid = ('public.' || tablename)::regclass) as estimativa_linhas
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. Estrutura de cada tabela (colunas, tipos, nullable, defaults)
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default,
  character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- 3. Contar linhas em cada tabela
SELECT 'products' as tabela, count(*) as total FROM products
UNION ALL SELECT 'categories', count(*) FROM categories
UNION ALL SELECT 'customers', count(*) FROM customers
UNION ALL SELECT 'suppliers', count(*) FROM suppliers
UNION ALL SELECT 'sales', count(*) FROM sales
UNION ALL SELECT 'sale_items', count(*) FROM sale_items
UNION ALL SELECT 'financial_transactions', count(*) FROM financial_transactions
UNION ALL SELECT 'cash_sessions', count(*) FROM cash_sessions
UNION ALL SELECT 'stock_movements', count(*) FROM stock_movements
UNION ALL SELECT 'store_branches', count(*) FROM store_branches
UNION ALL SELECT 'system_users', count(*) FROM system_users
UNION ALL SELECT 'system_settings', count(*) FROM system_settings
UNION ALL SELECT 'organizations', count(*) FROM organizations;

-- 4. Verificar constraints (PK, FK, UNIQUE)
SELECT
  tc.table_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name as foreign_table,
  ccu.column_name as foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_type;

-- 5. Verificar RLS (Row Level Security) em cada tabela
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_ativado
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 6. Verificar policies RLS
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as operacao,
  qual as using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 7. Verificar triggers
SELECT 
  event_object_table as tabela,
  trigger_name,
  event_manipulation as evento,
  action_timing as momento,
  action_statement as acao
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 8. Verificar funções RPC disponíveis
SELECT 
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- 9. Verificar Realtime: quais tabelas têm REPLICA IDENTITY
SELECT 
  c.relname as tabela,
  CASE c.relreplidentity
    WHEN 'd' THEN 'default'
    WHEN 'n' THEN 'nothing'
    WHEN 'f' THEN 'full'
    WHEN 'i' THEN 'index'
  END as replica_identity
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' 
  AND c.relkind = 'r'
ORDER BY c.relname;

-- 10. Verificar se as tabelas estão habilitadas para Realtime
-- (Supabase usa a função supabase_vault ou publicacao)
SELECT 
  pubname,
  tablename
FROM pg_publication_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 11. Amostra de dados de cada tabela (primeiras 3 linhas)
-- Descomente cada bloco conforme necessário:

-- SELECT * FROM products LIMIT 3;
-- SELECT * FROM categories LIMIT 3;
-- SELECT * FROM customers LIMIT 3;
-- SELECT * FROM suppliers LIMIT 3;
-- SELECT * FROM sales LIMIT 3;
-- SELECT * FROM sale_items LIMIT 3;
-- SELECT * FROM financial_transactions LIMIT 3;
-- SELECT * FROM cash_sessions LIMIT 3;
-- SELECT * FROM stock_movements LIMIT 3;
-- SELECT * FROM store_branches LIMIT 3;
-- SELECT * FROM system_users LIMIT 3;
-- SELECT * FROM system_settings LIMIT 3;
-- SELECT * FROM organizations LIMIT 3;

-- 12. Verificar se existe a tabela organizations (referenciada no código)
-- Se NÃO existir, criar:
-- CREATE TABLE IF NOT EXISTS organizations (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   name TEXT NOT NULL DEFAULT 'HD-System',
--   created_at TIMESTAMPTZ DEFAULT now()
-- );
