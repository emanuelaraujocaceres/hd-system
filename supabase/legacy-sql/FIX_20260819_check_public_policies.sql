-- =====================================================================
-- CHECK 2026-08-19: Policies {public} que NÃO usam is_superadmin()
-- Execute como UMA ÚNICA query no Supabase SQL Editor
-- =====================================================================

SELECT
  p.tablename AS tabela,
  p.policyname AS policy,
  p.cmd AS comando,
  p.roles AS roles,
  p.qual AS using_expr,
  p.with_check AS with_check_expr
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.roles @> '{"public"}'
  AND p.cmd != 'ALL'
  AND p.policyname NOT LIKE 'superadmin_all_%'
  AND (
    p.qual NOT LIKE '%is_superadmin%' OR p.qual IS NULL
  )
ORDER BY p.tablename, p.policyname;