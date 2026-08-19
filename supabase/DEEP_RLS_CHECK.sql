-- CHECK COMPLETO: tabelas em TODOS os schemas + policies permissivas
-- Execute no Supabase SQL Editor

-- 1. Tabelas em schemas que NÃO são public (auth, storage, etc.)
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  AND schemaname != 'public'
ORDER BY schemaname, tablename;

-- 2. Policies com USING (true) — acesso público total!
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
  AND qual = 'true'
ORDER BY tablename, policyname;

-- 3. Policies com WITH CHECK (true) — qualquer um pode INSERT/UPDATE
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND with_check = 'true'
ORDER BY tablename, policyname;

-- 4. Tabelas public SEM nenhuma policy (RLS enabled mas sem policies = acesso negado a todos)
SELECT
  t.tablename
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
WHERE t.schemaname = 'public'
  AND p.policyname IS NULL
ORDER BY t.tablename;

-- 5. Todas as tabelas com roles = 'public' (anon + authenticated)
SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND 'public' = ANY(roles)
  AND (qual = 'true' OR with_check = 'true')
ORDER BY tablename, policyname;

-- 6. Busca textual por "USING (true)" em policies (catch-all)
SELECT
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    qual LIKE '%true%'
    OR with_check LIKE '%true%'
  )
ORDER BY tablename, policyname;
