-- =====================================================================
-- FIX 2026-08-19: Verificação COMPLETA de policies (1 query auto-contida)
-- Execute como UMA ÚNICA query no Supabase SQL Editor
-- =====================================================================

-- 1. TABLES FALTANDO policies org_branch (SELECT/INSERT/UPDATE/DELETE com org+branch)
WITH all_tables AS (
  SELECT relname AS name
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relkind = 'r'
),
tables_with_org_branch AS (
  SELECT DISTINCT tablename
  FROM pg_policies
  WHERE schemaname = 'public'
    AND qual LIKE '%organization_id%'
    AND qual LIKE '%store_branch_id%'
)
SELECT 'FALTANDO org_branch' AS status, a.name AS tabela
FROM all_tables a
LEFT JOIN tables_with_org_branch t ON a.name = t.tablename
WHERE t.tablename IS NULL
  AND a.name NOT IN ('organizations', 'system_users', 'auth_users')
  AND a.name NOT LIKE 'pg_%'
  AND a.name NOT LIKE 'sql_%'
ORDER BY a.name;

-- 2. TABLES COM policies org_branch (conferência)
WITH all_tables AS (
  SELECT relname AS name
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relkind = 'r'
),
tables_with_org_branch AS (
  SELECT DISTINCT tablename
  FROM pg_policies
  WHERE schemaname = 'public'
    AND qual LIKE '%organization_id%'
    AND qual LIKE '%store_branch_id%'
)
SELECT 'TEM org_branch' AS status, a.name AS tabela
FROM all_tables a
JOIN tables_with_org_branch t ON a.name = t.tablename
ORDER BY a.name;