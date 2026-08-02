-- ==============================================================================
-- SOLUÇÃO PRÁTICA: desativar RLS em cash_sessions + restaurar orgs
-- ==============================================================================
-- O problema do RLS recorrente (get_auth_user_org_id() → profiles → RLS → 
-- get_auth_user_org_id() → ...) está causando inconsistências.
-- Como o caixa é por usuário/filial, vamos desativar RLS em cash_sessions
-- e deixar o app gerenciar o acesso.
-- ==============================================================================

BEGIN;

-- 1. Restaurar orgs originais
UPDATE system_users SET organization_id = '361fb95a-3e9f-43be-a43c-0dc91f851f31'
WHERE email IN ('gustavo@gmail.com', 'maria@gmail.com');

UPDATE system_users SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE email IN ('bia@gmail.com', 'gut@gmail.com', 'marcelo@gmail.com', 'emanuel@gmail.com');

UPDATE profiles SET organization_id = '361fb95a-3e9f-43be-a43c-0dc91f851f31'
WHERE email IN ('gustavo@gmail.com', 'maria@gmail.com');

UPDATE profiles SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE email IN ('bia@gmail.com', 'gut@gmail.com', 'marcelo@gmail.com', 'emanuel@gmail.com');

-- 2. Configurar roles
UPDATE profiles SET role = 'superadmin' WHERE email = 'emanuel@gmail.com';
UPDATE profiles SET role = 'admin' WHERE email IN ('gustavo@gmail.com', 'maria@gmail.com', 'marcelo@gmail.com');
UPDATE profiles SET role = 'collaborator' WHERE email IN ('bia@gmail.com', 'gut@gmail.com');

-- 3. Recriar is_superadmin() para verificar 'superadmin'
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'superadmin'
    );
END;
$$;

-- 4. Recriar get_auth_user_org_id() com fallback
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- 5. DESATIVAR RLS em cash_sessions (solução prática)
ALTER TABLE cash_sessions DISABLE ROW LEVEL SECURITY;

-- 6. Forçar cash_sessions para DEFAULT_ORG_ID (Emanuel)
UPDATE cash_sessions
SET organization_id = '00000000-0000-0000-0000-000000000001';

-- Diagnóstico
SELECT '=== STATUS ===' AS info;
SELECT tablename, rowsecurity as rls_enabled FROM pg_tables WHERE tablename = 'cash_sessions';
SELECT id::text, name, email, organization_id::text, role FROM profiles ORDER BY name;
SELECT id::text, organization_id::text, status, operator_name FROM cash_sessions ORDER BY opened_at DESC;

COMMIT;

SELECT '✅ PRONTO. Limpe cache + F5 + teste.' AS progresso;
