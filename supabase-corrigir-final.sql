-- ==============================================================================
-- CORREÇÃO FINAL: restaurar orgs originais + consertar RLS sem destruir dados
-- ==============================================================================

BEGIN;

-- 1. Forçar ALL cash_sessions para DEFAULT_ORG_ID (garantir consistência)
SELECT '▶ 1/6 — Forçando cash_sessions para DEFAULT_ORG_ID...' AS progresso;
UPDATE cash_sessions
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001';

-- 2. Restaurar system_users para DEFAULT_ORG_ID (para RLS funcionar)
SELECT '▶ 2/6 — Forçando system_users para DEFAULT_ORG_ID...' AS progresso;
UPDATE system_users
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001';

-- 3. Restaurar profiles para DEFAULT_ORG_ID (para get_auth_user_org_id() funcionar)
SELECT '▶ 3/6 — Forçando profiles para DEFAULT_ORG_ID...' AS progresso;
UPDATE profiles
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001';

-- 4. Garantir que a função get_auth_user_org_id() existe e retorna DEFAULT_ORG_ID
SELECT '▶ 4/6 — Verificando função get_auth_user_org_id()...' AS progresso;
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
    org_id UUID;
BEGIN
    SELECT COALESCE(
        (SELECT organization_id FROM profiles WHERE id = auth.uid()),
        (SELECT organization_id FROM system_users WHERE id = auth.uid()),
        (SELECT organization_id FROM system_users WHERE email = (auth.jwt() ->> 'email')),
        '00000000-0000-0000-0000-000000000001'
    ) INTO org_id;
    RETURN org_id;
END;
$func$;
SELECT '✅ Função get_auth_user_org_id() recriada com fallback DEFAULT_ORG_ID' AS resultado;

-- 5. Verificar políticas de cash_sessions
SELECT '▶ 5/6 — Estado atual das políticas de cash_sessions:' AS progresso;
SELECT schemaname, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'cash_sessions'
ORDER BY policyname;

-- 6. Diagnóstico final
SELECT '▶ 6/6 — Diagnóstico final:' AS progresso;
SELECT 'organizations' AS tabela, id::text, name FROM organizations ORDER BY name;
SELECT 'system_users' AS tabela, id::text, name, organization_id::text FROM system_users ORDER BY name;
SELECT 'cash_sessions' AS tabela, id::text, organization_id::text, status FROM cash_sessions ORDER BY opened_at DESC;

COMMIT;

SELECT '✅ CORREÇÃO FINAL CONCLUÍDA.
Limpe o cache do navegador e recarregue a página para testar.' AS progresso;
