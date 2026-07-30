-- ==============================================================================
-- CORREÇÃO: FORÇAR organization_id = DEFAULT_ORG_ID EM TODAS AS TABELAS
-- ==============================================================================
-- O get_auth_user_org_id() lê organization_id de profiles → system_users.
-- Se algum desses ainda tiver um UUID real (diferente de DEFAULT_ORG_ID),
-- a função retorna esse UUID real. Mas cash_sessions foi forçado para
-- DEFAULT_ORG_ID → UUID_real ≠ DEFAULT_ORG_ID → RLS bloqueia.
--
-- Esta SQL força DEFAULT_ORG_ID em system_users e profiles também.
-- ==============================================================================

BEGIN;

SELECT '▶ 1/3 — Forçando system_users para DEFAULT_ORG_ID...' AS progresso;
UPDATE system_users
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001';
SELECT '✅ system_users atualizados: ' || COUNT(*) || ' linhas'
FROM system_users
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

SELECT '▶ 2/3 — Forçando profiles para DEFAULT_ORG_ID...' AS progresso;
UPDATE profiles
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001';
SELECT '✅ profiles atualizados: ' || COUNT(*) || ' linhas'
FROM profiles
WHERE organization_id = '00000000-0000-0000-0000-000000000001';

SELECT '▶ 3/3 — Diagnóstico: o que get_auth_user_org_id() retorna...' AS progresso;

-- Teste: se houver algum auth user logado no editor, mostra o resultado
-- (No SQL Editor, auth.uid() retorna NULL, mas o SELECT em si testa a função)
SELECT 'get_auth_user_org_id() retorna: ' || COALESCE(get_auth_user_org_id()::text, 'NULL (sem auth context)');

-- Listar todos os cash_sessions
SELECT id::text, organization_id, status, total_sales_cash
FROM cash_sessions
ORDER BY opened_at DESC;

-- Listar system_users com seus orgs
SELECT id, name, email, organization_id
FROM system_users
ORDER BY name;

-- Listar profiles com seus orgs
SELECT id, organization_id, name, email
FROM profiles
ORDER BY name;

COMMIT;

SELECT '✅ CORREÇÃO CONCLUÍDA. Limpe o cache e recarregue a página para testar.' AS progresso;
