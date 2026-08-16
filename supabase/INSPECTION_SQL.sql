-- ============================================================
-- HD-SYSTEM: SQL DE INSPEÇÃO DO SUPABASE
-- Execute cada bloco separadamente no SQL Editor do Supabase
-- e cole as respostas para análise.
-- ============================================================

-- ── BLOCO 1: Listar todas as tabelas e status RLS ──────────
-- Usa pg_class para ver relrowsecurity (mais confiável que pg_tables)
SELECT
  n.nspname AS schema,
  c.relname AS tablename,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- ── BLOCO 2: Listar todas as policies RLS ──────────────────
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,    -- 'PERMISSIVE' or 'RESTRICTIVE'
  roles,         -- roles that the policy applies to
  cmd,           -- ALL, SELECT, INSERT, UPDATE, DELETE
  qual,          -- USING expression
  with_check     -- WITH CHECK expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ── BLOCO 3: Publicações Realtime ──────────────────────────
SELECT
  pubname,
  puballtables,
  pubinsert,
  pubupdate,
  pubdelete,
  pubtruncate
FROM pg_publication;

-- Tabelas na publicação realtime
SELECT
  n.nspname AS schema,
  c.relname AS table_name,
  p.pubname AS publication_name
FROM pg_publication p
JOIN pg_publication_rel pr ON pr.prpubid = p.oid
JOIN pg_class c ON c.oid = pr.prrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relname;

-- ── BLOCO 4: Colunas organization_id e store_branch_id ────
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('organization_id', 'store_branch_id')
ORDER BY table_name, column_name;

-- ── BLOCO 5: Funções auxiliares RLS ───────────────────────
SELECT
  routine_name,
  routine_type,
  data_type AS return_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'is_superadmin',
    'get_user_org_id',
    'get_user_branch_id',
    'get_user_role',
    'get_current_organization',
    'auth.uid',
    'auth.role'
  )
ORDER BY routine_name;

-- ── BLOCO 6: Triggers relevantes ──────────────────────────
SELECT
  event_object_table AS table_name,
  trigger_name,
  event_manipulation AS event_type,  -- INSERT, UPDATE, DELETE
  action_timing,                      -- BEFORE, AFTER
  action_orientation                  -- ROW, STATEMENT
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ── BLOCO 7: Estado atual de usuários ─────────────────────
-- Lista id, email, role, organization_id, store_branch_id
-- Identifica usuários com filial nula ou inválida
SELECT
  id,
  name,
  email,
  role,
  organization_id,
  store_branch_id,
  active,
  CASE
    WHEN store_branch_id IS NULL THEN '⚠️ SEM FILIAL'
    ELSE '✅ OK'
  END AS branch_status
FROM system_users
ORDER BY organization_id, role, name;

-- ── BLOCO 8: Estado atual de filiais ──────────────────────
-- Lista id, name, organization_id, city, is_headquarters
SELECT
  sb.id,
  sb.name,
  sb.code,
  sb.city,
  sb.state,
  sb.organization_id,
  sb.is_headquarters,
  sb.active,
  o.name AS org_name,
  CASE
    WHEN sb.organization_id IS NULL THEN '⚠️ SEM ORG'
    ELSE '✅ OK'
  END AS org_status
FROM store_branches sb
LEFT JOIN organizations o ON o.id = sb.organization_id
ORDER BY sb.organization_id, sb.name;

-- ── BLOCO 9: Constraints e índices relevantes ─────────────
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')
  AND tc.table_name IN (
    'system_users', 'store_branches', 'organizations',
    'products', 'categories', 'sales', 'sale_items',
    'customer_sessions', 'customers', 'delivery_orders',
    'credit_payments', 'financial_transactions', 'tables'
  )
ORDER BY tc.table_name, tc.constraint_type;

-- ── BLOCO 10: Contagem de registros por tabela ────────────
-- Ajuda a entender o estado atual dos dados
SELECT
  'organizations' AS tbl, COUNT(*) AS cnt FROM organizations
UNION ALL SELECT 'store_branches', COUNT(*) FROM store_branches
UNION ALL SELECT 'system_users', COUNT(*) FROM system_users
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'categories', COUNT(*) FROM categories
UNION ALL SELECT 'sales', COUNT(*) FROM sales
UNION ALL SELECT 'sale_items', COUNT(*) FROM sale_items
UNION ALL SELECT 'customer_sessions', COUNT(*) FROM customer_sessions
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'delivery_orders', COUNT(*) FROM delivery_orders
UNION ALL SELECT 'credit_payments', COUNT(*) FROM credit_payments
UNION ALL SELECT 'financial_transactions', COUNT(*) FROM financial_transactions
UNION ALL SELECT 'tables', COUNT(*) FROM tables
UNION ALL SELECT 'printers', COUNT(*) FROM printers
UNION ALL SELECT 'api_keys', COUNT(*) FROM api_keys
UNION ALL SELECT 'footer_messages', COUNT(*) FROM footer_messages
UNION ALL SELECT 'media_devices', COUNT(*) FROM media_devices
UNION ALL SELECT 'nf_records', COUNT(*) FROM nf_records
UNION ALL SELECT 'scanned_boletos', COUNT(*) FROM scanned_boletos
ORDER BY tbl;

-- ── BLOCO 11: Verificar colunas da tabela system_users ────
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'system_users'
ORDER BY ordinal_position;

-- ── BLOCO 12: Verificar colunas da tabela store_branches ──
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'store_branches'
ORDER BY ordinal_position;
