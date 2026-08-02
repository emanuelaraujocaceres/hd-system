-- ==============================================================================
-- CORREÇÃO DEFINITIVA: sync de system_users ↔ auth.users + profiles
-- ==============================================================================
-- O problema: system_users.id e profiles.id foram gerados pelo frontend
-- (StorageService.newId()), mas auth.uid() retorna o UUID do Supabase Auth,
-- que é diferente. Todas as RLS policies falham porque get_auth_user_org_id()
-- não encontra o usuário e retorna NULL.
--
-- Esta correção:
-- 1. Cria profiles com o UUID real do auth.users para cada usuário
-- 2. Corrige get_auth_user_org_id() com fallback por email
-- 3. Corrige is_superadmin() com fallback por email
-- ==============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 1: Criar profiles para cada system_user usando o UUID real do auth.users
-- ═══════════════════════════════════════════════════════════════════════════════
-- O auth.users está no schema `auth` e é acessível com a service_role key.
-- Como estamos rodando como postgres (SQL Editor), temos acesso.
INSERT INTO profiles (id, organization_id, name, email, role)
SELECT
  au.id,                       -- UUID real do Supabase Auth (= auth.uid())
  su.organization_id,
  su.name,
  su.email,
  COALESCE(su.role, 'admin')
FROM auth.users au
JOIN system_users su ON LOWER(au.email) = LOWER(su.email)
ON CONFLICT (id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role;

-- Mostra o que foi criado/atualizado
SELECT 'Profiles sincronizados:' AS msg, p.id, p.email, p.organization_id, su.name
FROM profiles p
JOIN system_users su ON su.email = p.email;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 2: get_auth_user_org_id() — com fallback por email + profiles corrigido
-- ═══════════════════════════════════════════════════════════════════════════════
-- Agora que profiles.id = auth.uid(), o primeiro SELECT já funciona.
-- Mantemos os fallbacks por segurança.
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    -- 1. profiles.id agora = auth.uid() (corrigido no PASSO 1)
    (SELECT organization_id FROM profiles WHERE id = auth.uid()),
    -- 2. Fallback: system_users pelo ID
    (SELECT organization_id FROM system_users WHERE id = auth.uid()),
    -- 3. Fallback: email do JWT
    (SELECT organization_id FROM system_users WHERE email = (auth.jwt() ->> 'email')),
    -- 4. Fallback: email normalizado (case-insensitive)
    (SELECT organization_id FROM system_users WHERE LOWER(email) = LOWER(auth.jwt() ->> 'email'))
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 3: is_superadmin() — também com fallback por email
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM system_users
    WHERE (id = auth.uid() OR LOWER(email) = LOWER(auth.jwt() ->> 'email'))
      AND superadmin = TRUE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_superadmin TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 4: get_is_superadmin() — mesma correção
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT superadmin FROM system_users WHERE id = auth.uid()),
    (SELECT superadmin FROM system_users WHERE LOWER(email) = LOWER(auth.jwt() ->> 'email')),
    FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_is_superadmin TO authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (rodo como postgres, então auth.uid() = NULL — esperado)
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'get_auth_user_org_id(): ' || public.get_auth_user_org_id() AS resultado
UNION ALL
SELECT 'is_superadmin(): ' || public.is_superadmin()
UNION ALL
SELECT 'get_is_superadmin(): ' || public.get_is_superadmin();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TESTE REAL: quando um usuário autenticado chamar, profiles.id = auth.uid()
-- e get_auth_user_org_id() vai retornar a organização correta.
-- Recarregue o app (F5) após executar este script.
-- ═══════════════════════════════════════════════════════════════════════════════
