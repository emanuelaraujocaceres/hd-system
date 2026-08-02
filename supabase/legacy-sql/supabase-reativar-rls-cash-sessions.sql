-- ==============================================================================
-- REATIVAR RLS CORRETAMENTE em cash_sessions
-- ==============================================================================
-- O problema original (403) era causado por:
--  1. Perfis/branch_users com organization_id errado (todos DEFAULT_ORG_ID)
--  2. A function get_auth_user_org_id() retornando DEFAULT_ORG_ID para todos
--
-- Agora que restauramos as org corretas e corrigimos is_superadmin(), o RLS
-- deve funcionar normalmente: cada usuário vê apenas seus próprios dados.
-- ==============================================================================

BEGIN;

-- 1. Reativar RLS em cash_sessions
SELECT '▶ 1/3 — Reativando RLS em cash_sessions...' AS progresso;
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;

-- 2. Remover TODAS as políticas existentes de cash_sessions
SELECT '▶ 2/3 — Removendo políticas antigas...' AS progresso;
DROP POLICY IF EXISTS "RLS_cash_sessions_select" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_insert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_delete" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_superadmin_select" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_superadmin_insert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_superadmin_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_superadmin_delete" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_select" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_insert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_delete" ON cash_sessions;

-- 3. Criar políticas corretas para usuários comuns (por org)
SELECT '▶ 3/3 — Criando novas políticas RLS org-aware...' AS progresso;

-- SELECT: usuário vê sessões da sua org
CREATE POLICY "RLS_cash_sessions_select" ON cash_sessions
  FOR SELECT
  USING (organization_id = get_auth_user_org_id());

-- INSERT: usuário cria sessão na sua org
CREATE POLICY "RLS_cash_sessions_insert" ON cash_sessions
  FOR INSERT
  WITH CHECK (organization_id = get_auth_user_org_id());

-- UPDATE: usuário altera sessão da sua org
-- Sem WITH CHECK explícito → o USING serve como both OLD e NEW row check
-- Isso evita o problema do WITH CHECK (is_superadmin) que bloqueava usuários comuns
CREATE POLICY "RLS_cash_sessions_update" ON cash_sessions
  FOR UPDATE
  USING (organization_id = get_auth_user_org_id())
  WITH CHECK (organization_id = get_auth_user_org_id());

-- DELETE: usuário deleta sessão da sua org
CREATE POLICY "RLS_cash_sessions_delete" ON cash_sessions
  FOR DELETE
  USING (organization_id = get_auth_user_org_id());

-- Superadmin: acesso irrestrito (SELECT, INSERT, UPDATE, DELETE)
-- Com WITH CHECK (true) que NÃO bloqueia usuários comuns no AND
CREATE POLICY "RLS_cash_sessions_admin_select" ON cash_sessions
  FOR SELECT
  USING (public.is_superadmin());

CREATE POLICY "RLS_cash_sessions_admin_insert" ON cash_sessions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "RLS_cash_sessions_admin_update" ON cash_sessions
  FOR UPDATE
  USING (public.is_superadmin())
  WITH CHECK (true);

CREATE POLICY "RLS_cash_sessions_admin_delete" ON cash_sessions
  FOR DELETE
  USING (public.is_superadmin());

-- Diagnóstico
SELECT '=== POLÍTICAS ===' AS info;
SELECT schemaname, policyname, cmd, qual, with_check
FROM pg_policies WHERE tablename = 'cash_sessions' ORDER BY policyname;

SELECT '=== SESSÕES ===' AS info;
SELECT id::text, organization_id::text, status, operator_name, total_sales_cash
FROM cash_sessions ORDER BY opened_at DESC;

COMMIT;

SELECT '✅ RLS ATIVADO CORRETAMENTE.
Limpe cache + F5 + teste.' AS progresso;
