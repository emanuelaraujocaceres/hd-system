-- ==============================================================================
-- VERIFICAR ESTRUTURA ATUAL DO SUPABASE
-- ==============================================================================

-- 1. Verificar tabela customers (já existe?)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'customers'
ORDER BY ordinal_position;

-- 2. Verificar tabela customer_sessions
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'customer_sessions'
ORDER BY ordinal_position;

-- 3. Verificar se existe tabela crm_*
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'crm%';

-- 4. Verificar tabelas de delivery (devem estar vazias/novas)
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'delivery%';

-- 5. Verificar tabela store_branches (para ver campos de endereço)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'store_branches'
ORDER BY ordinal_position;

-- 6. Verificar tabela system_users (colaboradores)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'system_users'
ORDER BY ordinal_position;

-- 7. Verificar se existe tabela module_visibility
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'module_visibility';

-- 8. Verificar policies da tabela customers
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'customers';
