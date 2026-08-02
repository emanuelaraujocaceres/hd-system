-- ==============================================================================
-- SQL DEFINITIVO (v2): restaurar orgs + corrigir RLS
-- ==============================================================================
-- Apenas correções, sem INSERT em organizations (já existem)

BEGIN;

-- 1. Restaurar organization_id em system_users
UPDATE system_users SET organization_id = '361fb95a-3e9f-43be-a43c-0dc91f851f31'
WHERE email IN ('gustavo@gmail.com', 'maria@gmail.com');

UPDATE system_users SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE email IN ('bia@gmail.com', 'gut@gmail.com', 'marcelo@gmail.com', 'emanuel@gmail.com');

-- 2. Restaurar organization_id e roles em profiles
UPDATE profiles SET organization_id = '361fb95a-3e9f-43be-a43c-0dc91f851f31'
WHERE email IN ('gustavo@gmail.com', 'maria@gmail.com');

UPDATE profiles SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE email IN ('bia@gmail.com', 'gut@gmail.com', 'marcelo@gmail.com', 'emanuel@gmail.com');

-- Roles: Emanuel = superadmin, Gustavo/Maria/Marcelo = admin, Bia/Gut = collaborator
UPDATE profiles SET role = 'superadmin' WHERE email = 'emanuel@gmail.com';
UPDATE profiles SET role = 'admin' WHERE email IN ('gustavo@gmail.com', 'maria@gmail.com', 'marcelo@gmail.com');
UPDATE profiles SET role = 'collaborator' WHERE email IN ('bia@gmail.com', 'gut@gmail.com');

-- 3. Recriar is_superadmin() para verificar 'superadmin' (não 'admin')
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

-- 4. Recriar get_auth_user_org_id() com fallback DEFAULT_ORG_ID
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

-- 5. Forçar ALL cash_sessions para DEFAULT_ORG_ID (Emanuel está testando)
UPDATE cash_sessions
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001';

-- 6. Recriar políticas RLS de cash_sessions
-- DROP ALL possible policies (including ones from previous partial runs)
DROP POLICY IF EXISTS "RLS_cash_sessions_select" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_insert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_delete" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_superadmin" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_superadmin_select" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_superadmin_insert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_superadmin_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_superadmin_delete" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_select" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_insert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_delete" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_upsert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_delete" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_insert" ON cash_sessions;

-- Políticas para usuários comuns
CREATE POLICY "RLS_cash_sessions_select" ON cash_sessions
  FOR SELECT USING (organization_id = get_auth_user_org_id());

CREATE POLICY "RLS_cash_sessions_insert" ON cash_sessions
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());

CREATE POLICY "RLS_cash_sessions_update" ON cash_sessions
  FOR UPDATE USING (organization_id = get_auth_user_org_id())
  WITH CHECK (organization_id = get_auth_user_org_id());

CREATE POLICY "RLS_cash_sessions_delete" ON cash_sessions
  FOR DELETE USING (organization_id = get_auth_user_org_id());

-- Políticas superadmin (WITH CHECK (true) não bloqueia usuários comuns)
CREATE POLICY "RLS_cash_sessions_superadmin_select" ON cash_sessions
  FOR SELECT USING (public.is_superadmin());

CREATE POLICY "RLS_cash_sessions_superadmin_insert" ON cash_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "RLS_cash_sessions_superadmin_update" ON cash_sessions
  FOR UPDATE USING (public.is_superadmin()) WITH CHECK (true);

CREATE POLICY "RLS_cash_sessions_superadmin_delete" ON cash_sessions
  FOR DELETE USING (public.is_superadmin());

-- Diagnóstico final
SELECT '=== POLÍTICAS ===' AS info;
SELECT schemaname, policyname, cmd, qual, with_check
FROM pg_policies WHERE tablename = 'cash_sessions' ORDER BY policyname;

SELECT '=== SYSTEM_USERS ===' AS info;
SELECT id::text, name, email, organization_id::text FROM system_users ORDER BY name;

SELECT '=== PROFILES ===' AS info;
SELECT id::text, name, email, organization_id::text, role FROM profiles ORDER BY name;

SELECT '=== CASH_SESSIONS ===' AS info;
SELECT id::text, organization_id::text, status, operator_name FROM cash_sessions ORDER BY opened_at DESC;

COMMIT;

SELECT '✅ PRONTO. Limpe cache + F5 + teste.' AS progresso;
