-- ============================================================
-- VERIFICAÇÃO PÓS-RLS: Execute bloco a bloco no SQL Editor
-- Cada bloco mostra um resultado. Cole aqui para análise.
-- ============================================================

-- ── 1. Superadmin record ──
-- organization_id DEVE ser NULL para is_superadmin() retornar true
SELECT id, email, organization_id, store_branch_id, superadmin, role
FROM public.system_users
WHERE email = 'emanuel@gmail.com';

-- ── 2. Helper functions existem? ──
-- Devem aparecer: is_superadmin, get_user_org_id, get_user_branch_id, get_user_role, set_current_branch
SELECT proname, proargtypes::regtype[] AS arg_types
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('is_superadmin', 'get_user_org_id', 'get_user_branch_id', 'get_user_role', 'set_current_branch')
ORDER BY proname;

-- ── 3. Testar is_superadmin() ──
-- Deve retornar true (com a sessão do superadmin logado)
SELECT public.is_superadmin();

-- ── 4. Testar get_user_branch_id() ──
-- Deve retornar o store_branch_id do superadmin
SELECT public.get_user_branch_id();

-- ── 5. Testar set_current_branch() ──
-- Troque o UUID abaixo por uma filial real e execute
-- SELECT public.set_current_branch('UUID_DA_FILIAL_AQUI');
-- Depois teste:
-- SELECT current_setting('app.current_branch_id', true);

-- ── 6. Contagem de policies por tabela ──
-- Todas as tabelas principais devem ter >= 5 policies (superadmin + 4 CRUD)
SELECT
  schemaname,
  tablename,
  COUNT(*) AS policy_count,
  STRING_AGG(policyname, ', ' ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

-- ── 7. Tabelas SEM policies (RLS habilitado mas vazio = PERIGO) ──
-- Devem retornar apenas tabelas auxiliares sem colunas de org/branch
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = c.relname
  )
ORDER BY c.relname;

-- ── 8. Policies permissivas com USING (true) — VULNERABILIDADE ──
-- Devem retornar 0 linhas (nenhuma policy com USING (true))
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND qual = 'true'
ORDER BY tablename, policyname;

-- ── 9. Todas as tabelas com RLS ──
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relrowsecurity DESC, c.relname;

-- ── 10. Verificar search_path das helper functions ──
-- Todas devem ter search_path = public
SELECT p.proname, p.proconfig
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('is_superadmin', 'get_user_org_id', 'get_user_branch_id', 'get_user_role', 'set_current_branch')
ORDER BY p.proname;
