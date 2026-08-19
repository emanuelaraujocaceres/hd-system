-- ============================================================
-- DIAGNÓSTICO COMPLETO: RLS Policies + Realtime + Grants
-- Execute no Supabase SQL Editor e veja os resultados
-- ============================================================

-- 1. Todas as RLS policies (tabela, policy name, comando, who, usando, check)
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- 2. Todas as tabelas com RLS habilitado
SELECT
  relname AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r'
ORDER BY relname;

-- 3. Tabelas na publicação Realtime
SELECT
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- 4. REPLICA IDENTITY de cada tabela (precisa ser FULL pra UPDATE/DELETE payload)
SELECT
  c.relname AS table_name,
  CASE c.relreplidentity
    WHEN 'd' THEN 'default'
    WHEN 'n' THEN 'nothing'
    WHEN 'f' THEN 'full'
    WHEN 'i' THEN 'index'
  END AS replica_identity
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
ORDER BY c.relname;

-- 5. GRANTs para anon (o que o cardápio público pode acessar)
SELECT
  grantee,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
ORDER BY table_name, privilege_type;

-- 6. GRANTs para authenticated
SELECT
  grantee,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated'
  AND table_schema = 'public'
ORDER BY table_name, privilege_type;

-- 7. Verificar se alguma tabela NÃO tem RLS habilitado (perigoso!)
SELECT
  c.relname AS table_name,
  '⚠️ RLS DESABILITADO' AS status
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;

-- 8. Verificar tabelas sem nenhuma policy (RLS habilitado mas vazio = bloqueia tudo)
SELECT
  c.relname AS table_name,
  '⚠️ RLS HABILITADO SEM POLICIES' AS status
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = c.relname
  )
ORDER BY c.relname;

-- 9. Verificar tabelas na Realtime que NÃO existem (código referencia mas banco não tem)
SELECT
  p.pubname,
  p.tablename,
  '⚠️ TABELA NA REALTIME' AS info
FROM pg_publication_tables p
WHERE p.pubname = 'supabase_realtime'
ORDER BY p.tablename;
