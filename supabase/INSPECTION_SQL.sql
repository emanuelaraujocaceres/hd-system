-- ============================================================
-- HD-SYSTEM: SQL DE INSPEÇÃO COMPLETA DO SUPABASE
-- Execute cada bloco separadamente no SQL Editor do Supabase
-- e cole as respostas para análise.
-- ============================================================

-- ── BLOCO 1: Listar todas as tabelas e status RLS ──────────
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
  permissive,
  roles,
  cmd,
  qual,
  with_check
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
    'get_current_organization'
  )
ORDER BY routine_name;

-- ── BLOCO 6: Triggers relevantes ──────────────────────────
SELECT
  event_object_table AS table_name,
  trigger_name,
  event_manipulation AS event_type,
  action_timing,
  action_orientation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ── BLOCO 7: Estado atual de usuários ─────────────────────
SELECT
  id,
  name,
  email,
  role,
  superadmin,
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
UNION ALL SELECT 'suppliers', COUNT(*) FROM suppliers
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements
UNION ALL SELECT 'cash_sessions', COUNT(*) FROM cash_sessions
UNION ALL SELECT 'digital_menu_config', COUNT(*) FROM digital_menu_config
UNION ALL SELECT 'branch_themes', COUNT(*) FROM branch_themes
UNION ALL SELECT 'module_visibility', COUNT(*) FROM module_visibility
UNION ALL SELECT 'product_lots', COUNT(*) FROM product_lots
UNION ALL SELECT 'stock_loss_log', COUNT(*) FROM stock_loss_log
UNION ALL SELECT 'delivery_settings', COUNT(*) FROM delivery_settings
UNION ALL SELECT 'delivery_neighborhoods', COUNT(*) FROM delivery_neighborhoods
UNION ALL SELECT 'delivery_distance_rates', COUNT(*) FROM delivery_distance_rates
ORDER BY tbl;

-- ── BLOCO 11: Colunas da tabela system_users ──────────────
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'system_users'
ORDER BY ordinal_position;

-- ── BLOCO 12: Colunas da tabela store_branches ────────────
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'store_branches'
ORDER BY ordinal_position;

-- ════════════════════════════════════════════════════════════
-- BLOCOS NOVOS (adição desta sessão)
-- ════════════════════════════════════════════════════════════

-- ── BLOCO 13: Tabelas SEM RLS habilitado que têm org/branch ─
-- Lista tabelas com organization_id ou store_branch_id mas SEM RLS
SELECT
  c.relname AS tablename,
  c.relrowsecurity AS rls_enabled,
  CASE WHEN c.relrowsecurity THEN '✅ RLS ATIVO' ELSE '🔴 SEM RLS' END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
  AND (
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = c.relname AND column_name = 'organization_id')
    OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = c.relname AND column_name = 'store_branch_id')
  )
ORDER BY c.relname;

-- ── BLOCO 14: Policies com USING (true) — vulnerabilidade ──
-- Qualquer policy com qual = 'true' (acesso irrestrito)
SELECT
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true')
ORDER BY tablename, policyname;

-- ── BLOCO 15: Órfãos — usuários sem org ou branch válidos ───
-- system_users com organization_id que não existe em organizations
SELECT
  su.id,
  su.name,
  su.email,
  su.role,
  su.organization_id,
  su.store_branch_id,
  'ORG INVÁLIDA' AS problema
FROM system_users su
LEFT JOIN organizations o ON o.id = su.organization_id
WHERE su.organization_id IS NOT NULL
  AND o.id IS NULL

UNION ALL

-- system_users com store_branch_id que não existe em store_branches
SELECT
  su.id,
  su.name,
  su.email,
  su.role,
  su.organization_id,
  su.store_branch_id,
  'BRANCH INVÁLIDA' AS problema
FROM system_users su
LEFT JOIN store_branches sb ON sb.id = su.store_branch_id
WHERE su.store_branch_id IS NOT NULL
  AND sb.id IS NULL

ORDER BY problema, name;

-- ── BLOCO 16: Filiais com organization_id nulo ─────────────
SELECT
  id, name, code, organization_id, active
FROM store_branches
WHERE organization_id IS NULL
ORDER BY name;

-- ── BLOCO 17: Superadmin emanuel@gmail.com — verificar registro ─
SELECT
  id,
  name,
  email,
  role,
  superadmin,
  organization_id,
  store_branch_id,
  active,
  CASE
    WHEN superadmin = true AND organization_id IS NULL THEN '✅ SUPERADMIN GLOBAL (RLS bypass ativo)'
    WHEN superadmin = true AND organization_id IS NOT NULL THEN '⚠️ SUPERADMIN COM ORG (RLS bypass NÃO funciona via is_superadmin())'
    ELSE '❌ NÃO É SUPERADMIN'
  END AS rls_status
FROM system_users
WHERE email ILIKE '%emanuel%' OR superadmin = true
ORDER BY superadmin DESC, email;

-- ── BLOCO 18: sale_items — verificar colunas ───────────────
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sale_items'
ORDER BY ordinal_position;

-- ── BLOCO 19: Todas as tabelas com RLS e policy count ──────
-- Resumo: quantas policies cada tabela tem
SELECT
  c.relname AS tablename,
  c.relrowsecurity AS rls_enabled,
  COUNT(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;

-- ── BLOCO 20: Verificar sync_queue e tabelas auxiliares ─────
-- Verifica se tabelas auxiliares existem e têm RLS
SELECT
  c.relname AS tablename,
  c.relrowsecurity AS rls_enabled,
  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = c.relname AND column_name = 'organization_id') THEN '✅ org_id'
    ELSE '❌ sem org_id'
  END AS has_org,
  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = c.relname AND column_name = 'store_branch_id') THEN '✅ branch_id'
    ELSE '❌ sem branch_id'
  END AS has_branch
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'sync_queue', 'product_recipes', 'webhook_events',
    'movimentacoes_falhas', 'filial_backups', 'ai_insights',
    'sessions', 'user_permissions', 'company_settings',
    'pix_config', 'stock_change_log', 'profiles',
    'delivery_worker_earnings', 'sale_items'
  )
ORDER BY c.relname;

-- ── BLOCO 21: Listar TODAS as tabelas do schema public ──────
-- Para descobrir tabelas não mapeadas
SELECT
  c.relname AS tablename,
  c.relrowsecurity AS rls_enabled,
  (SELECT COUNT(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- ── BLOCO 22: Verificar Views com SECURITY DEFINER/INVOKER ─
SELECT
  viewname,
  definition
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;

-- ── BLOCO 23: Funções SECURITY DEFINER ─────────────────────
-- Funções que rodam com privilégios do owner (bypassam RLS)
SELECT
  routine_name,
  routine_type,
  security_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND security_type = 'DEFINER'
ORDER BY routine_name;
