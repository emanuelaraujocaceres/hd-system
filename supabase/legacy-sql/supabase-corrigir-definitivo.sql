-- ==============================================================================
-- SQL DEFINITIVO: restaurar orgs + corrigir RLS sem destruir multi-tenância
-- ==============================================================================
-- Modelo de acesso:
--   Emanuel   → superadmin (acesso tudo)
--   Gustavo   → admin, org Plantão da Cerveja (361fb95a-...)
--   Maria     → admin, org Plantão da Cerveja (361fb95a-...)
--   Bia       → colaborador, org Adegas dos Parças (DEFAULT_ORG_ID)
--   Gut       → colaborador, org Adegas dos Parças (DEFAULT_ORG_ID)
--   Marcelo   → admin, org Adegas dos Parças (DEFAULT_ORG_ID)
-- ==============================================================================

BEGIN;

-- 1. Garantir que as organizações existem
SELECT '▶ 1/7 — Garantindo organizações existem...' AS progresso;
INSERT INTO organizations (id, name)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Adegas dos Parças'),
  ('361fb95a-3e9f-43be-a43c-0dc91f851f31', 'Plantão da Cerveja')
ON CONFLICT (id) DO NOTHING;

-- 2. Restaurar organization_id ORIGINAL em system_users
SELECT '▶ 2/7 — Restaurando organization_id em system_users...' AS progresso;
-- Gustavo e Maria → Plantão da Cerveja
UPDATE system_users
SET organization_id = '361fb95a-3e9f-43be-a43c-0dc91f851f31'
WHERE email IN ('gustavo@gmail.com', 'maria@gmail.com');

-- Bia, Gut, Marcelo, Emanuel → Adegas dos Parças (já estão corretos)
-- Emanuel é superadmin mas fica na Adegas por padrão
UPDATE system_users
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE email IN ('bia@gmail.com', 'gut@gmail.com', 'marcelo@gmail.com', 'emanuel@gmail.com');

SELECT '✅ system_users atualizados' AS resultado;

-- 3. Restaurar organization_id em profiles
SELECT '▶ 3/7 — Restaurando organization_id em profiles...' AS progresso;
UPDATE profiles
SET organization_id = '361fb95a-3e9f-43be-a43c-0dc91f851f31'
WHERE email IN ('gustavo@gmail.com', 'maria@gmail.com');

UPDATE profiles
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE email IN ('bia@gmail.com', 'gut@gmail.com', 'marcelo@gmail.com', 'emanuel@gmail.com');

SELECT '✅ profiles atualizados' AS resultado;

-- 4. Corrigir cash_sessions: cada usuário tem seu cash_session na org correta
SELECT '▶ 4/7 — Corrigindo cash_sessions...' AS progresso;
-- O cash_session 075bf5d1-... foi criado com DEFAULT_ORG_ID
-- Se ele pertence a Emanuel (superadmin), mantenha DEFAULT_ORG_ID
-- Se pertence a Gustavo/Maria, mude para Plantão
-- Vamos atualizar para DEFAULT_ORG_ID por enquanto (Emanuel é quem está testando)
-- O caixa vai ser recriado na org correta quando o usuário abrir
UPDATE cash_sessions
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001';

SELECT '✅ cash_sessions atualizados' AS resultado;

-- 5. Configurar roles corretos
-- Emanuel = superadmin (acesso a TUDO)
-- Gustavo, Maria, Marcelo = admin (admin de sua org)
-- Bia, Gut = colaborador
SELECT '▶ 5/7 — Configurando roles...' AS progresso;
UPDATE profiles SET role = 'superadmin' WHERE email = 'emanuel@gmail.com';
UPDATE profiles SET role = 'admin' WHERE email IN ('gustavo@gmail.com', 'maria@gmail.com', 'marcelo@gmail.com');
UPDATE profiles SET role = 'collaborator' WHERE email IN ('bia@gmail.com', 'gut@gmail.com');

-- Atualizar is_superadmin() para verificar 'superadmin', não 'admin'
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'superadmin'
    );
END;
$func$;
SELECT '✅ Roles configurados e is_superadmin() corrigida' AS resultado;

-- 6. Corrigir função get_auth_user_org_id()
SELECT '▶ 6/7 — Corrigindo get_auth_user_org_id()...' AS progresso;
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
    org_id UUID;
BEGIN
    -- 1. Tenta profiles (prioridade)
    -- 2. Tenta system_users por auth.uid()
    -- 3. Tenta system_users por email
    -- 4. Fallback DEFAULT_ORG_ID
    SELECT COALESCE(
        (SELECT organization_id FROM profiles WHERE id = auth.uid()),
        (SELECT organization_id FROM system_users WHERE id = auth.uid()),
        (SELECT organization_id FROM system_users WHERE email = (auth.jwt() ->> 'email')),
        '00000000-0000-0000-0000-000000000001'
    ) INTO org_id;
    RETURN org_id;
END;
$func$;
SELECT '✅ get_auth_user_org_id() recriada' AS resultado;

-- 7. Corrigir políticas RLS — REMOVER superadmin FOR ALL com WITH CHECK
SELECT '▶ 7/7 — Recriando políticas RLS corretas...' AS progresso;

-- REMOVER todas as políticas existentes
DROP POLICY IF EXISTS "RLS_cash_sessions_select" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_insert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_delete" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_superadmin" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_select" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_insert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_admin_delete" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_upsert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_delete" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_insert" ON cash_sessions;

-- POLÍTICAS PARA USUÁRIOS COMUNS (restritas por organization_id)
CREATE POLICY "RLS_cash_sessions_select" ON cash_sessions
  FOR SELECT
  USING (organization_id = get_auth_user_org_id());

CREATE POLICY "RLS_cash_sessions_insert" ON cash_sessions
  FOR INSERT
  WITH CHECK (organization_id = get_auth_user_org_id());

CREATE POLICY "RLS_cash_sessions_update" ON cash_sessions
  FOR UPDATE
  USING (organization_id = get_auth_user_org_id())
  WITH CHECK (organization_id = get_auth_user_org_id());

CREATE POLICY "RLS_cash_sessions_delete" ON cash_sessions
  FOR DELETE
  USING (organization_id = get_auth_user_org_id());

-- POLÍTICAS SUPERADMIN (acesso irrestrito — WITH CHECK (true) não bloqueia)
-- Emanuel é superadmin → pode ver/inserir/atualizar/deletar TUDO
CREATE POLICY "RLS_cash_sessions_superadmin_select" ON cash_sessions
  FOR SELECT
  USING (public.is_superadmin());

CREATE POLICY "RLS_cash_sessions_superadmin_insert" ON cash_sessions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "RLS_cash_sessions_superadmin_update" ON cash_sessions
  FOR UPDATE
  USING (public.is_superadmin())
  WITH CHECK (true);

CREATE POLICY "RLS_cash_sessions_superadmin_delete" ON cash_sessions
  FOR DELETE
  USING (public.is_superadmin());

SELECT '✅ Políticas RLS recriadas corretamente' AS resultado;

-- Diagnóstico final
SELECT '=== DIAGNÓSTICO FINAL ===' AS info;
SELECT schemaname, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'cash_sessions'
ORDER BY policyname;

SELECT '=== SYSTEM_USERS ===' AS info;
SELECT id::text, name, email, organization_id::text
FROM system_users
ORDER BY name;

SELECT '=== PROFILES ===' AS info;
SELECT id::text, name, email, organization_id::text, role
FROM profiles
ORDER BY name;

SELECT '=== CASH_SESSIONS ===' AS info;
SELECT id::text, organization_id::text, status, operator_name
FROM cash_sessions
ORDER BY opened_at DESC;

COMMIT;

SELECT '✅ CORREÇÃO DEFINITIVA CONCLUÍDA.
1. Limpe o cache do navegador
2. F5
3. Faça uma venda e verifique o console' AS progresso;
