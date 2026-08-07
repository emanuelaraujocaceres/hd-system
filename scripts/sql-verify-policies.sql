-- ============================================================
-- VERIFICAÇÃO DE POLICIES (colunas CORRETAS do pg_policies)
-- ============================================================
SELECT 
  tablename,
  policyname,
  cmd,
  qual AS "USING_expr",
  with_check AS "CHECK_expr"
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- Status RLS por tabela
SELECT 
  tablename, 
  rowsecurity AS "RLS_enabled",
  (SELECT count(*) FROM pg_policies WHERE tablename = pg_tables.tablename AND schemaname='public') AS "policy_count"
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Helper functions
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('is_superadmin','get_user_org_id','get_user_branch_id','get_user_role');
