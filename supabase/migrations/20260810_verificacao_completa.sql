-- ==============================================================================
-- VERIFICAÇÃO COMPLETA DO SUPABASE
-- Execute cada bloco separadamente no SQL Editor
-- ==============================================================================

-- 1. VERIFICAR TODAS AS TABELAS E SEUS SCHEMAS
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- 2. VERIFICAR RLS ATIVO EM TODAS AS TABELAS
SELECT 
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 3. VERIFICAR POLÍTICAS DE SEGURANÇA
SELECT 
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- 4. VERIFICAR PUBLICAÇÃO REALTIME
SELECT 
  pubname,
  puballtables,
  pubinsert,
  pubupdate,
  pubdelete
FROM pg_publication
WHERE pubname = 'supabase_realtime';

-- 5. VERIFICAR TABELAS NA PUBLICAÇÃO
SELECT 
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- 6. VERIFICAR REPLICA IDENTITY
SELECT 
  tablename,
  relreplident
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public'
ORDER BY tablename;

-- 7. VERIFICAR HELPER FUNCTIONS
SELECT 
  routine_name,
  data_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('is_superadmin', 'get_user_org_id', 'get_user_branch_id', 'get_user_role')
ORDER BY routine_name;

-- 8. VERIFICAR DADOS DE CADA TABELA (contagem)
SELECT 'profiles' as tabela, count(*) as total FROM profiles
UNION ALL
SELECT 'organizations', count(*) FROM organizations
UNION ALL
SELECT 'store_branches', count(*) FROM store_branches
UNION ALL
SELECT 'products', count(*) FROM products
UNION ALL
SELECT 'categories', count(*) FROM categories
UNION ALL
SELECT 'customers', count(*) FROM customers
UNION ALL
SELECT 'suppliers', count(*) FROM suppliers
UNION ALL
SELECT 'sales', count(*) FROM sales
UNION ALL
SELECT 'sale_items', count(*) FROM sale_items
UNION ALL
SELECT 'financial_transactions', count(*) FROM financial_transactions
UNION ALL
SELECT 'cash_sessions', count(*) FROM cash_sessions
UNION ALL
SELECT 'stock_movements', count(*) FROM stock_movements
UNION ALL
SELECT 'credit_payments', count(*) FROM credit_payments
UNION ALL
SELECT 'scanned_boletos', count(*) FROM scanned_boletos
UNION ALL
SELECT 'nf_records', count(*) FROM nf_records
UNION ALL
SELECT 'footer_messages', count(*) FROM footer_messages
UNION ALL
SELECT 'media_devices', count(*) FROM media_devices
UNION ALL
SELECT 'printers', count(*) FROM printers
UNION ALL
SELECT 'tables', count(*) FROM tables
UNION ALL
SELECT 'customer_sessions', count(*) FROM customer_sessions
UNION ALL
SELECT 'digital_menu_config', count(*) FROM digital_menu_config
UNION ALL
SELECT 'branch_themes', count(*) FROM branch_themes
UNION ALL
SELECT 'api_keys', count(*) FROM api_keys
UNION ALL
SELECT 'sync_queue', count(*) FROM sync_queue
UNION ALL
SELECT 'movimentacoes_falhas', count(*) FROM movimentacoes_falhas
UNION ALL
SELECT 'ai_insights', count(*) FROM ai_insights
UNION ALL
SELECT 'company_settings', count(*) FROM company_settings
UNION ALL
SELECT 'stock_change_log', count(*) FROM stock_change_log
UNION ALL
SELECT 'sessions', count(*) FROM sessions
UNION ALL
SELECT 'user_permissions', count(*) FROM user_permissions
ORDER BY tabela;

-- 9. VERIFICAR ISOLAMENTO POR FILIAL (profiles)
SELECT 
  p.id,
  p.name,
  p.email,
  p.role,
  p.organization_id,
  p.store_branch_id,
  b.name as branch_name
FROM profiles p
LEFT JOIN store_branches b ON b.id = p.store_branch_id
ORDER BY p.organization_id, p.store_branch_id;

-- 10. VERIFICAR ISOLAMENTO POR FILIAL (financial_transactions)
SELECT 
  ft.id,
  ft.description,
  ft.amount,
  ft.type,
  ft.store_branch_id,
  b.name as branch_name
FROM financial_transactions ft
LEFT JOIN store_branches b ON b.id = ft.store_branch_id
ORDER BY ft.store_branch_id, ft.created_at DESC
LIMIT 20;

-- 11. VERIFICAR ISOLAMENTO POR FILIAL (sales)
SELECT 
  s.id,
  s.code,
  s.total,
  s.status,
  s.store_branch_id,
  b.name as branch_name
FROM sales s
LEFT JOIN store_branches b ON b.id = s.store_branch_id
ORDER BY s.store_branch_id, s.created_at DESC
LIMIT 20;

-- 12. VERIFICAR RECORRÊNCIAS/PARCELAS (financial_transactions)
SELECT 
  id,
  description,
  is_recurring,
  is_installment,
  recurrence_type,
  recurrence_count,
  installment_number,
  store_branch_id
FROM financial_transactions
WHERE is_recurring = true OR is_installment = true
ORDER BY created_at DESC;

-- 13. VERIFICAR CREDIT PAYMENTS
SELECT 
  cp.id,
  cp.sale_id,
  cp.customer_id,
  cp.amount,
  cp.paid_at,
  cp.store_branch_id,
  b.name as branch_name
FROM credit_payments cp
LEFT JOIN store_branches b ON b.id = cp.store_branch_id
ORDER BY cp.paid_at DESC
LIMIT 20;

-- 14. VERIFICAR CASH SESSIONS
SELECT 
  cs.id,
  cs.status,
  cs.opening_balance,
  cs.current_cash_balance,
  cs.store_branch_id,
  b.name as branch_name,
  cs.opened_at
FROM cash_sessions cs
LEFT JOIN store_branches b ON b.id = cs.store_branch_id
ORDER BY cs.opened_at DESC
LIMIT 10;

-- 15. VERIFICAR ORGANIZATIONS E FILIAIS
SELECT 
  o.id as org_id,
  o.name as org_name,
  b.id as branch_id,
  b.name as branch_name,
  b.code,
  b.city,
  b.state,
  b.is_headquarters
FROM organizations o
LEFT JOIN store_branches b ON b.organization_id = o.id
ORDER BY o.id, b.is_headquarters DESC;

-- 16. VERIFICAR PRODUTOS COM ESTOQUE
SELECT 
  p.id,
  p.name,
  p.cost_price,
  p.sale_price,
  p.current_stock,
  p.min_stock,
  p.store_branch_id,
  b.name as branch_name
FROM products p
LEFT JOIN store_branches b ON b.id = p.store_branch_id
ORDER BY p.store_branch_id, p.name
LIMIT 20;

-- 17. VERIFICAR CATEGORIAS
SELECT 
  c.id,
  c.name,
  c.color,
  c.store_branch_id,
  b.name as branch_name
FROM categories c
LEFT JOIN store_branches b ON b.id = c.store_branch_id
ORDER BY c.store_branch_id, c.name;

-- 18. VERIFICAR CUSTOMERS
SELECT 
  cu.id,
  cu.name,
  cu.cpf_cnpj,
  cu.credit_limit,
  cu.current_balance,
  cu.store_branch_id,
  b.name as branch_name
FROM customers cu
LEFT JOIN store_branches b ON b.id = cu.store_branch_id
ORDER BY cu.store_branch_id, cu.name
LIMIT 20;

-- 19. VERIFICAR TRIGGERS
SELECT 
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 20. VERIFICAR INDEXES
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
