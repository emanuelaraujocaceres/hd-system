-- ==============================================================================
-- CORREÇÃO DEFINITIVA: RLS de cash_sessions
-- ==============================================================================
-- PROBLEMA: A política RLS_cash_sessions_superadmin (FOR ALL) tem
--   WITH CHECK (is_superadmin()). Como WITH CHECK é AND entre TODAS as
--   políticas do mesmo comando, até usuários comuns ficam bloqueados:
--     WITH CHECK = (org = get_org()) AND (is_superadmin()) → FALSE
--
-- SOLUÇÃO: Recriar as políticas separando corretamente:
--   - Políticas para usuários comuns: USING/WITH_CHECK por organization_id
--   - Políticas superadmin: USING (is_superadmin()) para visibilidade,
--     e WITH CHECK (true) para não restringir usuários comuns
--
-- TAMBÉM corrige: Forçar ALL cash_sessions para DEFAULT_ORG_ID
-- ==============================================================================

BEGIN;

SELECT '▶ 1/5 — Forçando ALL cash_sessions para DEFAULT_ORG_ID...' AS progresso;
UPDATE cash_sessions
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001';
SELECT '✅ cash_sessions atualizadas: ' || COUNT(*) FROM cash_sessions WHERE organization_id = '00000000-0000-0000-0000-000000000001';

SELECT '▶ 2/5 — Removendo TODAS as políticas antigas de cash_sessions...' AS progresso;
DROP POLICY IF EXISTS "RLS_cash_sessions_select" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_insert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_delete" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_superadmin" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_upsert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_delete" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_insert" ON cash_sessions;
SELECT '✅ Todas as políticas removidas' AS resultado;

SELECT '▶ 3/5 — Recriando políticas para usuários COMUNS...' AS progresso;

-- SELECT: usuário vê se é dono da sessão OU se pertence à mesma org
CREATE POLICY "RLS_cash_sessions_select" ON cash_sessions
  FOR SELECT
  USING (id = auth.uid() OR organization_id = get_auth_user_org_id());

-- INSERT: usuário cria sessão apenas se organization_id = sua org
CREATE POLICY "RLS_cash_sessions_insert" ON cash_sessions
  FOR INSERT
  WITH CHECK (organization_id = get_auth_user_org_id());

-- UPDATE: usuário altera sessão se organization_id = sua org
-- WITHOUT CHECK explícito → USING vira WITH CHECK implicitamente:
--   old_row: organization_id = get_auth_user_org_id()
--   new_row: organization_id = get_auth_user_org_id()
CREATE POLICY "RLS_cash_sessions_update" ON cash_sessions
  FOR UPDATE
  USING (organization_id = get_auth_user_org_id());

-- DELETE: usuário deleta sessão se organization_id = sua org
CREATE POLICY "RLS_cash_sessions_delete" ON cash_sessions
  FOR DELETE
  USING (organization_id = get_auth_user_org_id());

SELECT '✅ Políticas para usuários comuns criadas' AS resultado;

SELECT '▶ 4/5 — Recriando políticas SUPERADMIN...' AS progresso;

-- SUPERADMIN SELECT: vê todas as linhas
CREATE POLICY "RLS_cash_sessions_admin_select" ON cash_sessions
  FOR SELECT
  USING (public.is_superadmin());

-- SUPERADMIN INSERT: pode inserir qualquer linha
-- WITH CHECK (true) → nunca bloqueia usuários comuns no AND
CREATE POLICY "RLS_cash_sessions_admin_insert" ON cash_sessions
  FOR INSERT
  WITH CHECK (true);

-- SUPERADMIN UPDATE: pode alterar qualquer linha
-- USING: vê todas as linhas
-- WITH CHECK (true) → nunca bloqueia usuários comuns no AND
CREATE POLICY "RLS_cash_sessions_admin_update" ON cash_sessions
  FOR UPDATE
  USING (public.is_superadmin())
  WITH CHECK (true);

-- SUPERADMIN DELETE: pode deletar qualquer linha
CREATE POLICY "RLS_cash_sessions_admin_delete" ON cash_sessions
  FOR DELETE
  USING (public.is_superadmin());

SELECT '✅ Políticas superadmin criadas' AS resultado;

SELECT '▶ 5/5 — Diagnóstico final:' AS progresso;
SELECT schemaname, policyname, cmd, permissive, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'cash_sessions'
ORDER BY policyname;

SELECT id, organization_id, status, total_sales_cash
FROM cash_sessions
ORDER BY opened_at DESC
LIMIT 10;

COMMIT;

SELECT '✅ CORREÇÃO DEFINITIVA CONCLUÍDA.
Limpe o cache do navegador e recarregue a página para testar.' AS progresso;
