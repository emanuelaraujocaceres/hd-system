-- ==============================================================================
-- CORRIGIR ORGANIZATION_ID DAS CASH_SESSIONS
-- ==============================================================================
-- Problema: O arquivo supabase-solucao-pratica.sql forçou TODAS as cash_sessions
-- para DEFAULT_ORG_ID ('00000000-...'). Com o RLS agora ativado, usuários do
-- Plantão (org '361fb95a-...') não conseguem acessar suas próprias sessões de
-- caixa porque a policy exige organization_id = get_auth_user_org_id().
--
-- Fix: Atualizar cash_sessions para ter o organization_id correto da org do
-- operador (via profiles table), usando o user_id da sessão.
-- ==============================================================================

BEGIN;

SELECT '▶ 1/4 — Verificando organizações dos perfis...' AS progresso;
SELECT id, name, email, organization_id, role
FROM profiles
WHERE organization_id = '361fb95a-3e9f-43be-a43c-0dc91f851f31'
   OR organization_id = '00000000-0000-0000-0000-000000000001'
ORDER BY organization_id, name;

SELECT '▶ 2/4 — Corrigindo organization_id das cash_sessions...' AS progresso;

-- Atualiza cash_sessions para a organização correta do operador
UPDATE cash_sessions cs
SET organization_id = p.organization_id
FROM profiles p
WHERE cs.user_id = p.id
  AND cs.organization_id IS DISTINCT FROM p.organization_id;

SELECT '✅ Sessões corrigidas: ' || COUNT(*) || ' rows atualizados' AS resultado
FROM cash_sessions cs
JOIN profiles p ON cs.user_id = p.id
WHERE cs.organization_id = p.organization_id;

-- Mostra o estado atual após correção
SELECT '▶ 3/4 — Estado atual das cash_sessions:' AS info;
SELECT id::text, organization_id::text, user_id, status, operator_name, total_sales_cash
FROM cash_sessions
ORDER BY opened_at DESC;

SELECT '▶ 4/4 — Verificando políticas RLS:' AS info;
SELECT schemaname, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'cash_sessions'
ORDER BY policyname;

COMMIT;

SELECT '✅ ORGANIZAÇÃO DAS CASH_SESSIONS CORRIGIDA.
Limpe cache + F5 + teste.' AS progresso;
