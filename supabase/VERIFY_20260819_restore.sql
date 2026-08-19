-- ══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO PÓS-RESTORE — policies admin/collaborator
-- Execute no Supabase SQL Editor e veja o resultado abaixo
-- ══════════════════════════════════════════════════════════════

-- 1. Contar policies por tabela afetada
SELECT
  tablename,
  count(*) AS total_policies,
  array_agg(policyname ORDER BY policyname) AS policy_names
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('system_users', 'organizations', 'system_settings', 'profiles')
GROUP BY tablename
ORDER BY tablename;

-- 2. Listar todas as policies de system_users (deve ter 7)
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'system_users'
ORDER BY policyname;

-- 3. Listar todas as policies de organizations (deve ter 3)
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'organizations'
ORDER BY policyname;

-- 4. Listar todas as policies de system_settings (deve ter 3)
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'system_settings'
ORDER BY policyname;

-- 5. Listar todas as policies de profiles (deve ter 4)
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;

-- 6. Verificar que get_auth_user_org_id foi removida
SELECT proname, proowner::regrole
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_auth_user_org_id', 'get_user_org_id')
ORDER BY proname;

-- 7. Contagem geral — tabelas com apenas superadmin policy
SELECT
  tablename,
  count(*) AS total,
  count(CASE WHEN policyname LIKE 'superadmin_all_%' THEN 1 END) AS superadmin_only
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
HAVING count(*) = count(CASE WHEN policyname LIKE 'superadmin_all_%' THEN 1 END)
ORDER BY tablename;
