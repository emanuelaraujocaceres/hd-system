-- ==============================================================================
-- CORREÇÃO: FORÇAR organization_id = DEFAULT_ORG_ID + REMOVER SELF-SERVICE POLICIES
-- ==============================================================================
-- Problema original:
--   O erro 403 no upsert de cash_sessions persiste porque:
--   1. As políticas self-service (criadas no SQL anterior) NÃO têm WITH CHECK
--      explícito → PostgreSQL usa o USING como WITH CHECK.
--      WITH CHECK é AND entre todas as políticas → obriga user_id = auth.uid()
--      JUNTO com organization_id = get_auth_user_org_id().
--      user_id é o ID do system_users, NÃO auth.uid() → bloqueia.
--   2. As linhas EXISTENTES em cash_sessions têm organization_id de uma sessão
--      antiga (UUID real, não DEFAULT_ORG_ID). O Step 2 do SQL anterior só
--      corrigiu organization_id IS NULL → as linhas com UUID real não foram
--      tocadas.
--      RLS_cash_sessions_update (USING) checa organization_id = get_auth_user_org_id()
--      → REAL_UUID ≠ DEFAULT_ORG_ID → bloqueia o UPDATE.
-- ==============================================================================
-- Correções:
--   1. UPDATE ALL cash_sessions → organization_id = DEFAULT_ORG_ID
--   2. REMOVE as 3 self-service policies problemáticas
--   3. Diagnóstico para confirmar
-- ==============================================================================

BEGIN;

SELECT '▶ 1/3 — Forçando organization_id = DEFAULT_ORG_ID em ALL cash_sessions...' AS progresso;
UPDATE cash_sessions
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001';
SELECT '✅ Todas as cash_sessions atualizadas com DEFAULT_ORG_ID' AS resultado;

SELECT '▶ 2/3 — Removendo políticas self-service de cash_sessions...' AS progresso;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_upsert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_delete" ON cash_sessions;
SELECT '✅ Políticas removidas: RLS_cash_sessions_self_upsert, RLS_cash_sessions_self_update, RLS_cash_sessions_self_delete'
  AS resultado;

SELECT '▶ 3/3 — Diagnóstico: políticas restantes em cash_sessions:' AS progresso;
SELECT schemaname, policyname, cmd, permissive
FROM pg_policies
WHERE tablename = 'cash_sessions'
ORDER BY policyname;

SELECT '▶ Diagnóstico: amostra de cash_sessions com org:' AS progresso;
SELECT id, organization_id, status, user_id, total_cash
FROM cash_sessions
ORDER BY created_at DESC
LIMIT 5;

COMMIT;

SELECT '✅ CORREÇÃO CONCLUÍDA. Limpe o cache do navegador e recarregue a página para testar.
Se ainda houver erro, copie o console e o SQL acima para análise.' AS progresso;
